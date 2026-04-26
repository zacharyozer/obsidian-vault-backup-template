# Build log: Sync timeout and retry fixes

## Problem

GitHub emailed that the account had used 1,914 of 2,000 included Actions
minutes. Investigation found 5 `ob sync` runs that each hung for ~6
hours (365 min), totaling 1,825 minutes — 95% of the budget from just
5 runs.

## Investigation

### Finding the culprit

Checked all personal repos for Actions activity. Only the production
backup repo (429 runs) and the dev repo (225 runs) had significant
activity. Used the workflow timing API to find runs with
`run_duration_ms > 3600000` — found 5 timeout runs, all in the April
billing cycle.

### Root cause chain

1. **`ob sync` hangs on "Connecting..."** — the WebSocket connection to
   the assigned sync server never completes.
   Known bug: [obsidianmd/obsidian-headless#17](https://github.com/obsidianmd/obsidian-headless/issues/17).
   No timeout, retry, or failover logic in `ob` itself.

2. **`timeout` sends SIGTERM, but `ob` doesn't exit** — `ob` catches
   SIGTERM via `process.on("SIGTERM", ...)`, calls `a.stop()`, prints
   "Disconnected from server", but then hangs in the `finally` block
   (likely the lock file release). GNU `timeout` only sends SIGTERM by
   default — it doesn't escalate to SIGKILL.

3. **Retry never runs** — because the first `timeout` + `ob` process
   never exits, the shell never reaches the `else` branch. The job
   sits there until GitHub's 6-hour max job timeout cancels everything.

### Dead ends explored

- **`ob` verbose/debug mode** — doesn't exist. No `--verbose` flag,
  no `DEBUG` env var. The CLI is a minified single-file bundle.
- **Force-disconnect other clients** — `ob` has no option to kick
  other devices. The `connect()` WebSocket call sends `{op: "init"}`
  and waits — no force/exclusive/takeover parameter.
- **Logout/relogin to get a new server** — the sync server host is a
  property of the vault (set at creation time), not the session.
  `sync-setup` reads `c.host` from the vault listing API, which
  always returns the same server.
- **Obsidian forums/Discord** — searched for workarounds. Found
  issue #17 confirming this is a known unfixed bug. No server-side
  fix available.

## Solution (iterative, 4 commits)

### Commit 1: Add timeout to `ob sync`

- Added `timeout-minutes: 5` job-level hard cap
- Added `SYNC_TIMEOUT` env var (configurable via GitHub repo variable,
  default 60s) wrapping both `ob sync` calls
- Applied to all 3 repos (dev -> template -> prod)

### Commit 2: Fix SIGTERM not killing `ob`, add retry loop

- Added `-k 10` to `timeout` (sends SIGKILL 10s after SIGTERM)
- Replaced nested if/else with a retry loop
- Verified: SIGKILL works, retries execute correctly

### Commit 3: Add server diagnostics, reduce timeout

- Added `ob sync-status` output before sync attempts
- Added `curl` reachability check against the sync server hostname
- Reduced default timeout from 60s to 20s
- Diagnostics immediately revealed: the assigned sync server was
  unreachable (not a client-concurrency issue)

### Commit 4: Tighten budget

- Reduced to 15s timeout, 2 attempts
- Worst case: ~1 min billed (was 365 min per failure)

## Key learnings

- GNU `timeout` only sends SIGTERM. Node processes that catch SIGTERM
  can hang indefinitely. Always use `-k <seconds>` to escalate to
  SIGKILL.
- `ob sync` has no built-in connection timeout. The WebSocket
  `connect()` promise hangs forever if the server doesn't respond.
  This is a known bug with no fix as of v0.0.8.
- The sync server is pinned per-vault at creation time. There's no
  way to request a different server short of creating a new vault.
- Billing is per-minute. A 6-hour hung job costs 360 minutes even if
  it does nothing useful.
