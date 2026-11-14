// ── Smart Meeting Time & Location Extractor ──
// Parses unstructured text from Instagram posts, Discord messages,
// emails/mailing lists, Google Calendar events, and club websites
// to extract meeting times, dates, and locations.

import { getDb, setDictEntry } from '../database.js';

const DAY_PATTERN = /\b((?:Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)(?:day)?s?|M\/W\/F|T\/Th|Tomorrow|Today)\b/i;
const DATE_PATTERN = /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const TIME_PATTERN = /\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)(?:\s*[-–to]+\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))?)\b/;
const LOCATION_PATTERNS = [
  /(?:📍|location\s*:|where\s*:|room\s*:)\s*([^\n.,!|]+)/i,
  /\b((?:Engineering Hall|Humanities Building|Arts Center|Business Hall|Science Center|Student Union|Library|Auditorium|EH|HB|AC|BH)\s*[A-Z0-9-]{1,6})\b/i,
  /\b(?:in|at|@)\s+((?:Room|Rm|Hall|Bldg|Building|Center|Lab|Studio)\s+[A-Za-z0-9 -]{1,25})/i,
  /\b(?:moved\s+(?:from\s+[A-Za-z0-9 ]+\s*(?:→|->|to)\s*))([A-Za-z0-9 -]{2,25})/i,
];

const URGENT_PATTERN = /\b(urgent|important|room change|moved|cancelled|canceled|rescheduled|last minute)\b/i;
const EVENT_PATTERN = /\b(meeting|standup|workshop|hackathon|practice|session|rehearsal|speaker|panel|tournament|social|join us)\b/i;

/**
 * Extract structured meeting info (time, date/day, location, type) from raw text.
 */
export function extractMeetingInfo(text = '', title = '') {
  const combined = `${title}\n${text}`.trim();

  const dayMatch = combined.match(DAY_PATTERN);
  const dateMatch = combined.match(DATE_PATTERN);
  const timeMatch = combined.match(TIME_PATTERN);

  let location = null;
  for (const regex of LOCATION_PATTERNS) {
    const m = combined.match(regex);
    if (m && m[1]) {
      location = m[1].trim();
      break;
    }
  }

  const timeParts = [];
  if (dayMatch) timeParts.push(dayMatch[1]);
  if (dateMatch && (!dayMatch || !dayMatch[1].toLowerCase().includes(dateMatch[1].toLowerCase()))) {
    timeParts.push(dateMatch[1]);
  }
  if (timeMatch) timeParts.push(timeMatch[1]);

  const extractedTime = timeParts.length > 0 ? timeParts.join(' ') : null;

  let announcementType = 'info';
  if (URGENT_PATTERN.test(combined)) {
    announcementType = 'urgent';
  } else if (EVENT_PATTERN.test(combined) || extractedTime || location) {
    announcementType = 'event';
  }

  return {
    extractedTime,
    extractedLocation: location,
    day: dayMatch ? dayMatch[1] : null,
    date: dateMatch ? dateMatch[1] : null,
    time: timeMatch ? timeMatch[1] : null,
    announcementType,
    isMeetingRelated: Boolean(extractedTime || location || EVENT_PATTERN.test(combined)),
  };
}

/**
 * Ingest a single item from any platform (instagram, discord, email, google_calendar, website),
 * extract meeting times & locations, store in `ingested_items`, update `dictionary_store`,
 * and optionally create an event or announcement.
 */
