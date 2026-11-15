#!/usr/bin/env bash
# Optional manual fallback script. All ClubHub syncs and roster checks now run automatically
# in GitHub Actions (`.github/workflows/deploy.yml` every 2h + `.github/workflows/daily-roster-sync.yml` daily)
# with zero local background services required on your PC.
# Pass `--with-rosters` to also run the daily UCSC directory & roster check locally.

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${1:-}" == "--with-rosters" ]]; then
  echo "📋 Running UCSC official directory & per-club roster sync..."
  npm run sync:rosters
fi

echo "🔄 Running full ClubHub sync (Instagram + Personal Fallback + Linktrees + Discord)..."
npm run sync:static

if ! git diff --quiet collector/clubs.json public/clubhub-data.json; then
  git add collector/clubs.json public/clubhub-data.json
  git commit -m "chore: update clubhub-data snapshot from manual sync"
  git push
  echo "✅ Pushed updated snapshot -> GitHub Pages will deploy automatically."
else
  echo "ℹ️ No changes in collector/clubs.json or public/clubhub-data.json."
fi
