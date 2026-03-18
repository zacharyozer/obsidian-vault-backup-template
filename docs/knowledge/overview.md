# Overview

## What this is

Permanent version history for your Obsidian vault, stored as encrypted
git commits on GitHub.

Obsidian Sync keeps version history for 30 days (Standard) or 12 months
(Plus). For a personal knowledge base that accumulates over years, that's
not enough. This template provides permanent history via git, without
sacrificing the seamless Obsidian Sync experience on iOS and Mac.

## How it works

A GitHub Actions workflow runs hourly:

1. Authenticates with Obsidian Sync (token, or password+TOTP fallback)
2. Pulls the vault via the `obsidian-headless` CLI (`ob sync`)
3. Encrypts files with git-crypt
4. Commits and pushes to this template

A separate daily workflow checks that the backup is fresh and the repo
isn't growing unexpectedly.

## What gets backed up

**Notes and attachments only.** Obsidian plugins, themes, and settings
are not synced. They're easily reinstalled and would add noise to the
git history. The headless client runs with `--configs` disabled.

## Encryption

Two independent layers:

**Layer 1: Obsidian Sync E2E** — encrypts data before it leaves your
devices. Obsidian's servers never see plaintext. The headless client
decrypts locally using the E2E password.

**Layer 2: git-crypt** — encrypts vault files in the git repo. GitHub
only stores encrypted blobs. Decrypt locally by cloning + unlocking
with the git-crypt key.

```
Mac / iOS ──(Obsidian E2E)──> Obsidian servers ──(Obsidian E2E)──> headless client
                                  encrypted                         decrypts to
                                                                    plaintext
                                                                       │
                                                               git-crypt encrypts
                                                                on git commit
                                                                       │
                                                                       v
                                                           GitHub repo (encrypted)
                                                                       │
                                                              git clone + unlock
                                                                       │
                                                                       v
                                                            local checkout (plaintext)
```

| Location                      | State                              |
|-------------------------------|------------------------------------|
| In transit (Obsidian Sync)    | **encrypted**                      |
| Obsidian's servers            | **encrypted**                      |
| GH Actions runner (ephemeral) | plaintext (destroyed after run)    |
| GitHub repo at rest           | **encrypted** (git-crypt)          |
| Your local clone              | plaintext (after git-crypt unlock) |

Obsidian E2E means Obsidian can't read your notes. git-crypt means
GitHub can't either. Plaintext only exists on your devices and in
ephemeral CI runners.

## Repository structure

```
obsidian-vault-backup-template/
├── .github/
│   └── workflows/
│       ├── sync.yml              # Hourly sync + commit
│       └── staleness-check.yml   # Daily health check
├── .gitattributes                # git-crypt file selection
├── .gitignore
├── vault/                        # Synced vault contents (encrypted on GH)
├── README.md
├── AGENTS.md                     # Setup guide (agent + human friendly)
├── CONTRIBUTING.md               # Architecture, decisions, how to contribute
└── docs/
    ├── knowledge/                # Evergreen reference docs
    │   ├── overview.md
    │   └── decisions.md
    ├── troubleshooting.md
    └── logs/                     # Build narrative
```

## Cost

$4/mo for Obsidian Sync Standard. GitHub Actions and the private repo
are free (well within the 2,000 min/month limit — each run takes ~30s).
