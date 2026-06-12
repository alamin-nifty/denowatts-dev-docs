#!/bin/zsh
# Daily doc-freshness pipeline. Run by cron (see crontab -l).
#
# 1. Drift check: compares GitHub repos vs the last-reviewed baseline.
#    exit 0 = no drift (done) · exit 2 = drift found → step 2.
# 2. Headless Claude session updates the affected docs per the conventions
#    in flows/COVERAGE.md, committing each doc separately, then advances the
#    baseline with --mark-reviewed.
#
# Logs: reports/cron.log  ·  Reports: reports/drift-YYYY-MM-DD.md

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR" || exit 1

echo "=== $(date '+%Y-%m-%d %H:%M') drift check ==="
node scripts/drift-check.mjs
rc=$?
if [ $rc -ne 2 ]; then
  echo "No drift (exit $rc). Done."
  exit 0
fi

echo "--- drift found; launching doc-update session ---"
claude -p "You are the daily documentation-freshness session for the Denowatts docs repo (current directory).

1. Read the newest reports/drift-*.md file — it lists repo commits and the affected docs/sections.
2. For each affected doc: fetch the changed source files from GitHub (gh api repos/<slug>/contents/<path> with Accept: application/vnd.github.raw, ref=main) and judge whether documented BEHAVIOR changed or only line numbers shifted.
   - Behavior changed → update the doc's relevant sections (business AND {dev}) following the two-mode conventions in flows/COVERAGE.md; keep citations accurate; bump the doc's frontmatter version.
   - Only line drift → refresh the cited line numbers.
3. Never invent behavior; if a change is ambiguous, add an UNCLEAR note in the doc's Edge cases instead of guessing.
4. Commit EACH updated doc as its own git commit; the message must name the triggering repo commit SHAs from the report.
5. New uncited source files listed in the report: append them to a '## Undocumented surface' section in the same drift report file and commit it.
6. Finish by running: node scripts/drift-check.mjs --mark-reviewed, and commit the updated scripts/drift-state.json with message 'drift: mark reviewed'.

NEVER modify anything outside this docs repo." \
  --allowedTools "Read,Grep,Glob,Edit,Write,Bash(node:*),Bash(gh api:*),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),Bash(ls:*)" \
  --max-turns 80
echo "=== update session finished ($(date '+%H:%M')) ==="
