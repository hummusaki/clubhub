// ── Email / Mailing List Ingestion Service ──
// Connects to club mailing lists and pulls announcements, event info,
// and newsletter content via IMAP or an email API.

import { getDb } from '../database.js';

export class EmailService {
  constructor() {
    this.db = getDb();
  }

  // ── Fetch & store emails from a club's mailing list ──
  async syncClubEmail(dataSourceId) {
    const db = this.db;
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source || source.platform !== 'email') {
      throw new Error(`Data source ${dataSourceId} is not an email source`);
    }

    const logEntry = db.prepare(
      'INSERT INTO sync_log (source_id, status) VALUES (?, ?)'
    ).run(dataSourceId, 'running');
    const logId = logEntry.lastInsertRowid;

    try {
      // ── In production, use IMAP (via imapflow) or Gmail API ──
      // const { ImapFlow } = await import('imapflow');
      // const client = new ImapFlow({
      //   host: config.imapHost,
      //   port: 993,
      //   secure: true,
      //   auth: { user: source.identifier, pass: source.access_token }
      // });

      const emails = await this._fetchEmails(source);

      let itemsNew = 0;
      const upsert = db.prepare(`
        INSERT INTO ingested_items
          (source_id, platform, external_id, item_type, title, body, author, url, metadata, published_at)
        VALUES (?, 'email', ?, 'email', ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, external_id) DO UPDATE SET
          body = excluded.body,
          metadata = excluded.metadata
      `);

      const processAll = db.transaction(() => {
        for (const email of emails) {
          const result = upsert.run(
            dataSourceId,
            email.messageId,
            email.subject || 'No Subject',
            email.textBody || email.htmlBody || '',
            email.from || source.identifier,
            '',  // emails don't have URLs
            JSON.stringify({
              to: email.to,
              cc: email.cc,
              hasAttachments: email.attachments?.length > 0,
            }),
            email.date
          );
          if (result.changes > 0) itemsNew++;
        }
      });
      processAll();

      // Auto-detect events and announcements from email subjects/bodies
      this._extractEventsFromEmails(emails, source);

      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         items_found = ?, items_new = ?, status = 'success' WHERE id = ?`
      ).run(emails.length, itemsNew, logId);

      db.prepare(
        `UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`
      ).run(dataSourceId);

      return { itemsFound: emails.length, itemsNew };
    } catch (err) {
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         status = 'error', error_message = ? WHERE id = ?`
      ).run(err.message, logId);
      throw err;
    }
  }

  // ── Placeholder: Replace with real IMAP / Gmail API ──
  async _fetchEmails(source) {
    // In production:
    // const client = new ImapFlow({ ... });
    // await client.connect();
    // const lock = await client.getMailboxLock('INBOX');
    // for await (const message of client.fetch('1:*', { envelope: true, source: true })) { ... }

    console.log(`📧 [Email] Would fetch emails for ${source.identifier}`);
    return [];
  }

  // ── Parse email subjects/bodies for meeting times and locations ──
  _extractEventsFromEmails(emails, source) {
    const db = this.db;

    // Common patterns in club emails
    const meetingPatterns = [
      /meeting\s+(?:on\s+)?(\w+day)\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      /(?:join us|come to|attend)\s+(?:on\s+)?(\w+day,?\s+\w+\s+\d{1,2})\s+at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
      /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(?:at\s+)?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
    ];
    const locationPattern = /(?:in|at|room|location:?)\s+([A-Z][\w\s]+(?:\d+)?)/i;

    for (const email of emails) {
      const text = `${email.subject} ${email.textBody || ''}`;
      let foundEvent = false;

      for (const pattern of meetingPatterns) {
        const match = text.match(pattern);
        if (match) {
          foundEvent = true;
          const locationMatch = text.match(locationPattern);

          const existing = db.prepare(
            `SELECT id FROM announcements WHERE source = 'email' AND source_id = ?`
          ).get(email.messageId);

          if (!existing) {
            db.prepare(`
              INSERT INTO announcements (club_id, title, body, type, source, source_id)
              VALUES (?, ?, ?, 'event', 'email', ?)
            `).run(
              source.club_id,
              email.subject || 'Meeting Notice',
              `${email.textBody || ''}\n\nLocation: ${locationMatch?.[1] || 'TBD'}`,
              email.messageId
            );
          }
          break;
        }
      }

      // Also check for urgent keywords
      if (!foundEvent && email.subject) {
        const urgentKeywords = /(?:urgent|important|cancelled|canceled|rescheduled|change)/i;
        if (urgentKeywords.test(email.subject)) {
          const existing = db.prepare(
            `SELECT id FROM announcements WHERE source = 'email' AND source_id = ?`
          ).get(email.messageId);

          if (!existing) {
            db.prepare(`
              INSERT INTO announcements (club_id, title, body, type, source, source_id)
              VALUES (?, ?, ?, 'urgent', 'email', ?)
            `).run(source.club_id, email.subject, email.textBody || '', email.messageId);
          }
        }
      }
    }
  }

  // ── Get all ingested emails for a club ──
  getClubEmails(clubId) {
    return this.db.prepare(`
      SELECT ii.* FROM ingested_items ii
      JOIN data_sources ds ON ii.source_id = ds.id
      WHERE ds.club_id = ? AND ii.platform = 'email'
      ORDER BY ii.published_at DESC
    `).all(clubId);
  }
}

export default new EmailService();
