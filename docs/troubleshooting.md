# Troubleshooting

## Common failures

### `git push` returns 403

**Cause:** The workflow doesn't have write access to the repo.

**Fix:** Ensure `permissions: contents: write` is set in the workflow
YAML. The template already includes this — if you've customized the
workflow, check that it wasn't removed.

### "Another sync instance already running"

**Cause:** Obsidian Sync allows one active connection per vault. If the
desktop or mobile app is syncing when the workflow runs, `ob sync` fails.

**Fix:** Close Obsidian on all devices and re-run the workflow. The
workflow already retries once after 5 seconds, then skips that run. In
practice, the desktop app only holds the connection briefly, so this
resolves itself on the next hourly run.

### `git-crypt unlock` fails with "Working directory not clean"

**Cause:** `git-crypt unlock` requires a clean working tree. If files
are written before unlock (e.g., by running `ob sync` first), it fails.

**Fix:** Unlock must happen before sync. The template workflow already
handles this — `git-crypt unlock` runs before `ob sync`. If you've
reordered the workflow steps, restore the original order.

### `Cannot find module 'otpauth'`

**Cause:** `otpauth` (used for TOTP code generation) was installed
globally. On GitHub Actions, global npm installs put modules in a path
where `node -e` can't find them.

**Fix:** Use a local install (`npm install otpauth`) instead of
`npm install -g otpauth`. The template workflow already does this.

### Auth token expired

**Cause:** The Obsidian auth token has an undocumented expiry. When it
expires, token-based auth fails.

**Fix:** No action needed. The workflow automatically falls back to
password+TOTP authentication if `OBSIDIAN_EMAIL`, `OBSIDIAN_PASSWORD`,
and `OBSIDIAN_TOTP_SECRET` are set. The fallback is self-healing — no
manual intervention required.

## Decrypt locally

To read your backed-up vault on a local machine:

```bash
git clone git@github.com:<user>/<repo>.git
cd <repo>
# Retrieve git-crypt key from your password manager (stored as base64)
echo "<base64-key>" | base64 -d > /tmp/key.bin
git-crypt unlock /tmp/key.bin && rm /tmp/key.bin
```

## Secrets reference

All secrets are GitHub Actions secrets. The workflow uses the auth token
as the fast path and falls back to password+TOTP if it expires.

| Secret                  | Value                                        | Source                                |
|-------------------------|----------------------------------------------|---------------------------------------|
| `OBSIDIAN_AUTH_TOKEN`   | Token from `~/.obsidian-headless/auth_token` | `cat ~/.obsidian-headless/auth_token` |
| `OBSIDIAN_EMAIL`        | Your Obsidian account email                  | Your password manager                 |
| `OBSIDIAN_PASSWORD`     | Obsidian account password                    | Your password manager                 |
| `OBSIDIAN_TOTP_SECRET`  | TOTP seed (base32 string)                    | Your password manager (OTP field)     |
| `OBSIDIAN_VAULT_NAME`   | Your vault name                              | —                                     |
| `OBSIDIAN_E2E_PASSWORD` | E2E encryption password                      | Your password manager                 |
| `GIT_CRYPT_KEY`         | Base64-encoded git-crypt symmetric key       | `git-crypt export-key` + `base64`     |

Back up the git-crypt key in your password manager.

Note: `OBSIDIAN_E2E_PASSWORD` and `OBSIDIAN_PASSWORD` are often the same
value — Obsidian reuses the account password as the E2E encryption
password by default.

## Security notes

- The GitHub repo **must** be private.
- Enable 2FA on your GitHub account.
- The TOTP seed is the most sensitive secret — it generates unlimited
  MFA codes.
- GitHub Actions secrets are encrypted at rest and masked in logs.

## Monitoring

### Workflow failure alerts

GitHub Actions sends email notifications on workflow failure by default.

### Daily health check (`staleness-check.yml`)

Runs daily at 9am UTC. Checks two things:

1. **Staleness:** Last successful sync < 48 hours ago. Reads the
   `last-sync` annotated tag's tagger date (updated by the sync
   workflow on every successful run). Catches disabled crons, persistent
   sync failures, and doesn't false-alarm when vault content is unchanged.
2. **Repo size:** Under 50MB. Catches surprise binaries early.

Both checks fail the workflow on violation, triggering an email alert.

### Checking cron reliability

```bash
gh run list --workflow=sync.yml --limit=24
```

## Known limitations

- **Concurrent sync:** Obsidian Sync allows one active connection per
  vault. If the desktop or mobile app is syncing when the workflow runs,
  `ob sync` fails. The workflow retries once after 5s, then skips. In
  practice, the desktop app only holds the connection briefly.

- **Initial upload must complete first:** When setting up a new vault in
  Obsidian Sync, the desktop app must finish uploading before the
  headless client can pull. If closed mid-upload, the headless client
  sees an empty vault.

- **iCloud + Obsidian Sync conflict:** Obsidian warns against running
  both simultaneously — it causes conflicts. Migration must be clean
  (copy vault, set up Sync, verify), not gradual.

## Rollback to iCloud

If Obsidian Sync or the backup doesn't work out, here's how to go back
to an iCloud-based vault.

The key concern: you may have added or edited notes that don't exist in
the old iCloud vault.

### Steps

1. **Sync new notes back to the iCloud vault:**
   ```bash
   rsync -av --exclude='.DS_Store' --exclude='.smart-env/' \
       --exclude='.obsidian/' \
       ~/<vault-path>/ \
       ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/<your-vault>/
   ```
   Using `rsync` (not `cp`) so it only copies new/changed files and
   doesn't clobber anything. Excluding `.obsidian/` because the old
   vault already has its own config.

2. **Close Obsidian on Mac.**

3. **Reopen Obsidian, switch to the iCloud vault.**
   Verify the new notes are there.

4. **On iOS:** Open the old iCloud vault (still in iCloud, untouched).
   Give iCloud a few minutes to sync. Verify recent notes appear.

5. **Clean up:**
   - Cancel Obsidian Sync subscription
   - Delete `~/<vault-path>/` on Mac
   - Optionally delete the GitHub backup repo
