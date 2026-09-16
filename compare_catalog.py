import json
import subprocess
from pathlib import Path
import re
import sys
from collections import defaultdict

ROOT = Path(r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad")
OUT = ROOT / "compare_output.txt"

sys.stdout = open(OUT, "w", encoding="utf-8", errors="replace")
sys.stderr = sys.stdout

def decode_entities(s):
    return (
        s.replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&ldquo;", '"')
        .replace("&rdquo;", '"')
        .replace("&quot;", '"')
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
    )


def normalize(s):
    s = decode_entities(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


CONTENT_PROP_KEYS = {
    "title", "body", "what", "fix", "reason", "detail", "heading", "label", "value", "intro", "outro",
}


def extract_file(file_path):
    script = ROOT / "extract_ts_text.js"
    result = subprocess.run(
        ["node", str(script), str(file_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        print(f"Extractor failed for {file_path}: {result.stderr}", file=sys.stderr)
        return []
    return json.loads(result.stdout)


def parse_location(loc):
    if not loc:
        return None, None
    loc = str(loc).strip()
    if "-" in loc:
        a, b = loc.split("-", 1)
        try:
            return int(a.strip()), int(b.strip())
        except ValueError:
            return None, None
    try:
        n = int(loc)
        return n, n
    except ValueError:
        return None, None


def is_content_item(it, file_path=None):
    kind = it["kind"]
    if kind in ("jsxText", "jsxExpr", "jsxSpace"):
        return True
    if kind in ("string", "template"):
        path = it.get("path") or []
        if path and path[-1] in CONTENT_PROP_KEYS:
            return True
        if not path:
            val = it.get("value", "")
            if val.startswith("@/") or "/" in val or val in ("use client",):
                return False
            if len(val) <= 3:
                return False
            if file_path and file_path.suffix == ".ts" and len(val) > 3:
                return True
            return False
        return False
    return False


def infer_join(items):
    """Given a list of content items, decide how to join their values.
    Returns a tuple (head_idx, [rest_idx], separator_between_head_and_rest, rest_joiner)."""
    if len(items) == 1:
        return 0, [], None, None

    keys = [it.get("path", [])[-1] if it.get("path") else None for it in items]

    # label/value
    if len(items) >= 2 and keys[0] == "label" and keys[1] == "value":
        return 0, [1], ": ", None

    # heading/body
    if len(items) == 2 and keys[0] == "heading" and keys[1] == "body":
        return 0, [1], " - ", None

    # title/body
    if len(items) == 2 and keys[0] == "title" and keys[1] == "body":
        return 0, [1], " - ", None

    # intro/outro single
    if len(items) == 1 and keys[0] in ("intro", "outro"):
        return 0, [], None, None

    # title/what/fix or title/reason/detail
    if len(items) == 3 and keys[0] == "title":
        return 0, [1, 2], " - ", " "

    # fallback: if current row is a single string (passed in), just concatenate
    return 0, list(range(1, len(items))), "", ""


def source_combined_for_range(items, start, end, file_path=None, current=None):
    filtered = [
        it for it in items
        if start <= it["startLine"] <= end and start <= it["endLine"] <= end
    ]
    if not filtered:
        return None
    filtered.sort(key=lambda x: x["start"])
    content = []
    for it in filtered:
        if not is_content_item(it, file_path):
            continue
        if it["kind"] == "jsxText" and not it["value"].strip():
            continue
        content.append(it)
    if not content:
        return None

    # Drop trailing whitespace-only jsxText/spaces that just end a block.
    while content and content[-1]["kind"] == "jsxText" and not content[-1]["value"].strip():
        content.pop()

    if len(content) == 1:
        return normalize(content[0]["value"])

    head_idx, rest_idx, head_sep, rest_sep = infer_join(content)
    head = content[head_idx]["value"]
    rest_parts = [content[i]["value"] for i in rest_idx]
    if rest_sep is not None:
        rest = rest_sep.join(rest_parts)
    else:
        rest = "".join(rest_parts)
    combined = head
    if head_sep is not None:
        combined += head_sep + rest
    else:
        combined += rest
    return normalize(combined)


def main():
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    by_file = defaultdict(list)
    for row in catalog:
        by_file[row["Code File"]].append(row)

    mismatches = []
    for rel_file, rows in by_file.items():
        file_path = ROOT / rel_file
        if not file_path.exists():
            for r in rows:
                mismatches.append({"row": r["row"], "file": rel_file, "current": r["Current Content"], "reason": "FILE NOT FOUND"})
            continue
        items = extract_file(file_path)
        for r in rows:
            start, end = parse_location(r.get("Line(s) / Searchable Location"))
            current = r.get("Current Content") or ""
            new = str(r.get("New Content") or "").strip()
            if not current or not start:
                continue
            # Skip pass-through variables
            if re.match(r"^\$\{[\w.]+\}$", current.strip()):
                continue
            # Use New Content when it is filled and not "ok" / "okay".
            # If New Content is empty or says ok, this row is intentionally unchanged.
            if not new or new.lower() in ("ok", "okay"):
                continue
            target = new
            src = source_combined_for_range(items, start, end, file_path, current)
            if src is None:
                mismatches.append({"row": r["row"], "file": rel_file, "loc": f"{start}-{end}", "current": current, "new": target, "reason": "NO_SOURCE_CONTENT"})
                continue
            if normalize(src) != normalize(target):
                mismatches.append({
                    "row": r["row"],
                    "file": rel_file,
                    "loc": f"{start}-{end}",
                    "current": current,
                    "new": target,
                    "source": src,
                    "reason": "DIFFER",
                })

    print(f"Mismatches: {len(mismatches)} / {len(catalog)}")
    for m in mismatches:
        print(f"\nRow {m['row']} ({m.get('loc', '')}): {m['file']}")
        print(f"  Current: {m['current']!r}")
        print(f"  Source:  {m.get('source')!r}")
        print(f"  Reason:  {m['reason']}")

    (ROOT / "mismatches.json").write_text(json.dumps(mismatches, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote mismatches to {ROOT / 'mismatches.json'}")


if __name__ == "__main__":
    main()
