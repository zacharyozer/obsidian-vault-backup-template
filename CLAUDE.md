# Project context

## Public-bound `main`

This repo's `main` is **public**, and it's the canonical source for
two private downstream repos (`obsidian-vault-backup`,
`obsidian-vault-backup-dev`). All three repos must stay at **identical
SHAs on `main`** — drift is a bug, not a feature.

Implications for any commit you make here:

- Apply the rules in [`~/.claude/rules/public-repo-content.md`](~/.claude/rules/public-repo-content.md)
  before every commit. Real names, paths, GitHub usernames, internal
  references must be scrubbed to placeholders.
- Build logs follow the same rule. Scrub shell-output references
  (local paths, repo URLs containing the GitHub username, run IDs that
  reveal account ownership) before committing.
- Keep history **linear**. No merge commits on `main`. Use rebase or
  fast-forward. Downstream repos should `git pull --ff-only` from
  template.

## Two-branch repo structure

| Branch | Contents |
|--------|----------|
| `main` | Code only. Public. Same SHA across all three repos. |
| `vault` | Encrypted vault snapshots. Per-repo. Never published. |

The sync workflow checks out `main` for code, adds `vault` as a
worktree at `./vault-data` for data. See `docs/knowledge/decisions.md`.

## Convergence flow

- New code or doc lands on **template/main first**.
- Downstream repos (`obsidian-vault-backup`, `obsidian-vault-backup-dev`)
  pull from template via fast-forward only:
  ```
  git fetch template && git pull --ff-only template main
  ```
- Downstream repos do **not** commit directly to their own `main`.
  Their `main` is a strict mirror.
