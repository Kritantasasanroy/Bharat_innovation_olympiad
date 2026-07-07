# steering/

Team-authored golden principles the AI agents read when working inside a stamped workbench.

This directory is **template-owned**. Changes go via PR to the `ai-workbench` template repo and are reviewed by CODEOWNERS (Architecture Council, QA Council, Director of Engineering). Stamped workbenches pick up changes through `update.wb`.

Team-local overrides live in `steering.local/` (user-owned, per-workbench).

---

## Layers (progressive disclosure)

| Layer | Path | When loaded | Budget |
|---|---|---|---|
| 0 — Golden | `steering/golden-principles/` | Every session, always | ~800 tokens |
| 1 — Role | `steering/roles/<dev\|qa\|po\|uxd>/` | When the agent enters that role (per CLAUDE.md role-inference table) | ~1500 tokens each |
| 2 — Artifact | `steering/artifacts/<type>/` | When a skill produces that artifact type (skill step 0) | ~3000 tokens each |
| 2 — Topic | `steering/topics/<slug>/` | When a skill declares the topic in its frontmatter, or an agent pulls on demand | variable |

---

## Rule file format

Every rule is a separate markdown file with YAML frontmatter. One file per rule.

```markdown
---
id: PRD-001
title: ACs must be testable
scope: artifact:prd
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [quality, testability]
---
**Rule:** Every AC must be verifiable by an automated test or an observable
signal (metric, log event, queue depth).

**Why:** ACs that cannot be verified cannot be used as a gate, and we have
seen stories silently regress because their ACs were subjective.

**How to apply:**
- Cross-check each AC against the BDD `@happy-path` or `@error` scenarios.
- If an AC relies on a human feeling or opinion, rewrite or drop it.

**Anti-pattern:** "Users should feel confident about their action."
```

**Frontmatter fields (required):** `id`, `title`, `scope`, `owner`, `created`.
**Frontmatter fields (optional):** `updated`, `tags`, `supersedes`, `removes` (overlay-only).

---

## Overlays (`steering.local/`)

Team-local customisations. Three operations:

**Add** — drop a new file with a new ID using the `-LOCAL-NN` suffix.
```
steering.local/artifacts/prd/PRD-LOCAL-01-licensing-section.md
```

**Supersede** — drop a new file with an explicit `supersedes:` list. The overlay rule replaces the named template rules at load time.
```markdown
---
id: PRD-LOCAL-02
title: ACs must be measurable AND time-boxed in staging
scope: artifact:prd
owner: team-payments
created: 2026-04-24
supersedes: [PRD-007]
---
...
```

**Remove** — drop a sidecar named `<ID>.removed.md` with `removes:` in frontmatter. The named template rules are dropped from the loaded ruleset.
```markdown
---
id: PRD-003.removed
removes: [PRD-003]
owner: team-payments
created: 2026-04-24
reason: "Does not apply for payment flows; see PRD-LOCAL-02."
---
```

Overlay IDs must use the `-LOCAL-NN` suffix. The linter enforces this.

---

## Loader

`scripts/steering-load.py <scope>` walks `steering/` + `steering.local/`, applies overlay semantics, and emits a single merged markdown blob ordered by rule ID. Use it, do not try to merge in your head.

```bash
scripts/steering-load.py golden
scripts/steering-load.py role:qa
scripts/steering-load.py artifact:prd
scripts/steering-load.py topic:api-design
```

Agents are expected to run the loader at every invocation point listed in `steering/config.yaml`. See that file for the authoritative list.

### Cache

Rendered output is cached at `.workbench-state/steering-cache/<scope>.cache`, keyed by an mtime+size fingerprint over every file in `steering/<rel>/` and `steering.local/<rel>/`. Editing, adding, or removing any rule file flips the fingerprint and the next call regenerates. The cache directory is gitignored.

Bypass options when needed:

```bash
scripts/steering-load.py golden --no-cache       # one-shot bypass
WB_STEERING_NO_CACHE=1 scripts/steering-load.py role:qa   # session-wide bypass
scripts/steering-load.py --clear-cache           # wipe the cache dir
```

Cache writes are best-effort. The loader always returns correct content; failure to write the cache (read-only filesystem, permission denied) is silently swallowed.

---

## Validation

`scripts/steering-lint.py` checks frontmatter schema, unique IDs, ID regex, and overlay-only field placement. The template repo's CI runs this on every PR; run it locally before raising a PR.

```bash
scripts/steering-lint.py
```

---

## Authoring responsibilities

- **Golden principles + dev/PO roles + engineering artifacts + topics** → Architecture Council.
- **QA role + QA artifacts (bdd, test-cases, test-spec)** → QA Council.
- **PRD artifact** → Architecture Council + Director of Engineering.
- **UX role** → UX Council.

CODEOWNERS in `.github/CODEOWNERS` gate PR merges per directory.

Teams raise **promotion PRs** when a `steering.local/` override has earned its stripes and should become upstream: port the file from `steering.local/<path>/<ID>.md` to `steering/<path>/<ID>.md` with the `-LOCAL` suffix stripped.

---

## Drift visibility

- **M1 (local):** `pmo-status` lists local overrides in the current workbench.
- **M2 (org-wide):** weekly Monday GitHub Action in the template repo queries the org for all repos with topic `ai-workbench`, reads each `steering.local/`, and posts a digest issue. See `docs/steering/setup.md` for GitHub App install steps.
- **M3 (promotion):** teams raise promotion PRs to the template repo. The `wb.steering-audit` command flags promote-suggest candidates: overrides whose scope is exercised by artifacts that span more than one epic in the workbench.
- **M4 (PR footer):** `sync-context.sh` writes a steering-drift markdown footer into `repos/.ralph/pr_footer.md` so every ralph-authored PR carries the override list.

```
wb.steering-audit             # markdown report (kind, age, last-updated, promote-suggest)
wb.steering-audit --json      # machine-readable JSON
wb.steering-audit --list      # one-line-per-override terse view
```

See the "Steering workflow" section in the root `README.md` for the role-split.
