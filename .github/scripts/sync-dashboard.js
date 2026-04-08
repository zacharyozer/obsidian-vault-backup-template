// Sync dashboard: logs run results and rebuilds the dashboard issue.
// Called by sync.yml (per-run) and optionally by staleness-check.yml (daily).
//
// Environment variables:
//   GITHUB_REPOSITORY  — owner/repo (set by GitHub Actions)
//   GH_TOKEN           — GitHub token with issues:write
//   TZ_DISPLAY         — timezone for display (default: America/New_York)
//
// Optional (set by sync.yml when logging a run):
//   SYNCED             — "true" or "false"
//   SERVER             — sync server hostname
//   REACHABLE          — "Yes" or "No"
//   RUNTIME            — runtime in seconds
//   LOG_RUN            — "true" to log a new run (vs just rebuilding dashboard)

const { execSync } = require('child_process');
const fs = require('fs');

const gh = (cmd) => execSync(`gh ${cmd}`, { encoding: 'utf8' }).trim();
const ghWithBody = (cmd, body) => {
  fs.writeFileSync('/tmp/issue-body.md', body);
  return gh(`${cmd} --body-file /tmp/issue-body.md`);
};

const LOG_LABEL = 'sync-log';
const DASH_LABEL = 'sync-dashboard';
const REPO = process.env.GITHUB_REPOSITORY;
const TZ = process.env.TZ_DISPLAY || 'America/New_York';
const now = new Date();

const fmtDate = (d) => d.toLocaleString('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).replace(',', '');

const toLocalDateStr = (d) => {
  const local = new Date(d.toLocaleString('en-US', { timeZone: TZ }));
  return local.toISOString().slice(0, 10);
};
const tsToLocalDate = (ts) => toLocalDateStr(new Date(ts));

const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: TZ });

// --- Find or create monthly log issue ---
function getLogIssue() {
  const logTitle = `Sync Log: ${monthName}`;
  let num;
  try {
    const issues = JSON.parse(gh(`issue list --label "${LOG_LABEL}" --state open --json number,title`));
    num = issues.find(i => i.title === logTitle)?.number;
  } catch {}

  if (!num) {
    try { gh(`label create "${LOG_LABEL}" --description "Sync run logs" --color 1d76db`); } catch {}
    const url = ghWithBody(`issue create --title "${logTitle}" --label "${LOG_LABEL}"`,
      `Monthly sync log. Each comment is one sync run.\n\nCreated automatically by the sync workflow.`);
    num = parseInt(url.split('/').pop());
  }
  return num;
}

// --- Log a sync run ---
function logRun(logIssueNum) {
  const synced = process.env.SYNCED === 'true';
  const server = process.env.SERVER || 'unknown';
  const reachable = process.env.REACHABLE === 'Yes';
  const runtime = parseInt(process.env.RUNTIME) || 0;
  const icon = synced ? '✅' : '❌';
  const resultWord = synced ? 'synced' : 'failed';
  const ts = fmtDate(now);

  const jsonData = JSON.stringify({
    ts: now.toISOString(),
    result: synced ? 'success' : 'failed',
    runtime_s: runtime,
    server,
    reachable,
  });

  const comment = [
    `${icon} ${ts} — ${resultWord} in ${runtime}s`,
    '',
    '<details><summary>Raw data</summary>',
    '',
    '```json',
    jsonData,
    '```',
    '',
    '</details>',
  ].join('\n');

  ghWithBody(`issue comment ${logIssueNum}`, comment);
  console.log(`Logged ${resultWord} to issue #${logIssueNum}`);
}

// --- Load all runs from log issues ---
function loadAllRuns() {
  let logIssues;
  try {
    logIssues = JSON.parse(gh(`issue list --label "${LOG_LABEL}" --state all --json number,title --limit 13`));
  } catch { logIssues = []; }

  const allRuns = [];
  for (const issue of logIssues) {
    const raw = gh(`api repos/${REPO}/issues/${issue.number}/comments?per_page=100 --paginate`);
    const comments = JSON.parse(raw.replace(/\]\[/g, ',') || '[]');
    for (const c of comments) {
      const m = c.body.match(/```json\n(.*?)\n```/s);
      if (!m) continue;
      try { allRuns.push(JSON.parse(m[1])); } catch {}
    }
  }
  console.log(`Loaded ${allRuns.length} run records from ${logIssues.length} log issues`);
  return allRuns;
}

