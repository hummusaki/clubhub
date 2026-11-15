// ── ClubHub API & Dictionary Client ──
// Clean frontend client for the SQLite database, Collector API & Multi-Source Sync.

const API_BASE = 'http://localhost:3001/api';

async function fetchJSON(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch ${path}:`, err.message);
    return null;
  }
}

const withQuery = (base, params = {}) => {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  return `${base}${qs ? `?${qs}` : ''}`;
};

// ── 1. Collector Data, Webhook & Search ──
export const getCollectorData = (params = {}) => fetchJSON(withQuery('/data', params));
export const searchClubs = q => fetchJSON(withQuery('/search', { q }));
export const sendWebhook = payload => fetchJSON('/webhook', { method: 'POST', body: JSON.stringify(payload) });
export const importCollectorFile = file => fetchJSON('/import-file', { method: 'POST', body: JSON.stringify({ file }) });

// ── 2. Unified ClubHub Dictionary (/api/hub) & Key-Value Store (/api/dict) ──
export const getClubHub = () => fetchJSON('/hub');
export const getClubHubEntry = clubId => fetchJSON(`/hub/${encodeURIComponent(clubId)}`);
export const getDictionary = (params = {}) => fetchJSON(withQuery('/dict', params));
export const getDictKey = key => fetchJSON(`/dict/${encodeURIComponent(key)}`);
export const setDictKey = (key, value, options = {}) =>
  fetchJSON(`/dict/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, ...options }),
  });
export const deleteDictKey = key => fetchJSON(`/dict/${encodeURIComponent(key)}`, { method: 'DELETE' });

// ── 3. Multi-Source Sync & Ingestion (Instagram, Discord, Email, Google Calendar, Website) ──
export const ingestFromSource = (source, payload) =>
  fetchJSON(`/ingest/${encodeURIComponent(source)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getSources = (params = {}) => fetchJSON(withQuery('/sources', params));
export const registerSource = data => fetchJSON('/sources', { method: 'POST', body: JSON.stringify(data) });
export const syncAllSources = (platform = 'all', clubId = null) =>
  fetchJSON('/sources/sync', {
    method: 'POST',
    body: JSON.stringify({ platform, clubId }),
  });

// ── 4. Core Collector Tables (clubs, events, announcements, links, posts) ──
export const getClubs = (params = {}) => fetchJSON(withQuery('/clubs', params));
export const getClub = id => fetchJSON(`/clubs/${encodeURIComponent(id)}`);
export const createClub = data => fetchJSON('/clubs', { method: 'POST', body: JSON.stringify(data) });

export const getEvents = (params = {}) => fetchJSON(withQuery('/events', params));
export const getTodaySchedule = () => fetchJSON('/events/today');
export const getUpcomingEvents = () => fetchJSON('/events/upcoming');
export const createEvent = data => fetchJSON('/events', { method: 'POST', body: JSON.stringify(data) });

export const getAnnouncements = (params = {}) => fetchJSON(withQuery('/announcements', params));
export const createAnnouncement = data => fetchJSON('/announcements', { method: 'POST', body: JSON.stringify(data) });

export const getLinks = (params = {}) => fetchJSON(withQuery('/links', params));
export const createLink = data => fetchJSON('/links', { method: 'POST', body: JSON.stringify(data) });

export const getPosts = (params = {}) => fetchJSON(withQuery('/posts', params));
export const createPost = data => fetchJSON('/posts', { method: 'POST', body: JSON.stringify(data) });

export const getStats = () => fetchJSON('/stats');

// ── 5. Collaborative When2Meet + Google Calendar Scheduler (/api/scheduler) ──
export const getSchedulerPolls = () => fetchJSON('/scheduler/polls');
export const getSchedulerPoll = id => fetchJSON(`/scheduler/polls/${encodeURIComponent(id)}`);
export const createSchedulerPoll = data =>
  fetchJSON('/scheduler/polls', { method: 'POST', body: JSON.stringify(data) });
export const saveSchedulerResponse = (pollId, data) =>
  fetchJSON(`/scheduler/polls/${encodeURIComponent(pollId)}/respond`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
export const parseSchedulerText = data =>
  fetchJSON('/scheduler/parse-text', { method: 'POST', body: JSON.stringify(data) });
export const bookSchedulerSlot = (pollId, data) =>
  fetchJSON(`/scheduler/polls/${encodeURIComponent(pollId)}/book`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

