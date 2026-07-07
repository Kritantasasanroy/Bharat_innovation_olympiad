---
id: GP-006
title: Ask before destructive or hard-to-reverse actions
scope: golden
owner: architecture-council
created: 2026-04-24
updated: 2026-04-24
tags: [safety, blast-radius]
---
**Rule:** Before taking any action that is destructive, hard to reverse, or visible outside the local session, state what the action will do and wait for explicit user approval. This is not a suggestion.

**Why:** The cost of pausing is one message. The cost of an unwanted action is lost work, bad data, or a public mistake you cannot unsend.

**How to apply (not exhaustive):**
- **Destructive:** `rm -rf`, `git branch -D`, `git reset --hard`, dropping DB tables, killing processes, deleting cloud resources.
- **Hard to reverse:** force push (especially to main), amending published commits, removing or downgrading dependencies, modifying CI/CD pipelines, rotating secrets.
- **Visible outside:** pushing code, creating or closing PRs and issues, posting to Slack or email, publishing to a third-party service (pastebins, diagram renderers, gists — once published, content may be cached/indexed).
- Confirm in plain words: what will happen, where, and whether it is reversible.

**Anti-pattern:** Agent runs `git push --force origin main` "to unblock the build" without asking.