// --- Build dashboard body from run data ---
function buildDashboard(allRuns, lastSyncLine, serverLine) {
  const todayKey = toLocalDateStr(now);

  // Daily buckets (last 30 days including today)
  const dayBuckets = {};
  for (let d = 0; d < 30; d++) {
    const key = toLocalDateStr(new Date(now - d * 86400000));
    if (!dayBuckets[key]) dayBuckets[key] = { total: 0, success: 0, runtimes: [] };
  }

  for (const run of allRuns) {
    const key = tsToLocalDate(run.ts);
    if (!dayBuckets[key]) continue;
    dayBuckets[key].total++;
    if (run.result === 'success') dayBuckets[key].success++;
    if (run.runtime_s) dayBuckets[key].runtimes.push(run.runtime_s);
  }

  const days = Object.keys(dayBuckets).sort();
  const dayLabels = days.map(d => d.split('-')[2].replace(/^0/, ''));
  const totalBars = days.map(d => dayBuckets[d].total);
  const successLine = days.map(d => dayBuckets[d].success);

  // 30-day totals
  let total30 = 0, success30 = 0, runtimes30 = [];
  for (const d of days) {
    total30 += dayBuckets[d].total;
    success30 += dayBuckets[d].success;
    runtimes30.push(...dayBuckets[d].runtimes);
  }
  const failed30 = total30 - success30;
  const uptime30 = total30 ? ((success30 / total30) * 100).toFixed(1) : '0.0';
  const avgRuntime30 = runtimes30.length
    ? Math.round(runtimes30.reduce((a, b) => a + b, 0) / runtimes30.length) : 0;
  const maxY = Math.max(28, ...totalBars) + 2;

  // Today
  const todayBucket = dayBuckets[todayKey] || { total: 0, success: 0, runtimes: [] };
  const todayFailed = todayBucket.total - todayBucket.success;
  const todayAvg = todayBucket.runtimes.length
    ? Math.round(todayBucket.runtimes.reduce((a, b) => a + b, 0) / todayBucket.runtimes.length) : 0;
  const todayLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });

  // Monthly history
  const monthBuckets = {};
  for (const run of allRuns) {
    const key = tsToLocalDate(run.ts).slice(0, 7);
    if (!monthBuckets[key]) monthBuckets[key] = { total: 0, success: 0, runtimes: [] };
    monthBuckets[key].total++;
    if (run.result === 'success') monthBuckets[key].success++;
    if (run.runtime_s) monthBuckets[key].runtimes.push(run.runtime_s);
  }

  const monthRows = Object.keys(monthBuckets).sort().reverse().map(key => {
    const b = monthBuckets[key];
    const failed = b.total - b.success;
    const uptime = b.total ? ((b.success / b.total) * 100).toFixed(1) : '0.0';
    const avg = b.runtimes.length
      ? Math.round(b.runtimes.reduce((a, c) => a + c, 0) / b.runtimes.length) : 0;
    const dt = new Date(key + '-01T12:00:00Z');
    const label = dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: TZ });
    return `| ${label} | ${b.success} | ${failed} | ${uptime}% | ${avg}s |`;
  });

  return [
    '## Sync Status',
    '',
    `**Last sync:** ${lastSyncLine}`,
    `**Server:** ${serverLine}`,
    '',
    `### Today (${todayLabel})`,
    `${todayBucket.success} success, ${todayFailed} failed | Avg runtime: ${todayAvg}s`,
    '',
    '### Past 30 Days',
    `${success30} success, ${failed30} failed | Uptime: ${uptime30}% | Avg runtime: ${avgRuntime30}s`,
    '',
    '```mermaid',
    '---',
    'config:',
    '  theme: base',
    '  themeVariables:',
    '    xyChart:',
    '      backgroundColor: "#ffffff"',
    '      plotColorPalette: "#60a5fa, #dc2626"',
    '---',
    'xychart-beta',
    '  title "Sync runs (last 30 days)"',
    `  x-axis [${dayLabels.map(l => `"${l}"`).join(',')}]`,
    `  y-axis "Runs" 0 --> ${maxY}`,
    `  bar [${totalBars.join(',')}]`,
    `  line [${successLine.join(',')}]`,
    '```',
    '',
    'Bar = total runs. Line = successful runs. Gap = failures.',
    '',
    '### Monthly History',
    '',
    '| Month | Success | Failed | Uptime | Avg Runtime |',
    '|-------|---------|--------|--------|-------------|',
    ...monthRows,
  ].join('\n');
}

// --- Find or create dashboard issue ---
function getDashIssue() {
  let num;
  try {
    const issues = JSON.parse(gh(`issue list --label "${DASH_LABEL}" --state open --json number`));
    num = issues[0]?.number;
  } catch {}
  return num;
}

function createDashIssue(body) {
  try { gh(`label create "${DASH_LABEL}" --description "Sync dashboard" --color 0e8a16`); } catch {}
  const url = ghWithBody(`issue create --title "Sync Status" --label "${DASH_LABEL}"`, body);
  const num = parseInt(url.split('/').pop());
  try { gh(`issue pin ${num}`); } catch {}
  return num;
}

// --- Main ---
const shouldLog = process.env.LOG_RUN === 'true';
const logIssueNum = getLogIssue();

if (shouldLog) {
  logRun(logIssueNum);
}

// Build last sync line
let lastSyncLine, serverLine;
if (shouldLog) {
  const synced = process.env.SYNCED === 'true';
  const icon = synced ? '✅' : '❌';
  const resultWord = synced ? 'synced' : 'failed';
  lastSyncLine = `${fmtDate(now)} (${icon} ${resultWord})`;
  serverLine = process.env.SERVER || 'unknown';
} else {
  // Rollup-only mode: preserve existing last sync info
  const dashNum = getDashIssue();
  if (dashNum) {
    const body = JSON.parse(gh(`issue view ${dashNum} --json body`)).body;
    const m1 = body.match(/\*\*Last sync:\*\* (.*)/);
    lastSyncLine = m1 ? m1[1] : 'unknown';
    const m2 = body.match(/\*\*Server:\*\* (.*)/);
    serverLine = m2 ? m2[1] : 'unknown';
  } else {
    lastSyncLine = 'unknown';
    serverLine = 'unknown';
  }
}

const allRuns = loadAllRuns();
const dashboard = buildDashboard(allRuns, lastSyncLine, serverLine);

let dashIssueNum = getDashIssue();
if (!dashIssueNum) {
  dashIssueNum = createDashIssue(dashboard);
} else {
  ghWithBody(`issue edit ${dashIssueNum}`, dashboard);
}

console.log(`Dashboard #${dashIssueNum} updated`);
