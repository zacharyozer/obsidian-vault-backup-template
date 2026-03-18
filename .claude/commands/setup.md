# Setup

Walk the user through setting up their Obsidian vault backup. Follow each
section in order. Steps that require the Obsidian GUI are marked as
human-only -- confirm with the user before moving on.

---

## 1. Prerequisites (human-only)

These require the Obsidian desktop or mobile app. You cannot do them.
Confirm all three with the user before proceeding.

- **Obsidian Sync subscription.** Standard ($4/mo) or Plus. Purchase at
  [obsidian.md/sync](https://obsidian.md/sync) if they don't have one.

- **Remote vault created with end-to-end encryption enabled.** In Obsidian:
  Settings > Sync > Manage > Create new vault. Enable the encryption
  password when prompted.

- **Initial upload to Obsidian Sync is complete.** Open the Sync pane and
  wait until all files show as synced. This can take minutes or hours
  depending on vault size.

### iCloud migration warning

If the vault currently lives in iCloud, it must be migrated cleanly.
Obsidian Sync and iCloud must not run simultaneously on the same vault --
they will conflict and corrupt files.

Clean migration steps:

- Copy the vault folder out of iCloud to a local directory.
- Open the local copy in Obsidian.
- Set up Sync and complete the initial upload.
- Verify everything synced before deleting the iCloud copy.

Do not attempt a gradual migration. It must be all-or-nothing.

---

## 2. Gather credentials

You need 6 values. There are two paths to get them.

| Value | Description |
|---|---|
| `OBSIDIAN_EMAIL` | Obsidian account email |
| `OBSIDIAN_PASSWORD` | Obsidian account password |
| `OBSIDIAN_TOTP_SECRET` | Base32 seed from 2FA setup (the permanent seed, not a one-time code) |
| `OBSIDIAN_E2E_PASSWORD` | E2E encryption password (often the same as the account password) |
| `OBSIDIAN_VAULT_NAME` | Vault name as shown in Obsidian Settings > Sync |
| `OBSIDIAN_AUTH_TOKEN` | Optional. Workflow falls back to password+TOTP if blank |

### Path A: 1Password CLI (1 biometric prompt)

If the user stores their Obsidian credentials in 1Password, pull everything
in a single call. Ask the user for the 1Password vault name and item name,
then run:

```bash
TMPFILE=$(mktemp)
op item get "<item-name>" --vault "<vault-name>" --format json > "$TMPFILE"

OBSIDIAN_EMAIL=$(jq -r '.fields[] | select(.purpose == "USERNAME") | .value' "$TMPFILE")
OBSIDIAN_PASSWORD=$(jq -r '.fields[] | select(.purpose == "PASSWORD") | .value' "$TMPFILE")
OBSIDIAN_TOTP_SECRET=$(jq -r '.fields[] | select(.type == "OTP") | .value' "$TMPFILE")

rm -f "$TMPFILE"

# Handle otpauth:// URI format (some 1Password setups use it)
if [[ "$OBSIDIAN_TOTP_SECRET" == otpauth://* ]]; then
  OBSIDIAN_TOTP_SECRET=$(echo "$OBSIDIAN_TOTP_SECRET" | sed -n 's/.*secret=\([^&]*\).*/\1/p')
fi
```

Notes:
- Writes to a temp file because `jq` fails on 1Password JSON piped
  through shell variables (control characters in notes fields get mangled
  by shell expansion). Reading from a file avoids this.
- The TOTP field may contain a raw base32 secret or an `otpauth://` URI.
  The script handles both formats.
- E2E password is often the same as the account password. Confirm with the
  user. If it's different, ask them for it separately.
- Ask the user for `OBSIDIAN_VAULT_NAME` directly -- it's not in 1Password.

### Path B: User provides values directly

Ask the user for each value from the table above.

### About the TOTP seed

The TOTP secret is the base32 string from initial 2FA setup. It looks like
`JBSWY3DPEHPK3PXP`. If saved in a password manager, retrieve it from
there. If not saved, the user needs to disable and re-enable 2FA on their
Obsidian account to get a new seed.

---

## 3. Repo setup

### Create the repo

Two options:

**GitHub UI:** Click **Use this template** on the template repo's GitHub
page. This creates an independent private copy. (GitHub doesn't allow
private forks of public repos on free plans.)

**CLI:**

```bash
gh repo create <your-repo-name> \
  --template <owner>/obsidian-vault-backup-template \
  --private \
  --clone
```

### Initialize git-crypt

Install git-crypt if not already installed:

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
GIT_CRYPT_KEY=$(base64 < /tmp/key.bin)
rm /tmp/key.bin
```

The `GIT_CRYPT_KEY` variable now holds the base64-encoded key. Tell the
user to back up this value in a password manager.

The `.gitattributes` file is already configured to encrypt `vault/**`. No
manual git-crypt filter setup is needed.

---

## 4. Configure GitHub secrets

Set all 7 secrets. If you gathered credentials in step 2, the variables
are already in your shell session.

```bash
gh secret set OBSIDIAN_EMAIL --body "$OBSIDIAN_EMAIL"
gh secret set OBSIDIAN_PASSWORD --body "$OBSIDIAN_PASSWORD"
gh secret set OBSIDIAN_E2E_PASSWORD --body "$OBSIDIAN_PASSWORD"  # or separate value if different
gh secret set OBSIDIAN_TOTP_SECRET --body "$OBSIDIAN_TOTP_SECRET"
gh secret set OBSIDIAN_VAULT_NAME --body "<vault-name>"
gh secret set GIT_CRYPT_KEY --body "$GIT_CRYPT_KEY"
gh secret set OBSIDIAN_AUTH_TOKEN --body ""
```

`OBSIDIAN_AUTH_TOKEN` can be blank. The workflow falls back to
password+TOTP automatically.

### Security notes

- The GitHub repo **must** be private.
- The TOTP seed is the most sensitive secret -- it generates unlimited MFA
  codes. Treat it like a master key.
- GitHub Actions secrets are encrypted at rest and masked in workflow logs.

---

## 5. Test

Trigger the sync workflow and verify:

```bash
gh workflow run sync.yml
gh run watch --exit-status
```

After the run completes, verify files appear in `vault/` on GitHub.

If it fails:

```bash
gh run view --log-failed
```

See [docs/troubleshooting.md](docs/troubleshooting.md) for common issues.

---

## 6. Post-setup

### iOS

Create the vault from Sync on the iOS device: Settings > Sync > pick the
remote vault.

### Monitoring

GitHub sends email on workflow failures by default. No setup needed.

The daily health check (`staleness-check.yml`) runs at 9:00 UTC. It
alerts if no successful sync has occurred in the last 48 hours or if
the repo exceeds 50MB.

### Branch protection (recommended, requires GitHub Pro)

If you have GitHub Pro, add a branch protection rule on `main` that
blocks force pushes. This provides a server-side guard against
accidental history loss. The sync workflow's tag force-push uses a
scoped refspec (`+refs/tags/last-sync`) that can't affect branches,
but branch protection adds defense in depth.

---

## 7. Pulling updates from the template

One-time -- add the template as a remote:

```bash
git remote add template https://github.com/<owner>/obsidian-vault-backup-template.git
```

To pull updates (git-crypt must be **locked** — phantom diffs from the
git-crypt filter break `git merge`'s internal stash when unlocked):

```bash
git-crypt lock                     # if currently unlocked
git fetch template
git merge template/main
git push
git-crypt unlock /path/to/key.bin  # if you want to browse vault files locally
```
