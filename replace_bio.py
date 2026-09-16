import re
from pathlib import Path

ROOT = Path(r"C:\KSR\Lemon Ideas\Bharat_innovation_olympiad")

# Directories to scan for user-facing copy
target_dirs = [
    ROOT / "frontend" / "src",
    ROOT / "admin-frontend" / "src",
    ROOT / "apps",
    ROOT / "backend" / "src",
]

# Files / patterns to skip entirely (code identifiers, tokens, IDs, tests)
skip_paths = [
    "auth.service.ts",              # Admin seed: lastName: 'BIO'
    "access-token.ts",
    "access-token.spec.ts",
    "roll-number.ts",
    "roll-number.spec.ts",
    "certificate-number.ts",
    "certificate-number.spec.ts",
    "school-directory.helpers.spec.ts",
    ".spec.ts",
    ".test.ts",
]

def should_skip(path: Path) -> bool:
    rel = path.as_posix()
    for part in skip_paths:
        if part in rel:
            return True
    return False

# BIO -> Innovation Olympiad, but not when it is part of an access/certificate/roll prefix.
# Skip BIO-SCH, BIO-PTR, BIO-2026, BIO26, BIO<YY>, and BIO followed by digits/hyphen prefix.
bio_re = re.compile(
    r"(?<![A-Za-z0-9-])"
    r"BIO"
    r"(?!"
    r"[A-Za-z]|"            # not followed by another letter (e.g. BIOS, but there shouldn't be any)
    r"-SCH|"                # access token prefix
    r"-PTR|"                # partner token prefix
    r"-\d|"                 # e.g. BIO-2026, BIO-26
    r"\d|"                  # e.g. BIO26
    r"<"                    # e.g. BIO<YY>
    r")",
    re.IGNORECASE if False else 0,
)

# Specific lowercase placeholders in new apps
extra_replacements = {
    ROOT / "apps" / "exam-web" / "index.html": ("bio-exam", "Innovation Olympiad Exam"),
    ROOT / "apps" / "exam-web" / "src" / "App.tsx": ("bio-exam", "Innovation Olympiad Exam"),
    ROOT / "apps" / "admin-web" / "index.html": ("bio-admin", "Innovation Olympiad Admin"),
    ROOT / "apps" / "admin-web" / "src" / "features" / "ops" / "ops.routes.tsx": ("bio-admin", "Innovation Olympiad admin"),
}

changed = []

for base in target_dirs:
    if not base.exists():
        continue
    for path in base.rglob("*"):
        if not path.is_file():
            continue
        if should_skip(path):
            continue
        if path.suffix not in {".ts", ".tsx", ".css", ".js", ".jsx"}:
            continue
        text = path.read_text(encoding="utf-8")
        new_text, n = bio_re.subn("Innovation Olympiad", text)
        if n:
            path.write_text(new_text, encoding="utf-8")
            changed.append(f"{path.relative_to(ROOT)}: {n} replacement(s)")

# Second pass: specific lowercase placeholders
for path, (old, new) in extra_replacements.items():
    if path.exists():
        text = path.read_text(encoding="utf-8")
        if old in text:
            new_text = text.replace(old, new)
            path.write_text(new_text, encoding="utf-8")
            changed.append(f"{path.relative_to(ROOT)}: placeholder '{old}' -> '{new}'")

print(f"Made changes in {len(changed)} file(s):")
for c in changed:
    print(f"  {c}")
