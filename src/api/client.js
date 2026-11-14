// ── ClubHub API & Dictionary Client ──
// Fetches and sends data to/from the backend dictionary & SQLite database.
// Automatically falls back to http://localhost:3001/api if Vite proxy isn't active.

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

// ── 1. Dictionary API (stores & sends info like a dictionary) ──
export async function getDictionary(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/dict${query ? `?${query}` : ''}`);
}

export async function getDictKey(key) {
  return fetchJSON(`/dict/${encodeURIComponent(key)}`);
}

export async function setDictKey(key, value, options = {}) {
  return fetchJSON(`/dict/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value, ...options }),
  });
}

export async function deleteDictKey(key) {
  return fetchJSON(`/dict/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

// ── 2. Unified ClubHub Dictionary (all clubs + meeting times + sources) ──
export async function getClubHub() {
  return fetchJSON('/hub');
}

export async function getClubHubEntry(clubKey) {
  return fetchJSON(`/hub/${encodeURIComponent(clubKey)}`);
}

// ── 3. Ingest from Instagram, Discord, Email, Google Calendar, Website ──
export async function ingestFromSource(platform, payload) {
  return fetchJSON(`/ingest/${encodeURIComponent(platform)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ── 4. Clubs, Events, Announcements, Members, Links, Sources ──
export async function getClubs() {
  return fetchJSON('/clubs');
}

export async function getClub(id) {
  return fetchJSON(`/clubs/${id}`);
}

export async function createClub(data) {
  return fetchJSON('/clubs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getTodaySchedule() {
  return fetchJSON('/events/today');
}

export async function getUpcomingEvents() {
  return fetchJSON('/events/upcoming');
}

export async function getEvents(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/events${query ? `?${query}` : ''}`);
}

export async function createEvent(data) {
  return fetchJSON('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getAnnouncements(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/announcements${query ? `?${query}` : ''}`);
}

export async function createAnnouncement(data) {
  return fetchJSON('/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getMembers() {
  return fetchJSON('/members');
}

export async function getClubMembers(clubId) {
  return fetchJSON(`/members/club/${clubId}`);
}

export async function getLinks(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/links${query ? `?${query}` : ''}`);
}

export async function getStats() {
  return fetchJSON('/stats');
}

export async function getDataSources(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/sources${query ? `?${query}` : ''}`);
}

export async function searchItems(params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetchJSON(`/sources/items/search${query ? `?${query}` : ''}`);
}
