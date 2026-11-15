// ── ClubHub Backend Server ──
// Express API server with built-in SQLite database matching the Collector spec:
//   - 5 core tables: clubs, events, announcements, links, posts (linked via clubId = Instagram handle)
//   - Connected to Instagram, Discord, Email, Google Calendar, and Club Websites
//   - Upserts every record by `id`
//   - Accepts collector webhook POSTs at `http://localhost:3001/api/webhook` (for DB_WEBHOOK_URL)

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb, getStats } from './database.js';
import { seedDatabase } from './seed.js';

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

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
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

// ── Stats endpoint ──
app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Initialize DB, import collector JSON + multi-source feeds, and start ──
getDb();
await seedDatabase();

app.listen(PORT, () => {
  console.log(`\n🚀 ClubHub API server running at http://localhost:${PORT}`);
  console.log(`🪝 Collector Webhook (DB_WEBHOOK_URL): POST http://localhost:${PORT}/api/webhook`);
  console.log(`🔌 Multi-Source Sync:                  POST http://localhost:${PORT}/api/sources/sync`);
  console.log(`📦 Full Collector JSON from DB:        GET  http://localhost:${PORT}/api/data`);
  console.log(`🔍 Club Search:                        GET  http://localhost:${PORT}/api/search?q=cs`);
  console.log(`📖 Club Dictionary (by clubId):        GET  http://localhost:${PORT}/api/hub`);
  console.log(`📋 Tables: /api/clubs | /api/events | /api/announcements | /api/links | /api/posts | /api/sources`);
});

export default app;
