// ── ClubHub Backend Server ──
// Express API server with built-in SQLite database matching the Collector spec:
//   - 5 core tables: clubs, events, announcements, links, posts (linked via clubId = Instagram handle)
//   - Connected to Instagram, Discord, Email, Google Calendar, and Club Websites
//   - Upserts every record by `id`
//   - Accepts collector webhook POSTs at `http://localhost:3001/api/webhook` (for DB_WEBHOOK_URL)

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import { getDb, getStats } from './database.js';
import { seedDatabase } from './seed.js';

const DIST_DIR = path.resolve(__dirname, '../dist');

// Routes
import clubsRouter from './routes/clubs.js';
import eventsRouter from './routes/events.js';
import announcementsRouter from './routes/announcements.js';
import linksRouter from './routes/links.js';
import postsRouter from './routes/posts.js';
import sourcesRouter from './routes/sources.js';
import dictionaryRouter from './routes/dictionary.js';
import schedulerRouter from './routes/scheduler.js';
import webhooksRouter from './routes/webhooks.js';
import calendarRouter from './routes/calendar.js';
import integrationsRouter from './routes/integrations.js';
import workspaceRouter from './routes/workspace.js';
import { ensurePrivateSchema } from './privateDb.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(cors());
app.use(
  express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Webhook, Collector Data, Search, and Dictionary Routes ──
app.use('/api', dictionaryRouter);
app.use('/api/webhooks', webhooksRouter);

// ── 5 Collector Table Routes + Multi-Source Connections ──
app.use('/api/clubs',         clubsRouter);
app.use('/api/events',        eventsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/links',         linksRouter);
app.use('/api/posts',         postsRouter);
app.use('/api/sources',       sourcesRouter);
app.use('/api/scheduler',     schedulerRouter);
app.use('/api/calendar',      calendarRouter);
app.use('/api/integrations',  integrationsRouter);
app.use('/api/workspace',     workspaceRouter);

// ── Stats endpoint ──
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve Production Frontend Build (`dist/`) When Present ──
if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/api') return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  res.status(500).json({ error: message });
});

// ── Initialize DB, import collector JSON + multi-source feeds, and start ──
getDb();
await ensurePrivateSchema();
if (process.env.CLUBHUB_SKIP_SEED !== '1') {
  await seedDatabase();
}

if (process.env.CLUBHUB_SKIP_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`\n🚀 ClubHub API server running at http://localhost:${PORT}`);
    console.log(`🪝 Collector Webhook (DB_WEBHOOK_URL): POST http://localhost:${PORT}/api/webhook`);
    console.log(`🔌 Multi-Source Sync:                  POST http://localhost:${PORT}/api/sources/sync`);
    console.log(`📦 Full Collector JSON from DB:        GET  http://localhost:${PORT}/api/data`);
    console.log(`🔍 Club Search:                        GET  http://localhost:${PORT}/api/search?q=cs`);
    console.log(`📖 Club Dictionary (by clubId):        GET  http://localhost:${PORT}/api/hub`);
    console.log(`🔐 Private Multi-User Workspace:       /api/workspace/*`);
    console.log(`📋 Tables: /api/clubs | /api/events | /api/announcements | /api/links | /api/posts | /api/sources`);
  });
}

export default app;
