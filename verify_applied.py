import json, re, os
from pathlib import Path

ROOT = Path(r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad")

def norm(s):
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\$\{[^}]+\}", "", s)
    s = s.replace("&amp;", "&").replace("&quot;", '"').replace("&#39;", "'").replace("&apos;", "'")
    return s.strip()

def main():
    rows = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    missing = []
    for r in rows:
        new = r.get("New Content")
        if not new:
            continue
        fp = ROOT / r["Code File"]
        if not fp.exists():
            missing.append((r["row"], r["Code File"], "file not found"))
            continue
        text = fp.read_text(encoding="utf-8")
        n = norm(new)
        if not n:
            continue
        frags = [f.strip() for f in n.split(" - ") if len(f.strip()) > 12]
        if not frags:
            frags = [n]
        found = any(f in text for f in frags)
        if not found:
            # try the longest fragment from current
            cur = r.get("Current Content", "")
            cf = [f.strip() for f in norm(cur).split(" - ") if len(f.strip()) > 12]
            for f in cf:
                if f in text:
                    found = True
                    break
        if not found:
            missing.append((r["row"], r["Code File"], new[:80]))
    print(f"missing count: {len(missing)}")
    for m in missing:
        print(m)

if __name__ == "__main__":
    main()
