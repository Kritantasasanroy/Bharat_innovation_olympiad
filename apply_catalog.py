import json
import re
import subprocess
from pathlib import Path
from collections import defaultdict
from bisect import bisect_left
import difflib

ROOT = Path(r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad")


def build_utf16_map(text):
    """Return list where node_pos[i] is the UTF-16 code-unit offset at Python index i."""
    offsets = [0]
    for ch in text:
        offsets.append(offsets[-1] + (2 if ord(ch) > 0xFFFF else 1))
    return offsets


def utf16_to_python(offsets, node_pos):
    i = bisect_left(offsets, node_pos)
    if i < len(offsets) and offsets[i] == node_pos:
        return i
    # Boundary falls inside a surrogate pair; return the leading index.
    return i

# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
def extract_file(file_path):
    script = ROOT / "extract_ts_text.js"
    result = subprocess.run(
        ["node", str(script), str(file_path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        raise RuntimeError(f"Extractor failed for {file_path}: {result.stderr}")
    with open(file_path, "rb") as f:
        text = f.read().decode("utf-8")
    return json.loads(result.stdout), text


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
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


def match_key(s):
    return normalize(s).replace("×", "x").replace("…", "...").replace("’", "'").replace("“", '"').replace("”", '"')


CONTENT_PROP_KEYS = {
    "title", "body", "what", "fix", "reason", "detail", "heading", "label", "value",
    "intro", "outro", "encouragement",
}


def is_content_item(it):
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
            return True
    return False


def parse_loc(loc):
    m = re.match(r"(\d+)(?:-(\d+))?", str(loc or ""))
    if not m:
        return None, None
    return int(m.group(1)), int(m.group(2) or m.group(1))


# ---------------------------------------------------------------------------
# Group construction
# ---------------------------------------------------------------------------
def item_key(it):
    p = it.get("path", [])
    return p[-1] if p else None


def content_items_in_range(items, start, end):
    """Return content items whose first line is within the range and that end near it."""
    return [
        it for it in items
        if (start - 1 <= it["startLine"] <= end + 1)
        and (it["endLine"] <= end + 2)
        and (it["startLine"] >= start - 1)
    ]


def build_combined(group, current=None):
    if len(group) == 1:
        return group[0]["value"]

    cur = current or ""
    keys = [item_key(it) for it in group]

    if " / " in cur:
        return " / ".join(it["value"] for it in group)

    if " - " in cur:
        if len(group) >= 3 and keys[0] == "title" and keys[1] in ("what", "reason"):
            return group[0]["value"] + " - " + group[1]["value"].strip() + " " + group[2]["value"].strip()
        return group[0]["value"] + " - " + group[1]["value"]

    if ": " in cur:
        return group[0]["value"] + ": " + group[1]["value"]

    return "".join(it["value"] for it in group)


def find_group(items, match_text, line_start, line_end, max_size=8):
    if not match_text:
        return None
    target = match_key(match_text)

    if line_start and line_end:
        candidates = content_items_in_range(items, line_start, line_end)
    else:
        candidates = [it for it in items if is_content_item(it)]

    candidates = [it for it in candidates if is_content_item(it)]
    candidates.sort(key=lambda x: x["start"])

    best = None
    best_score = 0.0
    for i in range(len(candidates)):
        for k in range(1, min(max_size, len(candidates) - i + 1)):
            group = candidates[i:i + k]
            combined = build_combined(group, match_text)
            mk = match_key(combined)
            if mk == target:
                return group
            score = difflib.SequenceMatcher(None, mk, target).ratio()
            if score > best_score and score >= 0.9:
                best_score = score
                best = group
    return best


def fallback_find_group(text, items, match_text, target):
    """Find a single content item whose value contains a long static fragment of match_text."""
    # Pick the longest non-placeholder, non-variable fragment of the current text.
    fragments = [match_key(f) for f in re.split(r"\$\{[^}]+\}", match_text)]
    fragments = [f for f in fragments if len(f) >= 12]
    if not fragments:
        return None
    fragments.sort(key=lambda x: -len(x))

    best_group = None
    best_score = 0.0
    for frag in fragments:
        for it in items:
            if not is_content_item(it):
                continue
            if it["kind"] == "jsxSpace":
                continue
            val = match_key(it.get("value", ""))
            if frag in val or match_key(match_text) in val:
                group = (it,)
                mk = match_key(it["value"])
                target_key = match_key(match_text)
                if mk == target_key:
                    return group
                score = difflib.SequenceMatcher(None, mk, target_key).ratio()
                if score > best_score and score >= 0.7:
                    best_score = score
                    best_group = group
    return best_group


# ---------------------------------------------------------------------------
# Raw source builders
# ---------------------------------------------------------------------------
def get_quote(raw):
    if raw.startswith('"'):
        return '"'
    if raw.startswith("'"):
        return "'"
    if raw.startswith("`"):
        return "`"
    return '"'


def escape_string(s, quote):
    s = s.replace("\\", "\\\\")
    if quote == '"':
        s = s.replace('"', '\\"')
    else:
        s = s.replace("'", "\\'")
    return s


def escape_template_body(s):
    return s.replace("`", "\\`")


def escape_jsx_text(s):
    s = s.replace("&", "&amp;")
    s = s.replace("<", "&lt;")
    s = s.replace("{", "{'{'}")
    s = s.replace("}", "{'}'}")
    return s


def build_new_raw(item, new_text):
    kind = item["kind"]
    if kind == "jsxSpace":
        return item["raw"]
    if kind in ("string", "template"):
        if re.search(r"\$\{[^}]+\}", new_text):
            return "`" + escape_template_body(new_text) + "`"
        quote = get_quote(item["raw"])
        return quote + escape_string(new_text, quote) + quote
    if kind == "jsxText":
        raw = item["raw"]
        m = re.match(r"^(\s*)(.*?)(\s*)$", raw, re.DOTALL)
        leading, _, trailing = m.groups()
        inner = new_text
        if leading and inner.startswith(" "):
            inner = inner[1:]
        if trailing and inner.endswith(" "):
            inner = inner[:-1]
        return leading + escape_jsx_text(inner) + trailing
    if kind == "jsxExpr":
        m = re.match(r"\$\{(.+)\}$", new_text)
        if m:
            return "{" + m.group(1) + "}"
        return "{" + json.dumps(new_text, ensure_ascii=False) + "}"
    raise ValueError(f"Unknown item kind {kind}")


# ---------------------------------------------------------------------------
# Split a target across a group
# ---------------------------------------------------------------------------
def split_target(target, group, current=None):
    if len(group) == 1:
        return [target]

    cur = current or ""
    keys = [item_key(it) for it in group]

    if " / " in cur:
        parts = target.split(" / ")
        if len(parts) == len(group):
            return parts
        raise ValueError("unexpected split count")

    if ": " in cur:
        if ": " in target:
            head, rest = target.split(": ", 1)
            return [head, rest]
        # If the updated text omits the label, keep the old label and update the value.
        return [group[0]["value"], target]

    if " - " in cur:
        if len(group) == 2 and (keys[0] == "title" or keys[0] == "heading"):
            if " - " in target:
                head, rest = target.split(" - ", 1)
                return [head, rest]
            return [group[0]["value"], target]

        if len(group) == 3 and keys[0] == "title" and keys[1] in ("what", "reason"):
            title, rest = target.split(" - ", 1)
            old2 = normalize(group[1]["value"])
            old3 = normalize(group[2]["value"])
            rest_norm = normalize(rest)

            if old3 and rest_norm.endswith(old3):
                split = len(rest) - len(old3)
                return [title, rest[:split].rstrip(), rest[split:].lstrip()]
            if old2 and rest_norm.startswith(old2):
                split = len(old2)
                return [title, rest[:split].rstrip(), rest[split:].lstrip()]

            if keys[2] == "fix":
                parts = [p for p in rest.split(". ") if p]
                if len(parts) >= 2:
                    return [title, ". ".join(parts[:-1]) + ".", parts[-1]]
                return [title, rest, ""]

            parts = [p for p in rest.split(". ") if p]
            if len(parts) >= 2:
                return [title, parts[0] + ".", ". ".join(parts[1:])]
            return [title, rest, ""]

    return split_target_by_placeholders(target, group)


def split_target_by_placeholders(target, group):
    jsx_space = {i for i, it in enumerate(group) if it["kind"] == "jsxSpace"}
    non_space = [(i, it) for i, it in enumerate(group) if i not in jsx_space]

    # dynamic placeholders with their variable
    dyn = []
    for i, it in non_space:
        if it["kind"] == "jsxExpr":
            m = re.search(r"[A-Za-z_]\w*", it["value"])
            var = m.group(0) if m else None
            dyn.append((i, it, it["value"], var))
        elif it["kind"] == "template" and re.match(r"\$\{[^}]+\}$", it["value"]):
            m = re.search(r"[A-Za-z_]\w*", it["value"])
            var = m.group(0) if m else None
            dyn.append((i, it, it["value"], var))

    if not dyn:
        return split_static_target(target, group, non_space)

    # Find target placeholders and their variables
    target_phs = [(m.start(), m.end(), m.group(0), re.search(r"[A-Za-z_]\w*", m.group(0)).group(0) if re.search(r"[A-Za-z_]\w*", m.group(0)) else None)
                for m in re.finditer(r"\$\{([^}]+)\}", target)]

    pieces = {}
    used = set()
    for i, it, src_ph, src_var in dyn:
        chosen = None
        for idx, (ts, te, tph, tvar) in enumerate(target_phs):
            if idx in used:
                continue
            if src_var and tvar == src_var:
                chosen = idx
                break
        if chosen is None:
            return [target if j == 0 else "" for j, _ in enumerate(group)]

        ts, te, tph, _ = target_phs[chosen]
        used.add(chosen)

        before = target[:ts]
        for j in range(len(non_space) - 1, -1, -1):
            pi, pit = non_space[j]
            if pit["kind"] not in ("jsxExpr", "template"):
                if pi < i:
                    pieces[pi] = pieces.get(pi, "") + before
                    break
        pieces[i] = tph
        target = target[te:]

    if target:
        for j in range(len(non_space) - 1, -1, -1):
            pi, pit = non_space[j]
            if pit["kind"] not in ("jsxExpr", "template"):
                pieces[pi] = pieces.get(pi, "") + target
                break

    out = []
    for j, it in enumerate(group):
        if j in jsx_space:
            out.append(it["value"])
        else:
            out.append(pieces.get(j, it["value"]))
    return out


def split_static_target(target, group, non_space):
    pieces = {}
    remaining = target
    for idx, (i, it) in enumerate(non_space):
        if idx == len(non_space) - 1:
            pieces[i] = remaining
            break
        old = it["value"].strip()
        next_old = non_space[idx + 1][1]["value"].strip()
        split_pos = -1
        if remaining.startswith(old):
            split_pos = len(old)
        else:
            first_word = next_old.split()[0] if next_old.split() else None
            if first_word:
                m = re.search(r"(?<=[\.\?!])\s+" + re.escape(first_word), remaining)
                if m:
                    split_pos = m.start()
                else:
                    m = re.search(r"\s+" + re.escape(first_word), remaining)
                    if m:
                        split_pos = m.start()
        if split_pos == -1:
            split_pos = len(remaining) // 2
        pieces[i] = remaining[:split_pos].rstrip()
        remaining = remaining[split_pos:].lstrip()

    out = []
    for i, it in enumerate(group):
        if it["kind"] == "jsxSpace":
            out.append(it["value"])
        else:
            out.append(pieces.get(i, it["value"]))
    return out


# ---------------------------------------------------------------------------
# Compute edits for a group
# ---------------------------------------------------------------------------
def group_edits(group, target, current=None):
    if len(group) == 1:
        it = group[0]
        return [(it["start"], it["end"], build_new_raw(it, target))]

    combined = build_combined(group, current)
    if match_key(combined) == match_key(target):
        return []

    try:
        parts = split_target(target, group, current)
    except Exception:
        parts = split_target_by_placeholders(target, group)

    return [(it["start"], it["end"], build_new_raw(it, part)) for it, part in zip(group, parts)]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    mismatches = json.loads((ROOT / "mismatches.json").read_text(encoding="utf-8")) if (ROOT / "mismatches.json").exists() else []
    mismatch_by_row = {m["row"]: m for m in mismatches}

    by_file = defaultdict(list)
    for row in catalog:
        by_file[row["Code File"]].append(row)

    failures = []
    updated_files = set()

    for rel_file, rows in by_file.items():
        file_path = ROOT / rel_file
        if not file_path.exists():
            failures.append(f"{rel_file}: file not found")
            continue

        items, text = extract_file(file_path)
        all_edits = []

        for row in rows:
            target = str(row.get("New Content") or "").strip()
            if not target or target.lower() in ("ok", "okay"):
                continue

            mm = mismatch_by_row.get(row["row"])
            match_text = mm.get("source") if mm and mm.get("source") else row.get("Current Content") or ""

            line_start, line_end = parse_loc(row.get("Line(s) / Searchable Location"))
            group = find_group(items, match_text, line_start, line_end)
            if group is None:
                failures.append(f"{rel_file} row {row['row']}: no group matched")
                continue

            current = row.get("Current Content")
            try:
                edits = group_edits(group, target, current)
                all_edits.extend(edits)
            except Exception as e:
                failures.append(f"{rel_file} row {row['row']}: {e}")

        # Apply edits in reverse start order; skip overlapping lower-priority edits.
        all_edits.sort(key=lambda x: x[0], reverse=True)
        offsets = build_utf16_map(text)
        last_end = None
        for s, e, raw in all_edits:
            if last_end is not None and e > last_end:
                # overlap with a previous (later in file) edit; skip
                continue
            py_s = utf16_to_python(offsets, s)
            py_e = utf16_to_python(offsets, e)
            if py_s < 0 or py_e > len(text) or py_s >= py_e:
                continue
            text = text[:py_s] + raw + text[py_e:]
            last_end = s

        with open(file_path, "rb") as f:
            original = f.read().decode("utf-8")
        if text != original:
            with open(file_path, "wb") as f:
                f.write(text.encode("utf-8"))
            updated_files.add(rel_file)

    print(f"Updated {len(updated_files)} files")
    if failures:
        print(f"Failures ({len(failures)}):")
        for f in failures[:40]:
            print(f"  {f}")
        if len(failures) > 40:
            print(f"  ... and {len(failures) - 40} more")

    (ROOT / "apply_failures.txt").write_text("\n".join(failures), encoding="utf-8")


if __name__ == "__main__":
    main()
