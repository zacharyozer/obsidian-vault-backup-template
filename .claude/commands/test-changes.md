# Test changes

Smoke test: trigger both workflows on the dev repo and verify they pass.
Run this after any change to dev — either standalone or as part of
`/deploy-changes`.

---

## 1. Trigger sync workflow

```bash
gh workflow run sync.yml --repo <dev-repo>
gh run watch --exit-status --repo <dev-repo>
```

Verify:
- All steps pass (especially "Record successful sync")
- The `last-sync` tag exists and is annotated:
  `gh api repos/<dev-repo>/git/refs/tags/last-sync`
- If there were vault changes, a "vault snapshot" commit was pushed

Check logs for unexpected warnings. The "Auth token expired" warning
is expected and benign — it means the TOTP fallback kicked in.

---

## 2. Trigger health check workflow

```bash
gh workflow run staleness-check.yml --repo <dev-repo>
gh run watch --exit-status --repo <dev-repo>
```

Verify:
- "Check last sync age" passes and reports a reasonable age
- "Check repo size" passes

Check the age output:
```bash
gh run view <run-id> --repo <dev-repo> --log | grep "Last successful sync"
```

Expected: "Last successful sync: 0 hours ago" (or a small number if
sync ran recently).

---

## 3. Report results

Summarize what passed and flag anything unexpected. If either workflow
failed, check the logs:

```bash
gh run view <run-id> --repo <dev-repo> --log-failed
```
