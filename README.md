# obsidian-vault-backup-template

This template gives your Obsidian vault permanent, encrypted version history in GitHub. It uses [obsidian-headless](https://github.com/obsidian-headless/obsidian-headless) to pull your vault via Obsidian Sync, encrypts everything at rest with git-crypt, and commits a snapshot to GitHub every hour via GitHub Actions — so you get a full, browsable history of every change you've ever made.

## Prerequisites

- [Obsidian Sync](https://obsidian.md/sync) subscription (Standard at $4/mo or Plus)
- GitHub account
- [`git-crypt`](https://github.com/AGWA/git-crypt) installed locally
- [`gh`](https://cli.github.com) CLI installed locally

## Quick start

1. Click **Use this template** on GitHub to create your repo.
2. Follow the guided setup in [AGENTS.md](AGENTS.md).
3. Set the 7 required GitHub secrets listed there.
4. Done. The hourly sync starts automatically.

## Cost

- Obsidian Sync Standard: $4/mo
- GitHub Actions: free (well within the free tier for hourly commits)

## Pulling template updates

If the template improves, you can pull changes into your backup repo:

```bash
# One-time: add the template as a remote
git remote add template https://github.com/<owner>/obsidian-vault-backup-template.git

# When you want to pull updates:
git fetch template
git merge template/main
git push
```

## Documentation

- [AGENTS.md](AGENTS.md) — guided setup for Claude (or you, if you prefer to follow it directly)
- [CONTRIBUTING.md](CONTRIBUTING.md) — architecture overview and developer docs
