# Deploy changes

Ship changes through the full pipeline: dev → template → dev (QA) →
production. Follow each section in order.

See CONTRIBUTING.md for the three-repo model and design rationale.

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

If anything fails, fix in the template (not dev) and repeat from step 2.

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
