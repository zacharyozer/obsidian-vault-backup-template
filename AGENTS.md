# AGENTS.md

Setup guide for obsidian-vault-backup-template. Follow each section in order.
Both AI agents and humans can follow these steps. Steps that require the
Obsidian GUI are marked as human-only.

---

## 1. Prerequisites (human-only)

These three things require the Obsidian desktop or mobile app. An agent cannot
do them.

**Confirm all three before proceeding:**

- **Obsidian Sync subscription.** Standard ($4/mo) or Plus. Purchase at
  [obsidian.md/sync](https://obsidian.md/sync) if you don't have one.

- **Remote vault created with end-to-end encryption enabled.** In Obsidian:
  Settings > Sync > Manage > Create new vault. Enable the encryption password
  when prompted.

- **Initial upload to Obsidian Sync is complete.** Open the Sync pane and wait
  until all files show as synced. This can take minutes or hours depending on
  vault size.

### iCloud migration warning

If your vault currently lives in iCloud, you must migrate cleanly. Obsidian
Sync and iCloud must not run simultaneously on the same vault -- they will
conflict and corrupt files.

Clean migration steps:

- Copy your vault folder out of iCloud to a local directory.
- Open the local copy in Obsidian.
- Set up Sync and complete the initial upload.
- Verify everything synced before deleting the iCloud copy.

Do not attempt a gradual migration. It must be all-or-nothing.

---

## 2. Gather credentials

You need 6 values. Collect them before starting repo setup.

| Secret | Description |
|---|---|
| `OBSIDIAN_EMAIL` | Your Obsidian account email |
| `OBSIDIAN_PASSWORD` | Your Obsidian account password |
| `OBSIDIAN_TOTP_SECRET` | Base32 seed string from 2FA setup (not a one-time code -- the permanent seed used to generate codes) |
| `OBSIDIAN_E2E_PASSWORD` | End-to-end encryption password for the vault (often the same as your account password, but check) |
| `OBSIDIAN_VAULT_NAME` | Vault name as shown in Obsidian Settings > Sync |
| `OBSIDIAN_AUTH_TOKEN` | Optional. The workflow falls back to password+TOTP if blank |

### How to get the TOTP seed

The TOTP secret is the base32 string you received when you first set up 2FA.
It looks something like `JBSWY3DPEHPK3PXP`. If you saved it in a password
manager, retrieve it from there. If you didn't save it, you'll need to disable
and re-enable 2FA on your Obsidian account to get a new seed.

### Retrieval paths

**Option A: User provides values directly.** Paste or type each value when
prompted.

**Option B: Retrieve via 1Password CLI.** If credentials are stored in
1Password, use:

```bash
op read "op://<vault>/<item>/<field>"
```

Replace `<vault>`, `<item>`, and `<field>` with your 1Password paths.

---

## 3. Repo setup

### Create the repo

**Option A: GitHub UI.** Click **Use this template** on the template repo's
GitHub page. This creates an independent private copy. GitHub doesn't allow
private forks of public repos on free plans, so this is the recommended path.

**Option B: CLI.**

```bash
gh repo create <your-repo-name> \
  --template <owner>/obsidian-vault-backup-template \
  --private \
  --clone
```

Replace `<owner>` with the template repo's GitHub owner and `<your-repo-name>`
with your desired repo name.

### Initialize git-crypt

Install git-crypt:

```bash
# macOS
brew install git-crypt

# Linux
apt install git-crypt
```

Then initialize and export the key:

```bash
cd <your-repo-name>
git-crypt init
git-crypt export-key /tmp/key.bin
base64 < /tmp/key.bin
```

Save the base64 output. This is your `GIT_CRYPT_KEY` secret.

Back up the key file in a password manager before deleting it:

```bash
rm /tmp/key.bin
```

The `.gitattributes` file is already configured to encrypt `vault/**`. No
manual git-crypt filter setup is needed.

---

## 4. Configure GitHub secrets

Set all 7 secrets on your repo. The repo **must be private** -- these secrets
protect your vault data.

```bash
gh secret set OBSIDIAN_EMAIL --body "<your-email>"
gh secret set OBSIDIAN_PASSWORD --body "<your-password>"
gh secret set OBSIDIAN_TOTP_SECRET --body "<your-totp-seed>"
gh secret set OBSIDIAN_E2E_PASSWORD --body "<your-e2e-password>"
gh secret set OBSIDIAN_VAULT_NAME --body "<your-vault-name>"
gh secret set GIT_CRYPT_KEY --body "<base64-encoded-key>"
gh secret set OBSIDIAN_AUTH_TOKEN --body ""
```

`OBSIDIAN_AUTH_TOKEN` can be blank initially. The workflow will fall back to
password+TOTP authentication. If you have a valid auth token, set it here to
skip the login step on each run.

### Security notes

- The GitHub repo **must** be private. Vault contents are encrypted by
  git-crypt, but metadata (file names, commit history) is visible.
- The TOTP seed is the most sensitive secret. It generates unlimited MFA codes
  for your Obsidian account. Treat it like a master key.
- GitHub Actions secrets are encrypted at rest and masked in workflow logs.

---

## 5. Test

Trigger the sync workflow manually and verify it succeeds:

```bash
gh workflow run sync.yml
gh run watch --exit-status
```

After the run completes, verify files appear in the `vault/` directory on
GitHub.

If the workflow fails, check the run logs:

```bash
gh run view --log-failed
```

See [docs/troubleshooting.md](docs/troubleshooting.md) for common issues and
fixes.

---

## 6. Post-setup

### iOS setup

To access your vault on iOS, create the vault from Sync on your iOS device:
Settings > Sync > pick your remote vault. The vault will download to your
device.

### Monitoring

GitHub sends email notifications on workflow failures by default. No additional
setup is needed.

The daily health check (`staleness-check.yml`) runs automatically at 9:00 UTC.
It alerts if no vault commit has been made in the last 48 hours or if the repo
size exceeds 50MB.

---

## 7. Pulling updates from the template

If the template repo improves its workflows or configuration, you can pull
those changes into your backup repo.

One-time setup -- add the template as a remote:

```bash
git remote add template https://github.com/<owner>/obsidian-vault-backup-template.git
```

To pull updates:

```bash
git fetch template
git merge template/main
git push
```

Replace `<owner>` with the template repo's GitHub owner.
