// ── ClubHub Backend Server ──
// Express API server with built-in SQLite database, dictionary store,
// and multi-source data ingestion (Instagram, Discord, Email, Google Calendar, Websites).

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getDb } from './database.js';
import { seedDatabase } from './seed.js';

// Routes
import clubsRouter from './routes/clubs.js';
import eventsRouter from './routes/events.js';
import announcementsRouter from './routes/announcements.js';
import membersRouter from './routes/members.js';
import sourcesRouter from './routes/sources.js';
import linksRouter from './routes/links.js';
import dictionaryRouter from './routes/dictionary.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ── Dictionary, Hub & Ingest Routes (/api/dict, /api/hub, /api/ingest) ──
app.use('/api', dictionaryRouter);

// ── Entity API Routes ──
app.use('/api/clubs',         clubsRouter);
app.use('/api/events',        eventsRouter);
app.use('/api/announcements', announcementsRouter);
app.use('/api/members',       membersRouter);
app.use('/api/sources',       sourcesRouter);
app.use('/api/links',         linksRouter);

// ── Dashboard stats endpoint ──
app.get('/api/stats', (req, res) => {
  const db = getDb();
  const activeClubs    = db.prepare('SELECT COUNT(*) AS n FROM clubs WHERE is_active = 1').get().n;
  const totalMembers   = db.prepare('SELECT COUNT(*) AS n FROM members').get().n;
  const upcomingEvents = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
  const totalLinks     = db.prepare('SELECT COUNT(*) AS n FROM links').get().n;
  const totalIngested  = db.prepare('SELECT COUNT(*) AS n FROM ingested_items').get().n;
  const totalDictKeys  = db.prepare('SELECT COUNT(*) AS n FROM dictionary_store').get().n;

  res.json({
    activeClubs,
    totalMembers,
    upcomingEvents,
    totalLinks,
    totalIngested,
    totalDictKeys,
    sources: {
      instagram:       db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE platform = 'instagram' AND is_active = 1`).get().n,
      discord:         db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE platform = 'discord' AND is_active = 1`).get().n,
      email:           db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE platform = 'email' AND is_active = 1`).get().n,
      google_calendar: db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE platform = 'google_calendar' AND is_active = 1`).get().n,
      website:         db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE platform = 'website' AND is_active = 1`).get().n,
    },
  });
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

// ── Initialize DB & start ──
getDb();         // create tables
seedDatabase();  // seed sample data if empty

app.listen(PORT, () => {
  console.log(`\n🚀 ClubHub API server running at http://localhost:${PORT}`);
  console.log(`📖 ClubHub Dictionary: http://localhost:${PORT}/api/hub`);
  console.log(`🗂️  Key-Value Dict:     http://localhost:${PORT}/api/dict`);
  console.log(`📥 Ingest Endpoint:    POST http://localhost:${PORT}/api/ingest/:platform`);
  console.log(`📊 Dashboard stats:    http://localhost:${PORT}/api/stats`);
  console.log(`📋 Clubs:              http://localhost:${PORT}/api/clubs`);
  console.log(`📅 Events:             http://localhost:${PORT}/api/events`);
  console.log(`📢 Announcements:      http://localhost:${PORT}/api/announcements`);
  console.log(`🔌 Data Sources:       http://localhost:${PORT}/api/sources`);
});

export default app;
