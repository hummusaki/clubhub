// ── ClubHub API & Dictionary Client ──
// Clean frontend client for the SQLite database, Collector API & Multi-Source Sync.

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

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

export async function getStaticSnapshot() {
  try {
    const base = import.meta.env.BASE_URL || './';
    const url = `${base.endsWith('/') ? base : `${base}/`}clubhub-data.json`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
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
export const syncAllSources = (platform = 'all', clubId = null, extra = {}) =>
  fetchJSON('/sources/sync', {
    method: 'POST',
    body: JSON.stringify({ platform, clubId, ...extra }),
  });

// ── 4. Core Collector Tables (clubs, events, announcements, links, posts) ──
export const getClubs = (params = {}) => fetchJSON(withQuery('/clubs', params));
export const getClub = id => fetchJSON(`/clubs/${encodeURIComponent(id)}`);
export const createClub = data => fetchJSON('/clubs', { method: 'POST', body: JSON.stringify(data) });

export const getEvents = (params = {}) => fetchJSON(withQuery('/events', params));
export const getTodaySchedule = () => fetchJSON('/events/today');
export const getUpcomingEvents = () => fetchJSON('/events/upcoming');
export const createEvent = data => fetchJSON('/events', { method: 'POST', body: JSON.stringify(data) });
export const deleteEvent = id => fetchJSON(`/events/${encodeURIComponent(id)}`, { method: 'DELETE' });

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
export const unbookSchedulerSlot = (pollId, data) =>
  fetchJSON(`/scheduler/polls/${encodeURIComponent(pollId)}/unbook`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

// ── 6. Live Calendar Sync Feed (/api/calendar & Vite Dev Fallback) ──
function toWebcalUrl(httpUrl) {
  if (!httpUrl) return '';
  return String(httpUrl).replace(/^https?:\/\//i, 'webcal://');
}

export async function syncCalendarFeedProfile(token, payload = {}) {
  const cleanToken = String(token || '').replace(/\.ics$/i, '').trim();
  if (!cleanToken) return { ok: false, mode: 'local', feedHttpUrl: '', feedWebcalUrl: '' };

  // 1. Try primary Express SQLite API server first
  const apiRes = await fetchJSON(`/calendar/profile/${encodeURIComponent(cleanToken)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  if (apiRes && apiRes.ok) {
    const baseOrigin = API_BASE.replace(/\/api\/?$/, '');
    const feedHttpUrl = `${baseOrigin}/api/calendar/feed/${encodeURIComponent(cleanToken)}.ics`;
    return {
      ok: true,
      mode: 'server',
      feedHttpUrl,
      feedWebcalUrl: toWebcalUrl(feedHttpUrl),
      updatedAt: apiRes.updatedAt,
    };
  }

  // 2. Try Vite dev/preview server feed endpoint when running `npm run dev` without Express
  if (typeof window !== 'undefined') {
    try {
      const devUrl = `${window.location.origin}/__clubhub_cal/profile/${encodeURIComponent(cleanToken)}`;
      const res = await fetch(devUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          const feedHttpUrl = `${window.location.origin}/__clubhub_cal/feed/${encodeURIComponent(cleanToken)}.ics`;
          return {
            ok: true,
            mode: 'dev-feed',
            feedHttpUrl,
            feedWebcalUrl: toWebcalUrl(feedHttpUrl),
            updatedAt: data.updatedAt,
          };
        }
      }
    } catch {
      // Static hosting without server middleware — graceful local .ics / Google OAuth mode
    }
  }

  return {
    ok: false,
    mode: 'static',
    feedHttpUrl: '',
    feedWebcalUrl: '',
  };
}


