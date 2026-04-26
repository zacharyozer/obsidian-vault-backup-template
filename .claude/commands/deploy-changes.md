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

## 5. QA: fast-forward template into dev

```bash
cd <dev-repo>
git checkout main
git pull --ff-only template main
git push origin main
```

`--ff-only` enforces linear history. If the pull fails because dev's
`main` has diverged from template, that's a bug — dev's `main` should
be a strict mirror. Reset with `git fetch template && git reset --hard
template/main && git push --force origin main`.

Then run `/test-changes` to verify both workflows pass.

If anything fails, fix on template's `main` and repeat from step 1.

---

## 6. Ship: fast-forward template into production

```bash
cd <production-repo>
git checkout main
git pull --ff-only template main
git push origin main
```

Same `--ff-only` rule applies — production's `main` is a strict mirror
of template's `main`. No PR needed; the parity rule means the change
on template is already reviewed-and-shipped by the time you're here.

If `--ff-only` fails (production has diverged), reset:

```bash
git fetch template
git reset --hard template/main
git push --force origin main
```

---

## 7. Post-deploy verification

Run `/test-changes` on production to verify both workflows pass. The
first sync run after the fast-forward bootstraps the `last-sync` tag.

---

## Express path (no dev vault needed)

For changes isolated to non-sync code. Trades end-to-end sync coverage
for speed. **Only use when the change cannot break sync, auth, or
git-crypt.**

The parity rule (see template's CLAUDE.md) means changes always land
on **template first**. Production and dev pull via fast-forward. The
"express" part: skip the dev QA step that requires a working dev vault.

### 1. Edit on template

Make the change on `template/main`. Apply the rules in
`~/.claude/rules/public-repo-content.md` to scrub PII before commit
(`main` is public).

### 2. Test locally on production data (if helpful)

For scripts that read production state, run them directly against the
production repo before pushing template:

```bash
GITHUB_REPOSITORY=<owner>/<production-repo> \
  TZ_DISPLAY=America/New_York \
  node .github/scripts/sync-dashboard.js
```

Read-only checks are safe; idempotent re-renders (like the dashboard
issue body) are also fine.

### 3. Push template

```bash
cd <template-repo>
git push origin main
```

### 4. Fast-forward production and dev

```bash
cd <production-repo> && git checkout main && git pull --ff-only template main && git push origin main
cd <dev-repo>        && git checkout main && git pull --ff-only template main && git push origin main
```

If `--ff-only` fails on either, that downstream main has diverged —
reset it: `git fetch template && git reset --hard template/main &&
git push --force origin main`.

### 5. Trigger and verify on production

```bash
gh workflow run sync.yml --repo <production-repo>
gh run watch <run-id> --exit-status --repo <production-repo>
```

Watch the affected step specifically. Green run = fix verified.

### 6. Document

Add a build log entry to `docs/logs/YYYY-MM-DD-<description>.md` on
**template's main** (it propagates to prod and dev via the parity rule).
Scrub PII per `~/.claude/rules/public-repo-content.md`.
