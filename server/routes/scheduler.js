// ── Collaborative When2Meet + Google Calendar Scheduler Routes (/api/scheduler) ──
// Stores group collaboration polls and user free/busy availability in SQLite
// and mirrors them into `dictionary_store`.
// Connects directly with the `events` and `clubs` tables so groups can book
// overlapping times straight onto the ClubHub Calendar.

import { Router } from 'express';
import {
  getDb,
  upsertCollectorData,
  setDictEntry,
  normalizeClubId,
  formatEventRow,
} from '../database.js';

const router = Router();

// ── Initialize Scheduler Tables ─────────────────────────────────────
function initSchedulerTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_polls (
      id                 TEXT PRIMARY KEY,
      title              TEXT NOT NULL,
      description        TEXT,
      hostClubId         TEXT,
      collaboratingClubs TEXT NOT NULL DEFAULT '[]',
      dates              TEXT NOT NULL DEFAULT '[]',
      startHour          INTEGER NOT NULL DEFAULT 9,
      endHour            INTEGER NOT NULL DEFAULT 20,
      slotMinutes        INTEGER NOT NULL DEFAULT 30,
      baseTimezone       TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      location           TEXT DEFAULT 'Baskin Engineering 152',
      createdAt          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scheduler_responses (
      id           TEXT PRIMARY KEY,
      pollId       TEXT NOT NULL REFERENCES scheduler_polls(id) ON DELETE CASCADE,
      userId       TEXT NOT NULL,
      userName     TEXT NOT NULL,
      clubId       TEXT,
      clubName     TEXT,
      timezone     TEXT NOT NULL DEFAULT 'America/Los_Angeles',
      freeSlots    TEXT NOT NULL DEFAULT '[]',
      busySlots    TEXT NOT NULL DEFAULT '[]',
      rawTextInput TEXT DEFAULT '',
      updatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sched_resp_pollId ON scheduler_responses(pollId);
  `);

  seedDefaultPolls(db);
}

// ── Helper: build 7-day date list starting from current week's Monday (or Nov 16, 2026) ──
function getDefaultWeekDates() {
  // Using Mon Nov 16, 2026 -> Sun Nov 22, 2026 so it aligns with sample/collector events
  return [
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ];
}

/**
 * Convert a local date (`YYYY-MM-DD`), hour (0-23), minute (0 or 30), and IANA timezone
 * into a canonical UTC ISO string (`YYYY-MM-DDTHH:mm:00.000Z`).
 */
export function localSlotToUtcIso(dateStr, hour, minute, timeZone = 'America/Los_Angeles') {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Estimate UTC timestamp assuming UTC first, then compute the timezone's offset at that instant
    const approxUtc = new Date(Date.UTC(y, m - 1, d, hour, minute, 0, 0));
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(approxUtc);

    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const tzHour = Number(map.hour) === 24 ? 0 : Number(map.hour);
    const tzAsUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      tzHour,
      Number(map.minute),
      0,
      0
    );
    const offsetMs = tzAsUtc - approxUtc.getTime();
    return new Date(approxUtc.getTime() - offsetMs).toISOString();
  } catch {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, hour + 8, minute, 0, 0)).toISOString();
  }
}

/**
 * Generate an array of 30-min UTC ISO slot strings for a date and local hour range in `timeZone`.
 */
function makeSlotsRange(dateStr, startH, endH, timeZone = 'America/Los_Angeles') {
  const out = [];
  for (let mins = Math.round(startH * 60); mins < Math.round(endH * 60); mins += 30) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    out.push(localSlotToUtcIso(dateStr, h, m, timeZone));
  }
  return out;
}

// ── Seed realistic multi-club collaboration poll & responses ────────
function seedDefaultPolls(db) {
  const existing = db.stmt('SELECT COUNT(*) AS n FROM scheduler_polls').get().n;
  if (existing > 0) return;

  const dates = getDefaultWeekDates();
  const pollId = 'collab_ucsc_hackathon_2026';

  const poll = {
    id: pollId,
    title: 'Cross-Club Hackathon & Fall Showcase Planning',
    description:
      'Find a common meeting time for CS Club, Debate Society, Art Collective & Robotics League officers to coordinate the Fall Collaborations.',
    hostClubId: 'demo_ucsc_csclub',
    collaboratingClubs: [
      'Computer Science Club',
      'Debate Society',
      'Art Collective',
      'Robotics League',
    ],
    dates,
    startHour: 9,
    endHour: 20,
    slotMinutes: 30,
    baseTimezone: 'America/Los_Angeles',
    location: 'Baskin Engineering 152',
  };

  db.stmt(`
    INSERT INTO scheduler_polls (
      id, title, description, hostClubId, collaboratingClubs,
      dates, startHour, endHour, slotMinutes, baseTimezone, location
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poll.id,
    poll.title,
    poll.description,
    poll.hostClubId,
    JSON.stringify(poll.collaboratingClubs),
    JSON.stringify(poll.dates),
    poll.startHour,
    poll.endHour,
    poll.slotMinutes,
    poll.baseTimezone,
    poll.location
  );

  // Seed 4 club representatives across multiple timezones
  const sampleResponses = [
    {
      userId: 'alex_cs',
      userName: 'Alex Lee (CS President)',
      clubId: 'demo_ucsc_csclub',
      clubName: 'Computer Science Club',
      timezone: 'America/Los_Angeles',
      freeSlots: [
        ...makeSlotsRange(dates[0], 13, 17, 'America/Los_Angeles'), // Mon 1-5pm PT
        ...makeSlotsRange(dates[2], 14, 18, 'America/Los_Angeles'), // Wed 2-6pm PT
        ...makeSlotsRange(dates[4], 10, 15, 'America/Los_Angeles'), // Fri 10am-3pm PT
      ],
      busySlots: [
        ...makeSlotsRange(dates[1], 18, 20, 'America/Los_Angeles'), // Tue 6-8pm PT (CS Workshop)
      ],
      rawTextInput: 'Free Mon 1pm-5pm, Wed 2pm-6pm, Fri 10am-3pm; Busy Tue 6pm-8pm',
    },
    {
      userId: 'maya_debate',
      userName: 'Maya Rodriguez (Debate VP)',
      clubId: 'demo_ucsc_debate',
      clubName: 'Debate Society',
      timezone: 'America/New_York', // Viewing from East Coast (EST) -> translates to PT automatically!
      freeSlots: [
        ...makeSlotsRange(dates[0], 17, 20, 'America/New_York'),    // Mon 5-8pm EST (= 2-5pm PT)
        ...makeSlotsRange(dates[2], 17, 21, 'America/New_York'),    // Wed 5-9pm EST (= 2-6pm PT)
        ...makeSlotsRange(dates[4], 14, 18, 'America/New_York'),    // Fri 2-6pm EST (= 11am-3pm PT)
      ],
      busySlots: [
        ...makeSlotsRange(dates[3], 16.5, 18, 'America/Los_Angeles'), // Thu 4:30-6pm PT (Debate Practice)
      ],
      rawTextInput: 'Free Mon 5pm-8pm EST, Wed 5pm-9pm EST, Fri 2pm-6pm EST',
    },
    {
      userId: 'chloe_art',
      userName: 'Chloe Lindqvist (Art Collective)',
      clubId: 'demo_ucsc_artcollective',
      clubName: 'Art Collective',
      timezone: 'America/Los_Angeles',
      freeSlots: [
        ...makeSlotsRange(dates[0], 14, 16.5, 'America/Los_Angeles'), // Mon 2-4:30pm PT
        ...makeSlotsRange(dates[2], 14, 17, 'America/Los_Angeles'),   // Wed 2-5pm PT
        ...makeSlotsRange(dates[4], 11, 14, 'America/Los_Angeles'),   // Fri 11am-2pm PT
      ],
      busySlots: [
        ...makeSlotsRange(dates[5], 13, 15, 'America/Los_Angeles'),   // Sat 1-3pm PT (Studio)
      ],
      rawTextInput: 'Free Mon 2pm-4:30pm, Wed 2pm-5pm, Fri 11am-2pm',
    },
    {
      userId: 'raj_robotics',
      userName: 'Raj Nair (Robotics Lead)',
      clubId: 'ucsc_robotics',
      clubName: 'Robotics League',
      timezone: 'America/Chicago', // CST -> translates to PT automatically!
      freeSlots: [
        ...makeSlotsRange(dates[0], 16, 19, 'America/Chicago'), // Mon 4-7pm CST (= 2-5pm PT)
        ...makeSlotsRange(dates[2], 16, 19, 'America/Chicago'), // Wed 4-7pm CST (= 2-5pm PT)
      ],
      busySlots: [
        ...makeSlotsRange(dates[0], 17, 18, 'America/Los_Angeles'), // Mon 5-6pm PT
      ],
      rawTextInput: 'Free Mon 4pm-7pm CST, Wed 4pm-7pm CST',
    },
  ];

  const insertResp = db.stmt(`
    INSERT INTO scheduler_responses (
      id, pollId, userId, userName, clubId, clubName,
      timezone, freeSlots, busySlots, rawTextInput, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const r of sampleResponses) {
    const id = `${pollId}:${r.userId}`;
    insertResp.run(
      id,
      pollId,
      r.userId,
      r.userName,
      r.clubId,
      r.clubName,
      r.timezone,
      JSON.stringify(r.freeSlots),
      JSON.stringify(r.busySlots),
      r.rawTextInput
    );
    setDictEntry(`scheduler:${id}`, r, {
      namespace: 'scheduler',
      clubId: r.clubId,
      source: 'scheduler',
    });
  }
}

// ── Helper: parse natural language availability string into UTC slots ──
export function parseAvailabilityText(text = '', dates = [], timeZone = 'America/Los_Angeles') {
  const freeSlots = new Set();
  const busySlots = new Set();

  if (!text.trim() || !dates.length) {
    return { freeSlots: [], busySlots: [] };
  }

  // Map weekday prefixes ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun') to dates in the poll
  const dayToDate = {};
  for (const dateStr of dates) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
      .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      .toLowerCase()
      .slice(0, 3);
    dayToDate[weekday] = dateStr;
  }

  // Split by semicolons or newlines into segments; track whether current mode is "busy" or "free"
  const segments = text.split(/[;\n]+/);
  for (const seg of segments) {
    let mode = 'free';
    if (/\b(busy|unavailable|class|conflict|cannot|can't)\b/i.test(seg) && !/^\s*(free|available)/i.test(seg)) {
      mode = 'busy';
    }

    // Match patterns like "Mon 2pm-5pm", "Wednesday 10:30am - 1:00pm", "Tue 14:00-16:30", or "2026-11-16 2pm-4pm"
    const regex =
      /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–to]+)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;

    let match;
    while ((match = regex.exec(seg)) !== null) {
      const [, dayToken, shRaw, smRaw, sMeridiem, ehRaw, emRaw, eMeridiem] = match;
      const dateStr =
        dayToken.includes('-') ? dayToken : dayToDate[dayToken.toLowerCase().slice(0, 3)];
      if (!dateStr) continue;

      const toHours = (hStr, mStr, mer, fallbackMer) => {
        let h = parseInt(hStr, 10);
        const m = mStr ? parseInt(mStr, 10) : 0;
        const effectiveMer = (mer || fallbackMer || '').toLowerCase();
        if (effectiveMer === 'pm' && h < 12) h += 12;
        if (effectiveMer === 'am' && h === 12) h = 0;
        return h + m / 60;
      };

      const startHour = toHours(shRaw, smRaw, sMeridiem, eMeridiem);
      const endHour = toHours(ehRaw, emRaw, eMeridiem, sMeridiem);

      if (endHour > startHour) {
        const slots = makeSlotsRange(dateStr, startHour, endHour, timeZone);
        for (const s of slots) {
          if (mode === 'busy') {
            busySlots.add(s);
            freeSlots.delete(s);
          } else {
            freeSlots.add(s);
            busySlots.delete(s);
          }
        }
      }
    }
  }

  return {
    freeSlots: Array.from(freeSlots),
    busySlots: Array.from(busySlots),
  };
}

// ── Format a Poll Row + Attach Responses & Existing Calendar Events ──
function getFullPoll(pollId) {
  const db = getDb();
  const row = db.stmt('SELECT * FROM scheduler_polls WHERE id = ?').get(pollId);
  if (!row) return null;

  const responses = db
    .stmt('SELECT * FROM scheduler_responses WHERE pollId = ? ORDER BY updatedAt DESC')
    .all(pollId)
    .map(r => ({
      ...r,
      freeSlots: JSON.parse(r.freeSlots || '[]'),
      busySlots: JSON.parse(r.busySlots || '[]'),
    }));

  const events = db
    .stmt('SELECT * FROM events ORDER BY start ASC')
    .all()
    .map(formatEventRow);

  return {
    ...row,
    collaboratingClubs: JSON.parse(row.collaboratingClubs || '[]'),
    dates: JSON.parse(row.dates || '[]'),
    responses,
    calendarEvents: events,
  };
}

// ── Routes ──────────────────────────────────────────────────────────

// GET /api/scheduler/polls — list all collaboration polls with responses & calendar events
router.get('/polls', (req, res) => {
  initSchedulerTables();
  const db = getDb();
  const rows = db.stmt('SELECT id FROM scheduler_polls ORDER BY createdAt DESC').all();
  res.json(rows.map(r => getFullPoll(r.id)));
});

// GET /api/scheduler/polls/:id — single poll
router.get('/polls/:id', (req, res) => {
  initSchedulerTables();
  const poll = getFullPoll(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });
  res.json(poll);
});

// POST /api/scheduler/polls — create a new group collaboration poll
router.post('/polls', (req, res) => {
  initSchedulerTables();
  const db = getDb();
  const {
    id,
    title,
    description = '',
    hostClubId = 'demo_ucsc_csclub',
    collaboratingClubs = [],
    dates = getDefaultWeekDates(),
    startHour = 9,
    endHour = 20,
    slotMinutes = 30,
    baseTimezone = 'America/Los_Angeles',
    location = 'TBD',
  } = req.body || {};

  if (!title) return res.status(400).json({ error: 'Poll title is required' });

  const pollId = id || `collab_${Date.now()}`;
  db.stmt(`
    INSERT INTO scheduler_polls (
      id, title, description, hostClubId, collaboratingClubs,
      dates, startHour, endHour, slotMinutes, baseTimezone, location
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title              = excluded.title,
      description        = excluded.description,
      collaboratingClubs = excluded.collaboratingClubs,
      dates              = excluded.dates,
      startHour          = excluded.startHour,
      endHour            = excluded.endHour,
      baseTimezone       = excluded.baseTimezone,
      location           = excluded.location
  `).run(
    pollId,
    title,
    description,
    normalizeClubId(hostClubId),
    JSON.stringify(collaboratingClubs),
    JSON.stringify(dates),
    Number(startHour),
    Number(endHour),
    Number(slotMinutes),
    baseTimezone,
    location
  );

  const saved = getFullPoll(pollId);
  setDictEntry(`scheduler:poll:${pollId}`, saved, {
    namespace: 'scheduler',
    clubId: normalizeClubId(hostClubId),
    source: 'scheduler',
  });

  res.status(201).json(saved);
});

// POST /api/scheduler/polls/:id/respond — upsert a user's Free & Busy slots in the database
router.post('/polls/:id/respond', (req, res) => {
  initSchedulerTables();
  const db = getDb();
  const pollId = req.params.id;
  const poll = getFullPoll(pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const {
    userId = 'current_user',
    userName = 'You',
    clubId = 'demo_ucsc_csclub',
    clubName = 'Computer Science Club',
    timezone = 'America/Los_Angeles',
    freeSlots = [],
    busySlots = [],
    rawTextInput = '',
  } = req.body || {};

  // If rawTextInput is provided and parseText is requested, merge parsed slots
  let finalFree = Array.isArray(freeSlots) ? [...freeSlots] : [];
  let finalBusy = Array.isArray(busySlots) ? [...busySlots] : [];

  if (req.body?.parseText && rawTextInput) {
    const parsed = parseAvailabilityText(rawTextInput, poll.dates, timezone);
    const freeSet = new Set([...finalFree, ...parsed.freeSlots]);
    const busySet = new Set([...finalBusy, ...parsed.busySlots]);
    for (const b of busySet) freeSet.delete(b);
    finalFree = Array.from(freeSet);
    finalBusy = Array.from(busySet);
  }

  const respId = `${pollId}:${userId}`;
  db.stmt(`
    INSERT INTO scheduler_responses (
      id, pollId, userId, userName, clubId, clubName,
      timezone, freeSlots, busySlots, rawTextInput, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      userName     = excluded.userName,
      clubId       = excluded.clubId,
      clubName     = excluded.clubName,
      timezone     = excluded.timezone,
      freeSlots    = excluded.freeSlots,
      busySlots    = excluded.busySlots,
      rawTextInput = excluded.rawTextInput,
      updatedAt    = datetime('now')
  `).run(
    respId,
    pollId,
    userId,
    userName,
    normalizeClubId(clubId),
    clubName,
    timezone,
    JSON.stringify(finalFree),
    JSON.stringify(finalBusy),
    rawTextInput
  );

  // Mirror to dictionary_store so the availability is accessible via /api/dict
  setDictEntry(
    `scheduler:${respId}`,
    {
      pollId,
      userId,
      userName,
      clubId: normalizeClubId(clubId),
      clubName,
      timezone,
      freeSlots: finalFree,
      busySlots: finalBusy,
      rawTextInput,
      updatedAt: new Date().toISOString(),
    },
    { namespace: 'scheduler', clubId: normalizeClubId(clubId), source: 'scheduler' }
  );

  res.json(getFullPoll(pollId));
});

// POST /api/scheduler/parse-text — parse natural language availability into UTC ISO slots
router.post('/parse-text', (req, res) => {
  initSchedulerTables();
  const { text = '', dates = getDefaultWeekDates(), timezone = 'America/Los_Angeles' } = req.body || {};
  res.json(parseAvailabilityText(text, dates, timezone));
});

// POST /api/scheduler/polls/:id/book — book an overlapping slot directly onto the ClubHub Calendar (`events` table)
router.post('/polls/:id/book', (req, res) => {
  initSchedulerTables();
  const poll = getFullPoll(req.params.id);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  const {
    start,
    end,
    title = poll.title,
    clubId = poll.hostClubId || 'demo_ucsc_csclub',
    clubName = (poll.collaboratingClubs || []).join(' × ') || 'Club Collaboration',
    location = poll.location || 'Baskin Engineering 152',
  } = req.body || {};

  if (!start) {
    return res.status(400).json({ error: 'start (ISO UTC string) is required' });
  }

  const endIso =
    end || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const eventId = `collab_evt_${poll.id}_${new Date(start).getTime()}`;

  upsertCollectorData({
    events: [
      {
        id: eventId,
        clubId: normalizeClubId(clubId),
        clubName,
        title,
        kind: 'meeting',
        start,
        end: endIso,
        allDay: false,
        recurring: null,
        location,
        source: 'google_calendar',
      },
    ],
  });

  res.status(201).json({
    booked: true,
    eventId,
    poll: getFullPoll(poll.id),
  });
});

export default router;
