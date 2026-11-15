#!/usr/bin/env bash
# Runs the full ClubHub sync locally on your residential Wi-Fi (Instagram Business Discovery
# + Instaloader Personal-Account Fallback + Linktree/Google Calendar/Discord-Invite crawler
# + Discord Bot sync) and commits & pushes `public/clubhub-data.json` to trigger GitHub Pages.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔄 Running full ClubHub sync (Instagram + Personal Fallback + Linktrees + Discord)..."
npm run sync:static

if ! git diff --quiet public/clubhub-data.json; then
  git add public/clubhub-data.json
  git commit -m "chore: update clubhub-data snapshot from residential sync"
  git push
  echo "✅ Pushed updated public/clubhub-data.json -> GitHub Pages will deploy automatically."
else
  echo "ℹ️ No changes in public/clubhub-data.json."
fi
