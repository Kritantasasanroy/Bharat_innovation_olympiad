from openpyxl import load_workbook
from pathlib import Path
import re

ROOT = Path(r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad")

def normalize(s: str) -> str:
    # Replace escaped JS chars with literal chars for comparison
    s = s.replace("\\'", "'").replace('\\"', '"').replace("\\\\", "\\")
    # Collapse whitespace including newlines to single space
    s = re.sub(r"\s+", " ", s).strip()
    return s

def search_in_source(source: str, target: str, fuzzy=False) -> bool:
    norm_src = normalize(source)
    norm_tgt = normalize(target)
    # Do a literal search first
    if norm_tgt in norm_src:
        return True
    if not fuzzy:
        return False
    # Fuzzy: each word? expensive. Skip.
    return False

def split_content(current: str, source: str):
    """Return list of parts if the content appears to be a combination."""
    if " - " in current:
        full = normalize(source)
        if normalize(current) not in full:
            return current.split(" - ", 1)
    if ": " in current:
        full = normalize(source)
        if normalize(current) not in full:
            # Use a limited split: only if first part is a short label
            parts = current.split(": ", 1)
            # Heuristic: if first part is short (<=30) and source has property label
            if len(parts[0]) <= 30:
                return parts
    return [current]

wb = load_workbook(ROOT / "STUDENT_PORTAL_CONTENT_CATALOG.xlsx", data_only=True)
ws = wb["Student Content"]
headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
file_idx = headers.index("Code File")
content_idx = headers.index("Current Content")
area_idx = headers.index("Area / Page / Feature")
loc_idx = headers.index("Line(s) / Searchable Location")

mismatches = []
for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    rel_file = row[file_idx]
    current = row[content_idx] or ""
    if not rel_file or not current:
        continue
    file_path = ROOT / rel_file
    if not file_path.exists():
        mismatches.append((i, rel_file, current, "FILE NOT FOUND"))
        continue
    source = file_path.read_text(encoding="utf-8")
    parts = split_content(current, source)
    missing = []
    for p in parts:
        if not search_in_source(source, p):
            missing.append(p)
    if missing:
        mismatches.append((i, rel_file, current, " | ".join(repr(m) for m in missing)))

print(f"Mismatches: {len(mismatches)} / {ws.max_row - 1}")
for i, rel, current, reason in mismatches[:100]:
    print(f"\nRow {i}: {rel}")
    print(f"  Current: {current!r}")
    print(f"  Missing part: {reason}")
