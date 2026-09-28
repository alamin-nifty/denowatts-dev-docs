#!/bin/zsh
# Daily doc-freshness pipeline. Run by cron/launchd (see crontab -l or the
# denowatts-drift launchd agent).
#
# 1. Drift check: compares the two repos (local git — this machine's clones,
#    see src/data/repos.json — exact counts, no GitHub API commit cap, no
#    token needed) vs the last-reviewed baseline.
#    exit 0 = no drift (done) · exit 2 = drift found → step 2.
# 2. SAFETY GUARD (added 2026-09-28): if the combined commit count looks like
#    a large backlog rather than a normal day's drift, stop here instead of
#    launching the auto-update session — a big backlog should go through the
#    supervised, module-by-module rollout (see the plan's S4), not an
#    unsupervised 80-turn session touching dozens of docs at once. Normal
#    daily drift (a handful of commits) still auto-updates with no
#    pre-approval, per the original design — git history is the review.
# 3. Headless Claude session updates the affected docs per the conventions
#    in flows/COVERAGE.md, committing each doc separately, then advances the
#    baseline with --mark-reviewed.
#
# Logs: reports/cron.log  ·  Reports: reports/drift-YYYY-MM-DD.md

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

BACKLOG_THRESHOLD=100

echo "=== $(date '+%Y-%m-%d %H:%M') drift check ==="
node scripts/drift-check.mjs --local
rc=$?
if [ $rc -ne 2 ]; then
  echo "No drift (exit $rc). Done."
  exit 0
fi

total_commits=$(node scripts/drift-check.mjs --local --json 2>/dev/null | node -e "
  let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{
    const d = JSON.parse(s)
    console.log(d.repos.reduce((n,r)=>n+(r.totalCommits||0),0))
  })
")
if [ "$total_commits" -gt "$BACKLOG_THRESHOLD" ]; then
  echo "--- drift found (${total_commits} commits combined) exceeds backlog threshold (${BACKLOG_THRESHOLD}) ---"
  echo "--- skipping auto-update: this looks like a backlog, not a day's drift. Run the supervised module-by-module rollout instead (see the plan). ---"
  exit 0
fi

echo "--- drift found (${total_commits} commits, within normal range); launching doc-update session ---"
claude -p "You are the daily documentation-freshness session for the Denowatts docs repo (current directory).

1. Read the newest reports/drift-*.md file — it lists repo commits and the affected docs/sections.
2. For each affected doc: fetch the changed source files from GitHub (gh api repos/<slug>/contents/<path> with Accept: application/vnd.github.raw, ref=main) and judge whether documented BEHAVIOR changed or only line numbers shifted.
   - Behavior changed → update the doc's relevant sections (business AND {dev}) following the two-mode conventions in flows/COVERAGE.md; keep citations accurate; bump the doc's frontmatter version.
   - Only line drift → refresh the cited line numbers.
3. Never invent behavior; if a change is ambiguous, add an UNCLEAR note in the doc's Edge cases instead of guessing.
4. Commit EACH updated doc as its own git commit; the message must name the triggering repo commit SHAs from the report.
5. New uncited source files listed in the report: append them to a '## Undocumented surface' section in the same drift report file and commit it.
6. Finish by running: node scripts/drift-check.mjs --local --mark-reviewed, and commit the updated scripts/drift-state.json with message 'drift: mark reviewed'.

NEVER modify anything outside this docs repo." \
  --allowedTools "Read,Grep,Glob,Edit,Write,Bash(node:*),Bash(gh api:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(ls:*)" \
  --max-turns 80
echo "=== update session finished ($(date '+%H:%M')) ==="
