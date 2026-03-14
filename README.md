# obsidian-vault-backup-template

Permanent, encrypted version history for your Obsidian vault. Uses [obsidian-headless](https://github.com/obsidianmd/obsidian-headless) to pull your vault via Obsidian Sync, encrypts at rest with git-crypt, and commits hourly via GitHub Actions.

## Prerequisites

- [Obsidian Sync](https://obsidian.md/sync) subscription (Standard at $4/mo or Plus)
- GitHub account
- [`git-crypt`](https://github.com/AGWA/git-crypt) installed locally
- [`gh`](https://cli.github.com) CLI installed locally

## Quick start

1. Click **Use this template** on GitHub to create your repo.
2. Run `/setup` in [Claude Code](https://claude.ai/claude-code) for guided setup.
   Or follow the instructions manually in [`.claude/commands/setup.md`](.claude/commands/setup.md).
3. Set the 7 required GitHub secrets.
4. Done. The hourly sync starts automatically.

## Cost

- Obsidian Sync Standard: $4/mo
- GitHub Actions: free (well within the free tier for hourly commits)

## Pulling template updates

If the template improves, you can pull changes into your backup repo:

```bash
# One-time: add the template as a remote
git remote add template https://github.com/<owner>/obsidian-vault-backup-template.git

# When you want to pull updates (git-crypt must be unlocked):
git fetch template
git merge template/main
git push
```

## Documentation

- [`.claude/commands/setup.md`](.claude/commands/setup.md) — guided setup (invocable as `/setup` in Claude Code)
- [CONTRIBUTING.md](CONTRIBUTING.md) — architecture overview and developer docs
