import { privQueryAll } from '../privateDb.js';
import { subscriptionMap } from '../../src/utils/clubSubscriptions.js';

export async function getFeedSubscriptions(userId) {
  const rows = await privQueryAll(
    'SELECT clubId, events, announcements FROM club_subscriptions WHERE userId = ?', [userId]
  );
  return subscriptionMap(rows);
}

export async function getWorkspaceClubEvents(clubIds) {
  if (!clubIds.length) return [];
  const rows = await privQueryAll(
    `SELECT id, clubId, clubName, title, start, end, allDay, location, important
     FROM club_events_private WHERE clubId IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(clubIds)]
  );
  return rows.map(row => ({
    ...row, important: Boolean(row.important), allDay: Boolean(row.allDay),
    source: 'workspace', visibility: 'members', kind: 'event',
  }));
}

export async function getOwnedPollEvents(userId) {
  const rows = await privQueryAll(
    `SELECT bookedEventsJson FROM club_polls
     WHERE createdByUserId = ? AND bookedEventsJson <> '[]'`, [userId]
  );
  return rows.flatMap(row => {
    try {
      const events = JSON.parse(row.bookedEventsJson);
      return Array.isArray(events) ? events : [];
    } catch {
      return [];
    }
  }).filter(event => event?.id && event.start)
    .map(event => ({ ...event, isBookedCollab: true, source: 'scheduler' }));
}
