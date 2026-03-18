# Update documentation

Run this after making code changes and before pushing to the template.
Walk through each doc file and update anything that's stale. This
ensures documentation stays in sync with the code.

---

## 1. Identify what changed

Before updating docs, understand the scope of the code change:

- Did workflow behavior change? (triggers, steps, permissions, outputs)
- Did the user-facing experience change? (setup steps, monitoring, troubleshooting)
- Did the architecture change? (new files, new repos, new dependencies)
- Was a non-obvious decision made that future maintainers should understand?

---

## 2. Walk through evergreen docs

Check each file against the code changes. Update only what's stale —
don't rewrite sections that are still accurate.

### `docs/knowledge/decisions.md`

- Does the change involve a design decision or tradeoff?
- Were alternatives considered? Document what was rejected and why.
- Are existing decisions still accurate?

### `docs/knowledge/overview.md`

- Does the "How it works" section still match the workflow steps?
- Did the repo structure change? (new files, renamed files)
- Is the encryption flow diagram still accurate?

### `docs/troubleshooting.md`

- Did the monitoring behavior change? Update the "Daily health check"
  section.
- Are there new failure modes to document?
- Are existing troubleshooting entries still accurate?

### `.claude/commands/setup.md`

- Did secrets, permissions, or setup steps change?
- Does the post-setup monitoring description match the new behavior?

### `CONTRIBUTING.md`

- Does the architecture section still match the workflows?
- Is the "Key design decisions" summary still accurate?
- Does the test flow description match reality?

---

## 3. Create or update the build log

Build logs live in `docs/logs/` with the format
`YYYY-MM-DD-<topic>.md`.

A build log should capture:

- **Problem:** What was broken or missing?
- **Investigation:** What did you find? What did you try?
- **Options considered:** Table of alternatives with pros/cons.
- **Solution:** What you built and why.
- **Test results:** What passed, what failed, what was verified.
- **Key learnings:** What would you want to know next time?

If this is a small change to an existing feature, append to the
existing build log rather than creating a new one.

---

## 4. Scrub and review

Before committing:

- Remove local file paths (e.g., `/Users/someone/...`)
- Remove repo-specific details that don't belong in a template
  (specific vault names, account names, etc.)
- Remove any secrets, tokens, or credentials that may have appeared
  in debug output

**Present the doc changes to the user for review before committing.**
Build logs especially — they're the most likely to contain sensitive
details from debugging sessions.
