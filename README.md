# ClubHub — Campus Workspace

All-in-one campus workspace for **UC Santa Cruz** student organizations, built for **UCSC DevFest '26**.

- **Discover & Track 135+ UCSC Clubs**: Aggregates club profiles, flyers, meetings, deadlines, Linktrees, Google Calendars, Discord announcements, and daily officer/member rosters.
- **Per-Club Roster Claiming, Sub-Groups & RBAC**: Authenticated students can claim their officer seat in a club roster (verified instantly when matching roster/club `.edu` credentials, or queued for Board approval), create sub-groups/committees (`Marketing`, `Events`, etc.), and unlock 1-click leadership shortcuts (`Add All Board Members`, `Add All Club Members`, `Add Group`) across polls, announcements, and tasks.
- **Real-User Availability Polls**: Interactive When2Meet-style drag grid where every responder is a verified signed-in user (zero fake demo participants), with overlap heatmaps, campus event conflict indicators, creator archive/unarchive/delete controls, and 1-click calendar booking.
- **Monday.com-Style Two-Tier Club Task Board + Personal To-Dos**: Shared `Member View` (`General Club` + `Assigned / Sub-Groups` tiers), higher-permission executive `Board View`, and strictly isolated per-club `My To-Do List` tasks.
- **Zero User PII in Public Code + Free Cloud Private DB**: Public club directory data (`public/clubhub-data.json` & `server/clubhub.db`) is strictly separated from private user data, which lives in a free remote cloud database (**Supabase Free Tier PostgreSQL + RLS** via `supabase/schema.sql` for serverless GitHub Pages, or **Turso Free Cloud SQLite + Render Free Web Service** via `render.yaml`, defaulting locally to ephemeral `:memory:`).

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

# Or run both the Express + Private/Public DB backend (:3001) and Vite dev server (:5173)
npm run dev:full

# Run the automated multi-user RBAC, poll, task board & privacy test suite
npm test
```

---

## Production Build & Cloud Deployment

### 1. Free Remote Private Database Setup (Zero Local Hosting, Zero Public PII)

Private user accounts, roster claims, sub-groups, availability poll responses, and club/personal tasks are never written to git or `public/clubhub-data.json`. Choose either 100% free cloud option:

- **Option A — Serverless GitHub Pages + Supabase Free Tier (Recommended, Zero Backend Server)**:
  1. Create a free project at [supabase.com](https://supabase.com) and run `supabase/schema.sql` in the **Supabase SQL Editor** (provisions all 9 tables, atomic roster-claiming RPCs, and strict Row-Level Security policies).
  2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **GitHub Settings → Secrets and variables → Actions** (or `.env` locally).
- **Option B — Turso Free Cloud SQLite + Render Free Web Service (`render.yaml`)**:
  1. Create a free cloud SQLite database at [turso.tech](https://turso.tech) (`turso db create clubhub-private`).
  2. Deploy `render.yaml` on Render with `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `AUTH_TOKEN_SECRET`, then set `VITE_API_BASE_URL` to your Render `/api` URL.

### 2. GitHub Pages & Automated Cloud Sync (Zero Local Services Required)

All recurring background syncs, daily roster checks, Discord server discovery, directory updates, and token checks run completely in **GitHub Actions** — no local cron jobs, daemons, or background processes are needed on your machine:

- **`.github/workflows/deploy.yml` (Every 2 Hours + Push to `main`)**: Syncs Instagram (Business Discovery + Instaloader personal-account fallback), Linktrees, Google Calendars, Discord announcements, and email newsletters into sanitized `public/clubhub-data.json` (preserving daily club rosters), builds `./dist`, and deploys to GitHub Pages.
- **`.github/workflows/daily-roster-sync.yml` (Once Daily at `30 10 * * *` UTC)**:
  1. Checks Meta Instagram Graph API token health & remaining 60-day lifetime (`npm run ig:check-token`).
  2. Syncs the official UCSC SOMeCA student organization directory (`getinvolved.ucsc.edu`) into `collector/clubs.json`.
  3. Crawls per-club officer/member rosters and live Discord/website stats alongside every club (`npm run sync:rosters`) into `public/clubhub-data.json`, commits any changes, and redeploys GitHub Pages.
- **`.github/workflows/discord-server-discovery.yml` (Weekly + Manual Dispatch)**: Discovers public UCSC club Discord invite links and live member/online counts (`npm run sync:discord-invites`).

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

### 3. Full-Stack Single-Server Deployment (Express + Static `dist/`)

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
| `npm run server` | Start Express 5 + Public/Private DB API server on `PORT` (default `3001`) |
| `npm run dev:full` | Run API server and Vite frontend concurrently |
| `npm test` | Run multi-user RBAC, roster-claiming, poll, task board & zero-PII test suites |
| `npm run sync:static` | Sync Instagram/Discord feeds and export sanitized `public/clubhub-data.json` |
| `npm run sync:rosters` | Sync official UCSC club directory + per-club rosters into SQLite & `public/clubhub-data.json` |
| `npm run sync:discord-invites` | Discover public UCSC club Discord invite links & member counts |
| `npm run ig:check-token` | Verify Meta Instagram Graph API token health & remaining lifetime |
| `npm run build` | Build production SPA bundle into `dist/` |
| `npm run preview` | Locally preview the production `dist/` bundle |