export function ingestAndIndexItem({
  clubId,
  platform,
  identifier,
  externalId,
  itemType = 'post',
  title = '',
  body = '',
  author = '',
  url = '',
  mediaUrls = [],
  metadata = {},
  publishedAt = null,
  explicitTime = null,
  explicitLocation = null,
  createEventIfFound = true,
  createAnnouncementIfFound = true,
}) {
  const db = getDb();

  // 1. Find or create data_source for this club + platform
  let source = db.prepare(
    'SELECT * FROM data_sources WHERE club_id = ? AND platform = ? LIMIT 1'
  ).get(clubId, platform);

  if (!source) {
    const info = db.prepare(`
      INSERT INTO data_sources (club_id, platform, identifier, is_active, last_synced)
      VALUES (?, ?, ?, 1, datetime('now'))
    `).run(clubId, platform, identifier || `${platform}_club_${clubId}`);
    source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(info.lastInsertRowid);
  } else {
    db.prepare(`UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`).run(source.id);
  }

  // 2. Extract meeting time & location from text
  const parsed = extractMeetingInfo(body, title);
  const finalTime = explicitTime || parsed.extractedTime;
  const finalLocation = explicitLocation || parsed.extractedLocation;
  const extId = externalId || `${platform}_${clubId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const pubTime = publishedAt || new Date().toISOString();

  // 3. Upsert into ingested_items
  db.prepare(`
    INSERT INTO ingested_items (
      source_id, platform, external_id, item_type, title, body, author, url,
      media_urls, extracted_time, extracted_location, metadata, published_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, external_id) DO UPDATE SET
      title              = excluded.title,
      body               = excluded.body,
      extracted_time     = excluded.extracted_time,
      extracted_location = excluded.extracted_location,
      metadata           = excluded.metadata
  `).run(
    source.id,
    platform,
    extId,
    itemType,
    title || body.slice(0, 80) || `${platform} item`,
    body,
    author || source.identifier,
    url,
    JSON.stringify(mediaUrls),
    finalTime,
    finalLocation,
    JSON.stringify(metadata),
    pubTime
  );

  // 4. Mirror into the dictionary_store so users can query like a dictionary!
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(clubId);
  const clubKey = club?.slug || club?.abbreviation?.toLowerCase() || `club_${clubId}`;

  // Store individual item in dictionary
  setDictEntry(`${clubKey}:${platform}:${extId}`, {
    club: club?.name,
    club_key: clubKey,
    platform,
    type: itemType,
    title: title || body.slice(0, 80),
    body,
    author: author || source.identifier,
    meeting_time: finalTime,
    location: finalLocation,
    url,
    published_at: pubTime,
    metadata,
  }, { namespace: platform, clubId, source: platform });

  // If meeting time or location was discovered, update the club's latest known meeting dictionary key
  if (finalTime || finalLocation) {
    setDictEntry(`${clubKey}:latest_meeting_update`, {
      club: club?.name,
      source: platform,
      meeting_time: finalTime || club?.meeting_schedule,
      location: finalLocation || club?.meeting_location,
      raw_title: title,
      raw_text: body,
      updated_at: pubTime,
    }, { namespace: 'meetings', clubId, source: platform });
  }

  // 5. Optionally create an announcement if it's urgent or event-related
  if (createAnnouncementIfFound && parsed.isMeetingRelated) {
    const existingAnn = db.prepare(
      'SELECT id FROM announcements WHERE source = ? AND source_id = ?'
    ).get(platform, extId);

    if (!existingAnn) {
      db.prepare(`
        INSERT INTO announcements (club_id, title, body, type, source, source_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        clubId,
        title || body.slice(0, 90),
        body,
        parsed.announcementType,
        platform,
        extId
      );
    }
  }

  // 6. Optionally create an event if explicit or extracted time is found
  if (createEventIfFound && (finalTime || itemType === 'calendar_event')) {
    const existingEvt = db.prepare(
      'SELECT id FROM events WHERE source = ? AND source_id = ?'
    ).get(platform, extId);

    if (!existingEvt) {
      db.prepare(`
        INSERT INTO events (club_id, title, description, location, start_time, duration, color, source, source_id)
        VALUES (?, ?, ?, ?, ?, '1 hr', 'blue', ?, ?)
      `).run(
        clubId,
        title || `${club?.abbreviation || 'Club'} Meeting`,
        body,
        finalLocation || club?.meeting_location || 'TBD',
        pubTime,
        platform,
        extId
      );
    }
  }

  return {
    externalId: extId,
    platform,
    clubId,
    clubKey,
    extractedTime: finalTime,
    extractedLocation: finalLocation,
    announcementType: parsed.announcementType,
  };
}
