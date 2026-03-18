# Build log: Tag-based health check

## Problem

The staleness check (`staleness-check.yml`) used `git log` to find the
last vault commit. When the vault had no new content for 48+ hours, the
check falsely reported stale — even though sync was running successfully
every hour.

A previous fix attempt switched to a repo variable (`LAST_SYNC_SUCCESS`)
written via `gh variable set`. This introduced two bugs:

1. `variables: write` is not a valid `GITHUB_TOKEN` permission scope.
   Adding it to the `permissions:` block caused GitHub to reject the
   entire workflow file. The sync workflow stopped running on schedule.
2. `GITHUB_TOKEN` cannot write repo variables regardless of permissions
   (returns 403). The variable was never set, so the health check failed
   on every run.

## Investigation

Confirmed via GitHub REST API docs and community discussions that
`GITHUB_TOKEN` has no `variables` scope. The valid scopes are: actions,
attestations, checks, contents, deployments, discussions, id-token,
issues, models, packages, pages, pull-requests, security-events,
statuses.

Manual workflow dispatch confirmed the parse error:
`HTTP 422: failed to parse workflow: (Line: 10, Col: 3): Unexpected value 'variables'`

## Options considered

| Option | Pros | Cons |
|--------|------|------|
| Query Actions API for successful runs | No extra state | Workflow exits 0 even when sync is blocked — can't distinguish success from skip |
| Repo variable via PAT | Clean API | Extra credential to maintain |
| Commit a `.last-sync` file | Simple, reliable | Creates a commit every hour — bloats the repo |
| S3 object | Reliable, external | Requires AWS credentials as secrets |
| **Annotated git tag (chosen)** | Zero commits, zero bloat, existing permissions | Requires force-push on tag ref |
| GitHub Actions cache | No extra state | Caches expire after 7 days unused |

## Solution

Force-update an annotated `last-sync` tag after each successful sync.
The health check reads the tag's tagger date via the GitHub API.

**sync.yml** — new step after "Commit changes":
```yaml
- name: Record successful sync
  if: steps.sync.outputs.synced == 'true'
  run: |
    git tag -f -a last-sync -m "$(date -u +'%Y-%m-%d %H:%M UTC')"
    git push origin +refs/tags/last-sync
```

**staleness-check.yml** — reads tagger date via API (no checkout needed):
```yaml
- name: Check last sync age
  run: |
    TAG_REF=$(gh api repos/.../git/refs/tags/last-sync --jq '.object.sha')
    TAG_DATE=$(gh api repos/.../git/tags/$TAG_REF --jq '.tagger.date')
    # compare TAG_DATE against 48-hour threshold
```

The `+refs/tags/last-sync` refspec scopes the force-push to that single
tag ref. It cannot affect branches.

## Safety

**Branch protection** on `main` would provide a server-side guard
against accidental force pushes to branches. This requires GitHub Pro
for private repos. Without Pro, the refspec scoping is the only
safeguard — but it's strong (git physically can't force-push a branch
via a tag refspec).

**Force-push comment** in the workflow warns future editors not to change
the scoped refspec to a global `--force` flag.

## Test results

Tested on the test repo:

1. Sync workflow — all steps pass, `last-sync` tag created (annotated,
   type=tag)
2. Health check — reads tag, reports "Last successful sync: 0 hours ago",
   passes
3. Both workflows verified on `main` after merge

## Key learnings

- `GITHUB_TOKEN` permission scopes are a closed set. Adding an unknown
  scope breaks the workflow parser silently — no error until you try to
  trigger the workflow.
- Annotated git tags carry their own timestamp (tagger date), independent
  of the commit they point to. Useful for recording metadata without
  creating commits.
- The GitHub API returns the tagger date for annotated tags at
  `GET /repos/{owner}/{repo}/git/tags/{sha}` under `.tagger.date`.
