# Contributing

## Architecture

Two GitHub Actions workflows handle everything.

**`sync.yml`** runs every hour:

1. Authenticates with Obsidian Sync (auth token, or password+TOTP as a fallback)
2. Unlocks the repo with git-crypt
3. Pulls the vault via `ob sync` from `obsidian-headless`
4. Commits and pushes any changed files
5. Force-updates an annotated `last-sync` tag to record the successful sync

**`staleness-check.yml`** runs daily at 9am UTC:

1. Reads the `last-sync` tag's tagger date to check that a successful
   sync happened within the last 48 hours
2. Checks that the repo is under 50MB

If either check fails, the workflow errors — which triggers a GitHub notification.

## Key design decisions

See `docs/knowledge/decisions.md` for the full list with rationale. The
highlights:

- **GitHub Actions over a VPS.** No infrastructure to maintain.
- **git-crypt.** Even in a private repo, personal notes deserve encryption at rest.
- **Token-first auth with TOTP fallback.** Self-healing, no manual intervention.
- **Annotated tag for health tracking.** Zero commits, zero bloat, works with existing permissions.
- **Pull-only mode.** Prevents the headless client from pushing stale data back.
- **Notes only, no plugins.** Plugins add noise without meaningful version history value.

## Three-repo model

Changes flow through three repos:

```
dev ──> template ──> dev (QA) ──> production
```

| Repo | Purpose |
|------|---------|
| `obsidian-vault-backup-template` | Canonical source. Clean, generalized code and docs. No credentials. |
| `obsidian-vault-backup-dev` | Development + testing. Has real Obsidian Sync credentials for a test vault. |
| `obsidian-vault-backup` (or your fork) | Your actual vault backup. Pulls updates from the template. |

### Feature development (workflow/code changes)

1. **Develop** in the dev repo — iterate against real credentials
2. **Port to template** — squash into a single commit, generalize, run
   `/update-docs` to update all documentation
3. **QA** — merge template into dev, run `/test-changes` to verify
4. **Ship** — merge template into production (user reviews and merges)

Squash into one commit when porting to template. Multiple commits are
the exception, not the default — only when the change naturally breaks
into independent pieces and there's a clear reason to separate them.

### Doc-only changes

Doc changes that don't affect workflows can go straight to template,
then flow through QA and production.

### Express path (non-sync code, no dev vault)

If the change is **isolated to non-sync code** (dashboard rendering,
log scripts, health-check tweaks — anything that doesn't touch auth,
`ob sync`, git-crypt, or workflow credentials) and the dev vault isn't
available, `/deploy-changes` describes an express path: test locally
against production data, push to prod `main`, manually trigger the
workflow to verify, then cherry-pick to template and dev for parity.

Use this only when the change cannot break sync. For sync-touching
changes, the dev vault must exist — revive it first.

## How to test changes

You need an Obsidian Sync subscription to test end-to-end.

### Quick test (single repo)

1. Fork the template and create a dev repo from it.
2. Set the required secrets for a test vault (see `AGENTS.md` for the full list).
3. Run `/test-changes` to trigger both workflows and verify they pass.

### Full test flow (three-repo pipeline)

The full flow is encoded in two Claude Code skills:

- **`/deploy-changes`** — Full pipeline from dev through production.
  Calls `/test-changes` at the QA step.
- **`/test-changes`** — Smoke test: trigger both workflows and verify
  they pass. Usable standalone or as part of `/deploy-changes`.

## Pulling template updates

If the template improves after you've created your backup repo, you can pull changes:

```bash
# One-time: add the template as a remote
git remote add template https://github.com/zacharyozer/obsidian-vault-backup-template.git

# When you want to pull updates (git-crypt must be locked):
git-crypt lock          # if currently unlocked
git fetch template
git merge template/main
git push
git-crypt unlock        # if you want to browse vault files locally
```

**Important:** git-crypt must be locked during merge. Phantom diffs from the
git-crypt filter break `git merge`'s internal stash when unlocked.

## How to contribute

- Develop in the dev repo, port to template when it works.
- Test with a real Obsidian Sync vault before shipping.
- Keep the sync workflow simple — it runs hourly and needs to be reliable.
- Update documentation alongside code changes (see `/update-docs`).
- If you're fixing an auth or sync issue, document what you found. The
  failure modes here are subtle and worth capturing.
