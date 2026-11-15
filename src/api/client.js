// ── ClubHub API & Dictionary Client ──
// Clean frontend client for the SQLite database, Collector API & Multi-Source Sync.
// Automatically operates in zero-error static mode on GitHub Pages when no backend API is configured.

const EXPLICIT_API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const SESSION_TOKEN_STORAGE_KEY = 'clubhub_session_token_v1';

let inMemorySessionToken = '';

export function setApiSessionToken(token) {
  inMemorySessionToken = String(token || '').trim();
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (inMemorySessionToken) {
        sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, inMemorySessionToken);
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors
  }
}

export function getApiSessionToken() {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const saved = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      if (saved) {
        inMemorySessionToken = saved;
        return saved;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return '';
}

export function buildAuthHeaders(extraHeaders = {}) {
  const token = getApiSessionToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function isLocalhostHost() {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

function isStaticOnlyHost() {
  if (EXPLICIT_API_BASE) return false;
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  if (protocol === 'file:') return true;
  if (hostname.endsWith('.github.io')) return true;
  return false;
}

let resolvedApiBase = EXPLICIT_API_BASE || null;
let apiAvailabilityState = EXPLICIT_API_BASE
  ? 'enabled'
  : isStaticOnlyHost()
    ? 'disabled'
    : 'unprobed';
let apiProbePromise = null;
let localRetryAfter = 0;

async function resolveActiveApiBase() {
  if (EXPLICIT_API_BASE) return EXPLICIT_API_BASE;
  if (apiAvailabilityState === 'disabled') {
    if (isLocalhostHost() && Date.now() >= localRetryAfter) {
      apiAvailabilityState = 'unprobed';
    } else {
      return null;
    }
  }
  if (apiAvailabilityState === 'enabled' && resolvedApiBase) {
    return resolvedApiBase;
  }
  if (apiProbePromise) return apiProbePromise;

  const candidateBase = isLocalhostHost()
    ? window.location.port === '3001'
      ? `${window.location.origin}/api`
      : 'http://localhost:3001/api'
    : `${window.location.origin}/api`;

  apiProbePromise = (async () => {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
    try {
      const res = await fetch(`${candidateBase}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        ...(controller ? { signal: controller.signal } : {}),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.status === 'ok') {
          resolvedApiBase = candidateBase;
          apiAvailabilityState = 'enabled';
          return resolvedApiBase;
        }
      }
    } catch {
      // Backend server not running or static host — fall back silently to static snapshot mode
    } finally {
      if (timer) clearTimeout(timer);
      apiProbePromise = null;
    }

    apiAvailabilityState = 'disabled';
    if (isLocalhostHost()) {
      localRetryAfter = Date.now() + 15_000;
    }
    return null;
  })();

  return apiProbePromise;
}

async function fetchJSON(path, options = {}) {
  const activeBase = await resolveActiveApiBase();
  if (!activeBase) return null;

  try {
    const res = await fetch(`${activeBase}${path}`, {
      ...options,
      headers: buildAuthHeaders(options.headers),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (!EXPLICIT_API_BASE && isLocalhostHost() && /Failed to fetch|NetworkError/i.test(err.message || '')) {
      apiAvailabilityState = 'disabled';
      localRetryAfter = Date.now() + 15_000;
    }
    if (import.meta.env?.DEV) {
      console.warn(`[API] Failed to fetch ${path}:`, err.message);
    }
    return null;
  }
}

export async function fetchActionJSON(path, options = {}) {
  const activeBase = await resolveActiveApiBase();
  if (!activeBase) return { ok: false, offline: true, error: 'Backend API server is not reachable.' };

  try {
    const res = await fetch(`${activeBase}${path}`, {
      ...options,
      headers: buildAuthHeaders(options.headers),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        offline: false,
        status: res.status,
        ...body,
        error: body?.error || `Request failed (HTTP ${res.status})`,
      };
    }
    return { ok: true, offline: false, ...body };
  } catch (err) {
    if (!EXPLICIT_API_BASE && isLocalhostHost()) {
      apiAvailabilityState = 'disabled';
      localRetryAfter = Date.now() + 15_000;
    }
    return { ok: false, offline: true, error: err.message || 'Network request failed' };
  }
}

export function buildHubFromSnapshot(data) {
  if (!data || !Array.isArray(data.clubs)) return null;
  const dict = {};
  for (const club of data.clubs) {
    if (!club?.id) continue;
    dict[club.id] = {
      ...club,
      events: [],
      announcements: [],
      links: [],
      posts: [],
      roster: [],
    };
  }
  if (Array.isArray(data.events)) {
    for (const e of data.events) dict[e?.clubId]?.events.push(e);
  }
  if (Array.isArray(data.announcements)) {
    for (const a of data.announcements) dict[a?.clubId]?.announcements.push(a);
  }
  if (Array.isArray(data.links)) {
    for (const l of data.links) dict[l?.clubId]?.links.push(l);
  }
  if (Array.isArray(data.posts)) {
    for (const p of data.posts) dict[p?.clubId]?.posts.push(p);
  }
  if (Array.isArray(data.roster)) {
    for (const r of data.roster) dict[r?.clubId]?.roster.push(r);
  }
  return dict;
}

let cachedSnapshotPromise = null;
let cachedSnapshotAt = 0;

export async function getStaticSnapshot({ forceRefresh = false } = {}) {
  if (
    !forceRefresh &&
    cachedSnapshotPromise &&
    Date.now() - cachedSnapshotAt < 60_000
  ) {
    return cachedSnapshotPromise;
  }

  cachedSnapshotAt = Date.now();
  cachedSnapshotPromise = (async () => {
    try {
      const base = import.meta.env?.BASE_URL || './';
      const baseUri = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
      const resolvedBase = new URL(base.endsWith('/') ? base : `${base}/`, baseUri);
      const url = new URL('clubhub-data.json', resolvedBase).toString();
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) {
        cachedSnapshotPromise = null;
        return null;
      }
      const data = await res.json();
      if (data && !data.hub && Array.isArray(data.clubs)) {
        data.hub = buildHubFromSnapshot(data);
      }
      return data;
    } catch {
      cachedSnapshotPromise = null;
      return null;
    }
  })();

  return cachedSnapshotPromise;
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
export const deleteSource = id =>
  fetchJSON(withQuery('/sources', { id }), { method: 'DELETE' });
export const syncAllSources = (platform = 'all', clubId = null, extra = {}) =>
  fetchJSON('/sources/sync', {
    method: 'POST',
    body: JSON.stringify({ platform, clubId, ...extra }),
  });

// ── 3b. Discord & Email Integrations Management, Verification & Outbound Sharing (/api/integrations) ──
export const getIntegrationsStatus = (params = {}) =>
  fetchJSON(withQuery('/integrations/status', params));
export const saveIntegrationConfig = payload =>
  fetchActionJSON('/integrations/config', { method: 'PUT', body: JSON.stringify(payload) });
export const getIntegrationSubscription = accountKey =>
  fetchJSON(withQuery('/integrations/subscriptions', { accountKey }));
export const saveIntegrationSubscription = payload =>
  fetchActionJSON('/integrations/subscriptions', { method: 'PUT', body: JSON.stringify(payload) });
export const testDiscordIntegration = payload =>
  fetchActionJSON('/integrations/discord/test', { method: 'POST', body: JSON.stringify(payload) });
export const sendDiscordMessage = payload =>
  fetchActionJSON('/integrations/discord/send', { method: 'POST', body: JSON.stringify(payload) });
export async function getScoutedDiscordServers() {
  const live = await fetchJSON('/integrations/discord/scout');
  if (live && Array.isArray(live.servers)) return { ...live, mode: 'server' };

  // Static GitHub Pages fallback: read committed `public/discord-scout.json`
  try {
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');
    const res = await fetch(`${base}discord-scout.json`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.servers)) {
        return { ok: true, ...data, mode: 'static' };
      }
    }
  } catch {
    // ignore missing static snapshot
  }
  return null;
}
export const runDiscordServerScout = (payload = {}) =>
  fetchActionJSON('/integrations/discord/scout', { method: 'POST', body: JSON.stringify(payload) });
export const followDiscordAnnouncementChannel = payload =>
  fetchActionJSON('/integrations/discord/follow', { method: 'POST', body: JSON.stringify(payload) });
export const verifyEmailIntegration = payload =>
  fetchActionJSON('/integrations/email/verify', { method: 'POST', body: JSON.stringify(payload) });
export const testEmailIntegration = payload =>
  fetchActionJSON('/integrations/email/test', { method: 'POST', body: JSON.stringify(payload) });
export const sendEmailMessage = payload =>
  fetchActionJSON('/integrations/email/send', { method: 'POST', body: JSON.stringify(payload) });

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

export const getRoster = (params = {}) => fetchJSON(withQuery('/roster', params));
export const getClubRoster = id => fetchJSON(`/clubs/${encodeURIComponent(id)}/roster`);
export const createRosterEntry = data => fetchJSON('/roster', { method: 'POST', body: JSON.stringify(data) });

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
    const activeBase = (await resolveActiveApiBase()) || EXPLICIT_API_BASE;
    const baseOrigin = activeBase.replace(/\/api\/?$/, '');
    const feedHttpUrl = `${baseOrigin}/api/calendar/feed/${encodeURIComponent(cleanToken)}.ics`;
    return {
      ok: true,
      mode: 'server',
      feedHttpUrl,
      feedWebcalUrl: toWebcalUrl(feedHttpUrl),
      updatedAt: apiRes.updatedAt,
    };
  }

  // 2. Try Vite dev server feed endpoint ONLY in local development when running `npm run dev` without Express
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
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


