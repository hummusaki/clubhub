# ClubHub — Campus Workspace

All-in-one campus workspace for **UC Santa Cruz** student organizations, built for **UCSC DevFest '26**.

- **Discover & Track 135+ UCSC Clubs**: Aggregates club profiles, flyers, meetings, deadlines, Linktrees, Google Calendars, and Discord announcements.
- **Unified Campus Calendar + Sync**: Month, week, and agenda views with `.ics` export, live `webcal://` subscriptions, and direct **Google Calendar API v3** sync.
- **Group Availability Scheduler**: Interactive When2Meet-style drag grid with group overlap heatmaps, campus event conflict indicators, shareable `?poll=` links, and 1-click booking onto your calendar.
- **Dual Deployment Architecture**:
  - **Static GitHub Pages Mode** (zero backend server required): Powered by `public/clubhub-data.json`, refreshed automatically every 2 hours via GitHub Actions.
  - **Full-Stack Express + SQLite Mode** (`server/index.js`, Node 22+ `node:sqlite`): Adds live multi-user polls, webhooks, and persistent `webcal://` feeds, and serves `dist/` automatically when built.

---
## ToDo - URGENT
- [x] Make the Discord and Email integration run on its own through a GitHub agent or action (`.github/workflows/discord-email-sync.yml` + `npm run sync:discord-email`)
- How to submit complete project if DB is gitignored?
- Clean up cramped UI elements
  - Specifically settings UI & color consistency
  - Do another mobile optimization pass
    - Maybe focus on UI consistency aspect
- Allow for more user customization
  - Allow for user profiles?
- Make Club profiles?
  - Aka turn individual club roster section into its own Club profile (but keep the overall officers and members feature)

## Quick Start

**Prerequisites:** Node.js **22+** (uses built-in `node:sqlite`).

```bash
# 1. Install dependencies
npm install

# 2. Configure optional environment variables
cp .env.example .env

# 3. Start frontend dev server (works standalone using public/clubhub-data.json)
npm run dev

# Or run both the Express + SQLite backend (:3001) and Vite dev server (:5173)
npm run dev:full
```

---

## Production Build & Deployment

### 1. GitHub Pages & Automated Cloud Sync (Zero Local Services Required)

All recurring background syncs, roster checks, directory updates, and token checks run completely in **GitHub Actions** — no local cron jobs, daemons, or background processes are needed on your machine:

- **`.github/workflows/discord-email-sync.yml` (Hourly at `15 * * * *` UTC + Manual Dispatch)**: Autonomous Discord & Email GitHub Agent (`npm run sync:discord-email`) that discovers and verifies UCSC club Discord servers via the public Discord Invite API v10 (member counts, online counts, guild metadata) + optional Discord Bot channels, indexes all 137 official UCSC club emails & IMAP mailing lists, updates `collector/clubs.json` and `public/clubhub-data.json`, and redeploys GitHub Pages.
- **`.github/workflows/deploy.yml` (Every 2 Hours + Push to `main`)**: Syncs Instagram (Business Discovery + Instaloader personal-account fallback), Linktrees, Google Calendars, Discord announcements, and email newsletters into `public/clubhub-data.json` (preserving daily club rosters), builds `./dist`, and deploys to GitHub Pages.
- **`.github/workflows/daily-roster-sync.yml` (Once Daily at `30 10 * * *` UTC)**:
  1. Checks Meta Instagram Graph API token health & remaining 60-day lifetime (`npm run ig:check-token`).
  2. Syncs the official UCSC SOMeCA student organization directory (`getinvolved.ucsc.edu`) into `collector/clubs.json`.
  3. Crawls per-club officer/member rosters and live Discord/website stats alongside every club (`npm run sync:rosters`) into `public/clubhub-data.json`, commits any changes, and redeploys GitHub Pages.

1. In your GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Configure optional repository secrets under **Settings → Secrets and variables → Actions**:
   - **Frontend Auth & Calendar OAuth (optional — app works in standalone/demo mode without them):**
     - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (`pk_live_...` or `pk_test_...`)
     - `VITE_GOOGLE_CLIENT_ID` — Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`) for 1-click Google Sign-In and live Google Calendar push sync
     - `VITE_API_BASE_URL` *(optional)* — Public Express API URL (`https://your-api.example.com/api`) if hosting the Node backend separately
   - **Scheduled Collector & Daily Roster Sync (optional — preserves committed `public/clubhub-data.json` when unset):**
     - `IG_USER_ID` & `IG_ACCESS_TOKEN` — Meta Instagram Graph API Business Discovery credentials
     - `INSTAGRAM_APP_ID` & `INSTAGRAM_APP_SECRET` — Optional Meta App credentials for automated long-lived token health/refresh checks
     - `IG_SCRAPER_SESSION_USER` & `IG_SCRAPER_SESSION_B64` — Optional Instaloader session for personal club accounts
     - `DISCORD_BOT_TOKEN`, `DISCORD_AGGREGATOR_GUILD_ID`, `DISCORD_CHANNEL_MAP` — Discord announcement ingestion & server member counts
     - `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_IMAP_HOST`, `EMAIL_IMAP_PORT` — Optional club newsletter IMAP ingestion
     - `ANTHROPIC_API_KEY` — Optional LLM event extraction enhancement

### 2. Full-Stack Single-Server Deployment (Express + Static `dist/`)

```bash
npm run build
PORT=3001 npm run server
```

When `dist/index.html` exists, `server/index.js` serves both `/api/*` and the compiled SPA from the same origin.

---

## Useful Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Vite frontend dev server |
| `npm run server` | Start Express 5 + SQLite API server on `PORT` (default `3001`) |
| `npm run dev:full` | Run API server and Vite frontend concurrently |
| `npm run sync:static` | Sync Instagram/Discord feeds and export `public/clubhub-data.json` |
| `npm run sync:discord-email` | Run the autonomous Discord & Email agent and update `collector/clubs.json` + `public/clubhub-data.json` |
| `npm run sync:rosters` | Sync official UCSC club directory + per-club rosters into SQLite & `public/clubhub-data.json` |
| `npm run ig:check-token` | Verify Meta Instagram Graph API token health & remaining lifetime |
| `npm run build` | Build production SPA bundle into `dist/` |
| `npm run preview` | Locally preview the production `dist/` bundle |
