# Build log: Dashboard ENOBUFS fix and express deploy path

## Problem

`Sync Obsidian Vault` workflow started failing every hour starting
2026-04-26 ~08:18 UTC. Sync itself succeeded; the failure was in the
"Log sync result and update dashboard" step.

```
Error: spawnSync /bin/sh ENOBUFS
  at gh (sync-dashboard.js:19)
  at loadAllRuns (sync-dashboard.js:105)
spawnargs: [ '-c', 'gh api repos/.../issues/9/comments?per_page=100 --paginate' ]
```

## Investigation

`execSync` defaults to a 1MB stdout buffer. The April log issue (#9)
had grown to 251 comments, and the full paginated JSON response — with
all the user, app, permissions, and reactions metadata — exceeded that
limit. Measured: 1.07MB raw vs 71KB if we kept only the comment bodies.

Each comment is just a wrapper around a JSON blob inside a fenced code
block; only `body` is read. Everything else is wasted bytes.

## Solution

Three changes to `.github/scripts/sync-dashboard.js`:

1. **Slim the response with jq**: `gh api ... --jq '[.[] | .body]'`
   reduces the payload ~15× (1.07MB → 71KB).
2. **Update the page-join regex**: jq adds a trailing newline so
   pagination boundaries become `]\n[` instead of `][`. Updated
   `\]\[/g` → `\]\s*\[/g`.
3. **Bump `maxBuffer` to 100MB** as a guardrail in case future call
   sites hit the limit again.

## Express deploy path

The documented `/deploy-changes` flow is dev → template → dev (QA) →
production. Step 1 requires the dev vault for end-to-end sync testing,
but the dev vault has been retired.

Since the fix touched only the post-sync dashboard rendering — not
auth, sync, or git-crypt — we used an express path:

1. Test locally against live production data (script ran against
   the live log issue, parsed all run records cleanly)
2. Commit + push to prod `main`
3. Manually trigger `sync.yml` via `workflow_dispatch`, verify green
4. Cherry-pick the same commit to template and dev for parity

End-to-end run passed in 34s.

## Key learnings

- `gh api --paginate --jq` joins pages with `]\n[`. The original
  page-join regex assumed `][` with no whitespace, which would have
  silently broken multi-page responses with jq even before ENOBUFS.
- `execSync`'s 1MB default buffer is a real ceiling for paginated GH
  API calls. Either filter with `--jq` at the source or pass an
  explicit `maxBuffer`.
- The express deploy path is safe when a change is isolated to
  non-sync code (dashboard, docs, anything that doesn't touch
  credentials, sync, or git-crypt). For sync-touching changes the
  full dev-first path is still required — but the dev vault would
  need to be revived first.
