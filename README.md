# ClubHub — Campus Workspace

All-in-one campus workspace for **UC Santa Cruz** student organizations, built for **UCSC DevFest '26**.

- **Discover & Track 135+ UCSC Clubs**: Aggregates club profiles, flyers, meetings, deadlines, Linktrees, Google Calendars, and Discord announcements.
- **Unified Campus Calendar + Sync**: Month, week, and agenda views with `.ics` export, live `webcal://` subscriptions, and direct **Google Calendar API v3** sync.
- **Group Availability Scheduler**: Interactive When2Meet-style drag grid with group overlap heatmaps, campus event conflict indicators, shareable `?poll=` links, and 1-click booking onto your calendar.
- **Dual Deployment Architecture**:
  - **Static GitHub Pages Mode** (zero backend server required): Powered by `public/clubhub-data.json`, refreshed automatically every 2 hours via GitHub Actions.
  - **Full-Stack Express + SQLite Mode** (`server/index.js`, Node 22+ `node:sqlite`): Adds live multi-user polls, webhooks, and persistent `webcal://` feeds, and serves `dist/` automatically when built.

---

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

### 1. GitHub Pages (Automated CI/CD)

`.github/workflows/deploy.yml` builds and deploys `./dist` to GitHub Pages on every push to `main`, on manual `workflow_dispatch`, and on a 2-hour cron schedule (`0 */2 * * *`).

1. In your GitHub repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
2. Configure optional repository secrets under **Settings → Secrets and variables → Actions**:
   - **Frontend Auth & Calendar OAuth (optional — app works in standalone/demo mode without them):**
     - `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (`pk_live_...` or `pk_test_...`)
     - `VITE_GOOGLE_CLIENT_ID` — Google OAuth 2.0 Web Client ID (`*.apps.googleusercontent.com`) for 1-click Google Sign-In and live Google Calendar push sync
     - `VITE_API_BASE_URL` *(optional)* — Public Express API URL (`https://your-api.example.com/api`) if hosting the Node backend separately
   - **Scheduled Collector Sync (optional — preserves committed `public/clubhub-data.json` when unset):**
     - `IG_USER_ID` & `IG_ACCESS_TOKEN` — Meta Instagram Graph API Business Discovery credentials
     - `IG_SCRAPER_SESSION_USER` & `IG_SCRAPER_SESSION_B64` — Optional Instaloader session for personal club accounts
     - `DISCORD_BOT_TOKEN`, `DISCORD_AGGREGATOR_GUILD_ID`, `DISCORD_CHANNEL_MAP` — Discord announcement ingestion
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
| `npm run build` | Build production SPA bundle into `dist/` |
| `npm run preview` | Locally preview the production `dist/` bundle |
