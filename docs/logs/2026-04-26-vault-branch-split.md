# Build log: Move vault data to a dedicated branch

## Problem

`CONTRIBUTING.md` (and other non-vault files) had drifted between the
template, dev, and prod repos. The cause: every repo's `main` branch
held both code AND interleaved encrypted vault snapshots. Pulling
template updates via `git merge template/main` was awkward because the
histories diverged across many unrelated vault commits, and any
downstream-specific customization compounded the drift.

The rule we want: **all non-vault code 100% identical across template,
dev, and prod.**

## Solution

Two-branch repo structure:

| Branch | Contents |
|--------|----------|
| `main` | Code only. Mirrors template. |
| `vault` | `vault/` + `.gitattributes` + `.gitignore`. Encrypted snapshots. |

Sync workflow checks out `main` as the primary tree (gets scripts), then
adds `vault` as a git **worktree** at `./vault-data` and runs `ob sync`
against `./vault-data/vault`. Commits/tags target the `vault` branch
directly. `last-sync` tag points at the new vault commit.

## Migration steps actually executed

1. Pushed `pre-split-backup` branch as a safety net (snapshot of original
   interleaved main).
2. Disabled `sync.yml` to prevent the hourly cron landing on the old
   structure mid-migration.
3. Used `git filter-repo --path vault/ --path .gitattributes
   --path .gitignore` on a fresh clone → 56 commits → pushed as
   `origin/vault`.
4. Used `git filter-repo --invert-paths --path vault/` on a separate
   fresh clone → 24 code-only commits → force-pushed as the new
   `origin/main`.
5. Force-updated the `last-sync` tag to point at the vault branch's HEAD.
6. Updated `.github/workflows/sync.yml` to the worktree variant
   (~17 net lines added — checkout, worktree add, gitattributes guard,
   `working-directory: ./vault-data` on git-crypt/sync/commit/tag steps,
   explicit `git push origin HEAD:vault`).
7. Re-enabled the workflow and triggered manually. The first run
   passed in 41s, producing a fresh `vault snapshot` on the `vault`
   branch without touching `main`.
8. Reset local working clones to the rewritten `main`.
9. Applied the same `sync.yml` to template and dev verbatim. Bootstrapped
   minimal `vault` branches on both (orphan branch with `.gitattributes`,
   `.gitignore`, empty `vault/.gitkeep`).
10. Updated docs: `decisions.md` (canonical entry on the two-branch
    model), `setup.md` (post-fork verification + simplified template-pull),
    `CONTRIBUTING.md` (architecture description on each repo).

## Surprises

- An exploration step reported "339 vault commits" — that was actually
  the **file count** in `vault/`, not the commit count. Real numbers:
  78 commits on main, 55 of which were vault snapshots.
- `git filter-repo`'s "Parsed 134 commits" output counts across all
  refs in the local clone (main + pre-split-backup + the just-pushed
  vault branch), not just main. Easy to misread.
- `gh api --paginate` joins page boundaries with no separator (`][`)
  but `gh api --paginate --jq` adds a trailing newline (`]\n[`). The
  earlier dashboard fix had to handle both. Unrelated to this migration
  but worth flagging.
- Template repo's `main` had a stale `vault/.gitkeep` placeholder that
  needed removal during the migration to keep main strictly vault-free.

## Key learnings

- `git filter-repo` is the right tool for splitting a repo with mixed
  data and code commits cleanly. `--path` keeps listed paths,
  `--invert-paths --path` drops them. Two passes on fresh clones
  produce the two branches.
- Worktrees in CI are ergonomic: `actions/checkout` provisions
  credentials for the whole repo (including non-default branches), so
  pushing to `vault` from within the `./vault-data` worktree just works.
- `working-directory:` on each step is cleaner than `cd` inside `run`
  blocks. Easier to scan, easier to keep correct across edits.
- Force-rewriting `main` is a one-time cost. The structural payoff
  (parity rule enforced by branch layout, not discipline) is worth it.

## Verification

- `git ls-tree main -- vault/` returns nothing.
- `git log vault | grep -c "vault snapshot"` shows the full snapshot
  history preserved (55 historical + 1 new from the validation run).
- `last-sync` tag points to the latest vault commit.
- `staleness-check.yml` passes against the new tag.
- Manual sync run produced a fresh `vault snapshot` on `vault`, not main.

## Rollback

`origin/pre-split-backup` preserves the pre-migration state of `main`.
To revert: `git push --force origin pre-split-backup:main`. Vault branch
+ tag would also need to be reverted (delete vault branch, point
last-sync at the latest commit on the restored main).
