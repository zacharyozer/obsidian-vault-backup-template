# Build log: Dev-first workflow

## Problem

The original change flow was template → test → production. This was
backwards — development happened in the template (which has no
credentials), then testing happened in the test repo. Iterating on
workflow changes required pushing to the template first, merging into
test, then discovering failures.

Additionally, the test repo was created via "Use this template" (GitHub),
which doesn't preserve git history. Every merge from template required
`--allow-unrelated-histories` and produced conflicts on every shared
file. This was noisy and error-prone.

## Solution

### Dev-first flow

Renamed the test repo to dev and established a dev-first flow:

```
dev (develop + test) ──> template (squash, generalize) ──> dev (QA) ──> production
```

Development happens in the dev repo (which has real Obsidian Sync
credentials). Changes are ported to the template as a single squashed
commit, then merged back into dev for QA before shipping to production.

### History migration

To fix the unrelated-histories problem, rebased dev onto template's
history:

1. Created a new branch from `template/main`
2. Cherry-picked vault snapshot commits (authored by `obsidian-backup`)
3. Replaced dev's `main` with the migrated branch

This preserved all vault history while making dev a descendant of
template. Future template merges are now normal merges — no
`--allow-unrelated-histories`, no conflicts on every file.

### Skills

Created three Claude Code skills to encode the workflow:

- **`/deploy-changes`** — Full pipeline: dev → template → dev (QA) →
  production. Calls `/test-changes` at the QA step.
- **`/test-changes`** — Smoke test: trigger both workflows on dev,
  verify they pass. Usable standalone.
- **`/update-docs`** — Documentation checklist. Fires during the
  template porting step of `/deploy-changes`.

### Porting rule

Squash into a single commit when porting dev → template. Multiple
commits only as an exception with a stated reason. The template's git
log reads like a changelog, not a development diary. The build log
captures the narrative.

## Key learnings

- "Use this template" on GitHub creates a repo with no shared git
  history. This makes merges painful forever. Rebasing onto the
  template's history (cherry-picking only the data commits) fixes
  this permanently.
- Cherry-picking vault commits works cleanly because they only touch
  files in `vault/`. The "Initial commit" from "Use this template"
  touches all files and must be skipped.
- Development should happen where you can test. For a project that
  depends on external credentials (Obsidian Sync), that means a repo
  with real secrets configured.
