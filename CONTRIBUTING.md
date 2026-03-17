# Contributing

## How it works

Two GitHub Actions workflows handle everything.

**`sync.yml`** runs every hour:

1. Authenticates with Obsidian Sync (auth token, or password+TOTP as a fallback)
2. Unlocks the repo with git-crypt
3. Pulls the vault via `ob sync` from `obsidian-headless`
4. Commits and pushes any changed files

**`staleness-check.yml`** runs daily at 9am UTC:

1. Checks that a successful sync happened within the last 48 hours (via the `LAST_SYNC_SUCCESS` repo variable)
2. Checks that the repo is under 50MB

If either check fails, the workflow errors — which triggers a GitHub notification.

## Key design decisions

**GitHub Actions over a VPS.** No infrastructure to maintain. Hourly cron is good enough because Obsidian Sync covers the last 30 days of fine-grained recovery.

**git-crypt.** Even in a private repo, personal notes deserve encryption at rest. GitHub only sees encrypted blobs.

**Token-first auth with TOTP fallback.** The auth token is the fast path, but its expiry is undocumented. The workflow stores all credentials and automatically falls back to password+TOTP if the token fails. Self-healing, no manual intervention needed.

**git-crypt unlock before sync.** `ob sync` writes files, which dirties the working tree. `git-crypt unlock` needs a clean tree. Unlock must happen first.

**Pull-only mode with a stable device name.** Prevents the headless client from pushing stale data back to Obsidian Sync. Also avoids creating a new "device" entry on every run.

**Local `npm install` for `otpauth`.** Global install on GitHub Actions puts modules in a path where `node -e` can't find them. Local install resolves this.

**Notes only, no plugins.** Plugins are large, change frequently with updates, and are easily reinstalled. Including them would add noise to git history without meaningful value.

## How to test changes

You need an Obsidian Sync subscription to test end-to-end.

1. Fork the template and create a test repo from it.
2. Set the required secrets for a test vault (see `AGENTS.md` for the full list).
3. Trigger the sync workflow manually:

```bash
gh workflow run sync.yml
```

4. Check the workflow logs for errors.
5. Verify that files appear in `vault/` locally and are encrypted blobs on GitHub.

To test the staleness check:

```bash
gh workflow run staleness-check.yml
```

## How to contribute

- Open a PR against this template repo.
- Test with a real Obsidian Sync vault before submitting.
- Keep the sync workflow simple — it runs hourly and needs to be reliable.
- If you're fixing an auth or sync issue, document what you found in the PR description. The failure modes here are subtle and worth capturing.
