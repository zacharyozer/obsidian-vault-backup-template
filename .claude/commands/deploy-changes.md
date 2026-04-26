# Deploy changes

Ship changes through the full pipeline: dev → template → dev (QA) →
production. Follow each section in order.

See CONTRIBUTING.md for the three-repo model and design rationale.

---

## When to use the express path instead

The full path requires a working dev vault for end-to-end sync testing.
If the change is **isolated to non-sync code** — dashboard rendering,
log scripts, health-check tweaks, docs, anything that doesn't touch
auth, `ob sync`, git-crypt, or the workflow YAML's credential handling —
skip to the [Express path](#express-path-no-dev-vault-needed) at the
bottom.

If the change touches sync, auth, or credentials, the dev vault must
exist. Revive it first or postpone the change.

---

## 1. Develop in dev repo

Make changes in the dev repo (`obsidian-vault-backup-dev`). This repo
has real Obsidian Sync credentials, so you can test workflows end-to-end.

- Branch from `main`, develop, iterate
- Run `/test-changes` to verify workflows pass
- When the change works, move to step 2

---

## 2. Port to template

Squash your changes into a single commit on the template repo. This is
a manual port, not a git merge — the template is the canonical source
and should be clean, generalized code.

- Squash into one commit by default. Multiple commits only as an
  exception with a stated reason (e.g., separating an unrelated refactor).
- Scrub dev-specific details: local paths, vault names, account names,
  credentials that may have appeared in debug output.
- Apply the changes to the template repo's `main` branch.

---

## 3. Update docs

Run `/update-docs` to ensure all documentation is current. This fires
during the template porting step — code doesn't ship until docs are
reviewed.

---

## 4. Push template

Commit and push to the template repo's `main` branch.

---

## 5. QA: merge template into dev

```bash
cd <dev-repo>
git fetch template
git merge template/main --no-edit
git push origin main
```

This should be a normal merge (no `--allow-unrelated-histories`).

Then run `/test-changes` to verify both workflows pass.

If anything fails, fix in the dev repo and repeat from step 1.

---

## 6. Ship: merge template into production

```bash
cd <production-repo>
# git-crypt must be locked before merging (see decisions.md)
git fetch template
git checkout -b <pr-branch> || git checkout <pr-branch>
git merge template/main --no-edit
git push origin <pr-branch>
```

If a PR already exists, the push updates it. If not, create one:

```bash
gh pr create --title "Pull template: <description>" \
  --body "Pulls latest changes from template." \
  --head <pr-branch> --base main --draft
```

**Stop here.** The user reviews and merges the production PR themselves.

---

## 7. Post-merge verification (user-driven)

After the user merges the production PR, run `/test-changes` on
production to verify both workflows pass. The first sync run after
merging bootstraps the `last-sync` tag.

---

## Express path (no dev vault needed)

For changes isolated to non-sync code. Trades end-to-end sync coverage
for speed. **Only use when the change cannot break sync, auth, or
git-crypt.**

### 1. Test locally on production data

Run the changed script directly against the production repo. For the
dashboard script:

```bash
GITHUB_REPOSITORY=<owner>/<production-repo> \
  TZ_DISPLAY=America/New_York \
  node .github/scripts/sync-dashboard.js
```

This rebuilds the dashboard issue body from the same data the workflow
would see. Read-only against issues except for the dashboard issue
itself, which gets re-edited (idempotent — same input → same output).

### 2. Commit and push to production main

Commit on the working branch, then fast-forward `main`:

```bash
git push -u origin <branch>
git checkout main
git merge --ff-only <branch>
git push origin main
```

Solo dev: no PR review step. The commit goes straight to `main`.

### 3. Manually trigger and verify

```bash
gh workflow run sync.yml --repo <production-repo>
gh run watch <run-id> --exit-status --repo <production-repo>
```

Watch the failing step specifically. Green run = fix verified.

### 4. Cherry-pick to template and dev

Keep all three repos in lockstep so future template merges don't
regress production:

```bash
# Apply the same diff in template/ and dev/, commit with same message
cd <template-repo> && git add -A && git commit -m "<same message>" && git push origin main
cd <dev-repo>      && git add -A && git commit -m "<same message>" && git push origin main
```

Dev gets the patch even though its workflow doesn't run — this is
hygiene so a future revived dev vault inherits the current state.

### 5. Document

Add a build log entry under `docs/logs/YYYY-MM-DD-<description>.md`
covering the problem, investigation, and the express path you used
(including why the dev step was skipped).
