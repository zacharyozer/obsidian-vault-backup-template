# Decisions

## Architecture: Obsidian Sync + GitHub Actions

Considered four options:

| Option | Pros | Cons |
|--------|------|------|
| Git on Mac (launchd + obsidian-git plugin) | Simple, free | Requires Mac open. No home server. obsidian-git doesn't work on iOS. |
| Dropbox + VPS | VPS always on | iOS doesn't support Dropbox well. Degrades mobile experience. |
| Obsidian Sync + VPS ($9/mo) | Always-on, continuous | Overkill for a 3MB vault. Infrastructure to maintain. |
| **Obsidian Sync + GitHub Actions (chosen)** | No infrastructure, ~free, iOS works | Hourly granularity, cron can be delayed/disabled |

It's the simplest architecture that satisfies all constraints:

* iOS sync works perfectly (Obsidian Sync is officially supported)
* Version history is permanent (git + GitHub)
* No infrastructure to maintain (GitHub Actions, not a VPS)
* Cost is minimal ($4/mo for Sync Standard — the vault is 3MB, well under 1GB)
* The 3MB vault means git repo growth is negligible for years

The hourly gap is acceptable because Obsidian Sync covers fine-grained
recovery for the most recent 30 days. Git covers everything beyond that.

## git-crypt over plaintext

Store plaintext notes on GitHub? No. Even in a private repo,
personal notes deserve encryption at rest. git-crypt encrypts vault files
transparently — GitHub only sees encrypted blobs. Plaintext is available
locally after cloning + unlocking with the git-crypt key.

## .gitignore exclusions

The `.gitignore` deliberately excludes:

* `.DS_Store` — macOS metadata, not meaningful
* `.obsidian/workspace.json` — changes constantly as you navigate, not meaningful history
* `.obsidian/workspace-mobile.json` — same, for mobile
* `.smart-env/` — plugin cache, regenerable
* `.trash/` — Obsidian's soft-delete folder, not worth versioning

## Notes only, no plugins

The headless client's `--configs` flag supports syncing plugins, themes,
and settings. This template deliberately leaves it disabled. Plugins are large,
change with updates, and are easily reinstalled. They'd add noise to the
git history without meaningful value for version history purposes.

## Auth: token-first with password+TOTP fallback

The auth token (`OBSIDIAN_AUTH_TOKEN`) is the fast path — no login
needed. But it's a 32-char opaque hex string with unknown expiry.

The workflow stores all credentials (token + email + password + TOTP
seed) and falls back to password+TOTP automatically if the token check
fails. Self-healing — no manual intervention needed.

Both paths are tested in CI (see build log, runs 1-8).

## git-crypt unlock before sync

`ob sync` writes files into the vault directory, which makes the git
working tree dirty. `git-crypt unlock` requires a clean tree (it
rewrites tracked files in place). So unlock must happen first.

Discovered during testing (run 4 — see build log).

## Pull-only mode + stable device name

* `ob sync-config --mode pull-only` prevents the headless client from
  pushing stale data back to Obsidian's servers.
* `--device-name "gh-actions-backup"` avoids creating a new device
  entry on every run.

## Graceful concurrent sync handling

Obsidian Sync allows one connection per vault. If the desktop/mobile
app is connected, the headless client fails. The workflow retries once
after 5s, then skips the run. This is acceptable — most hourly runs
succeed because the desktop app only holds the connection briefly.

## npm local install (not global)

`npm install -g otpauth` on GH Actions puts the module in a global
prefix that `node -e` can't resolve from the repo working directory.
Local install (`npm install` without `-g`) puts it in `./node_modules/`
which Node finds automatically.

Discovered during testing (run 7 — see build log).

## Daily health check (not inline)

Repo size monitoring and staleness detection live in a separate daily
workflow (`staleness-check.yml`), not in the sync workflow. Keeps the
sync workflow focused on one job.

## 1Password batch read (temp file + jq)

When pulling credentials from 1Password, use a single `op item get`
call with `--format json` instead of individual `op read` calls per
field. This reduces biometric prompts from 4+ to 1.

Gotcha: the JSON can't be piped through a shell variable (`echo "$CREDS"
| jq`). 1Password items with notes fields contain control characters
that survive in the JSON file but get mangled by shell expansion,
breaking `jq`. Writing to a temp file and reading with `jq` from the
file avoids this.

## Setup guide as a Claude Code skill

The setup guide lives in `.claude/commands/setup.md`, making it invocable
as `/setup` in Claude Code. `AGENTS.md` is a thin pointer that directs
agents (and humans) to the skill file.

This makes the setup flow more natural for agents — they invoke a command
rather than reading and interpreting a doc. Humans can follow the same
file directly.

## Lock git-crypt before merging template updates

When git-crypt is unlocked, its smudge/clean filters create phantom diffs
on vault files (encrypted on-disk bytes differ from the clean filter's
output). `git merge` internally tries to stash these diffs and fails with
"fatal: stash failed."

The fix: **lock** git-crypt before merging. When locked, the filters are
inactive, the tree is clean, and merge works normally. Unlock again after
pushing if you want to browse vault files locally.

Discovered while testing the template update pull flow.

## Tag-based health check (not repo variables)

The original health check used `git log` to find the last vault commit.
This produced false staleness alerts when the vault had no new content
for 48+ hours — sync was running fine, there just wasn't anything new.

**Why not repo variables?** `GITHUB_TOKEN` cannot write repository
variables. The API returns 403 ("Resource not accessible by
integration"). The `variables` permission scope doesn't exist for
`GITHUB_TOKEN` — and adding it to the `permissions:` block breaks the
workflow parser entirely (GitHub rejects the file as invalid YAML).
A fine-grained PAT would work but adds a credential to maintain.

**Why annotated tags?** On each successful sync, the workflow
force-updates an annotated `last-sync` tag. The health check reads the
tag's tagger date via `git for-each-ref` — one command that returns the
unix timestamp directly. This costs zero commits, zero repo bloat, zero
extra secrets, and works with the existing `contents: write` permission.

**Force-push scoping:** The sync step uses `git push origin
+refs/tags/last-sync`. The `+` prefix forces only the paired ref —
it physically cannot affect branches. Do not change this to `--force`,
which applies globally.

**Branch protection:** Force-push protection on `main` would add a
server-side guard, but requires GitHub Pro for private repos. Without
Pro, the refspec scoping is the only safeguard. Worth enabling if you
upgrade.

## Open questions

### Still observing

1. How long do auth tokens last before expiring? (mitigated by TOTP
   fallback, but good to know)
2. Are GH Actions hourly cron runs reliable in practice?

### Answered during build

| Question | Answer |
|----------|--------|
| Should plaintext notes be stored on GitHub? | No. git-crypt encrypts vault files. GitHub only sees encrypted blobs. |
| Does `ob login` support non-interactive MFA? | Yes. `ob login --mfa <code>` works. |
| Does Obsidian support API tokens? | Effectively yes — `OBSIDIAN_AUTH_TOKEN` env var. |
| Does `OBSIDIAN_AUTH_TOKEN` work as sole auth? | Yes. No `ob login` needed if token is valid. |
| Is `ob sync-setup` idempotent? | Yes. Safe to run every invocation. |
| Does E2E require password on every sync? | No. Only at `ob sync-setup`. Key stored in `~/.obsidian-headless/sync/<vault-id>/config.json`. |
| Where is sync config stored? | `~/.obsidian-headless/sync/<vault-id>/` (not in vault dir). |
| What is the auth token format? | 32-char hex (16 random bytes). Opaque, no embedded expiry. |
