---
id: TP-005
title: Risk Profile section pairs every risk with a mitigation; no orphan risks
scope: artifact:test-plan
owner: qa-council
created: 2026-05-17
updated: 2026-05-17
tags: [test-plan, risk-management]
---
**Rule:** Section 9 (Risk Profile and Challenges) lists risks as bullets in the format `**Risk:** {short description}. **Mitigation:** {planned approach}.` Every risk has a mitigation. Orphan risks (a risk without a mitigation) are not allowed.

**Why:** A risk without a mitigation is incomplete planning. The point of the Risk Profile is not to enumerate every possible failure but to surface the failures the team has thought about AND committed to a response. Orphan risks read as "we know this might fail and we have no plan", which is worse than not listing the risk at all.

**How to apply:**
- Step 1 working model extracts impact areas from the PRD safety analysis. Each impact area is a candidate risk.
- Step 3 (Section 9) writes each risk as a single bullet pairing the risk with its mitigation in one line.
- If a candidate risk has no mitigation strategy yet, do not put it in section 9. Surface it in the Step 6 user-facing handoff as an open item so the user can either propose a mitigation (and add it) or accept the risk explicitly elsewhere.
- Self-review (Best practices check) verifies that every bullet in section 9 contains both `**Risk:**` and `**Mitigation:**` markers.

**Anti-pattern:** Section 9 reads:

```
- **Risk:** Procedure deletes recent rows by accident.
- **Risk:** Long-running batches hold locks.
- **Mitigation:** Batch size 1000.
```

The first risk has no mitigation. The third bullet's mitigation does not clearly belong to either risk. Reformat as:

```
- **Risk:** Procedure deletes recent rows by accident. **Mitigation:** Strict predicate; boundary scenarios in BDD verify cutoff behaviour.
- **Risk:** Long-running batches hold locks. **Mitigation:** Batch size 1000 with COMMIT between batches; lock duration bounded per batch.
```

One bullet per risk, with the mitigation paired in the same bullet. No ambiguity.
