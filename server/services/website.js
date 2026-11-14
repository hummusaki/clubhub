// ── Website Scraping Service ──
// Scrapes club websites for meeting info, announcements, and events.
// In production, use cheerio, puppeteer, or a headless browser.

import { getDb } from '../database.js';

export class WebsiteService {
  constructor() {
    this.db = getDb();
  }

  // ── Scrape a club's website for content ──
  async syncClubWebsite(dataSourceId) {
    const db = this.db;
    const source = db.prepare('SELECT * FROM data_sources WHERE id = ?').get(dataSourceId);
    if (!source || source.platform !== 'website') {
      throw new Error(`Data source ${dataSourceId} is not a website source`);
    }

    const logEntry = db.prepare(
      'INSERT INTO sync_log (source_id, status) VALUES (?, ?)'
    ).run(dataSourceId, 'running');
    const logId = logEntry.lastInsertRowid;

    try {
      // ── In production, fetch the page and parse with cheerio ──
      // import * as cheerio from 'cheerio';
      // const html = await (await fetch(source.identifier)).text();
      // const $ = cheerio.load(html);
      // Extract meeting times, events, announcements from page structure

      const pageContent = await this._scrapeWebsite(source);

      let itemsNew = 0;
      const upsert = db.prepare(`
        INSERT INTO ingested_items
          (source_id, platform, external_id, item_type, title, body, url, metadata, published_at)
        VALUES (?, 'website', ?, 'page_content', ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(platform, external_id) DO UPDATE SET
          body = excluded.body,
          metadata = excluded.metadata
      `);

      const processAll = db.transaction(() => {
        for (const page of pageContent) {
          const result = upsert.run(
            dataSourceId,
            page.url,
            page.title || 'Web Page',
            page.content || '',
            page.url,
            JSON.stringify({
              headings: page.headings,
              links: page.links,
              lastModified: page.lastModified,
            })
          );
          if (result.changes > 0) itemsNew++;
        }
      });
      processAll();

      // Try to extract structured event data
      this._extractEventsFromPages(pageContent, source);

      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         items_found = ?, items_new = ?, status = 'success' WHERE id = ?`
      ).run(pageContent.length, itemsNew, logId);

      db.prepare(
        `UPDATE data_sources SET last_synced = datetime('now') WHERE id = ?`
      ).run(dataSourceId);

      return { itemsFound: pageContent.length, itemsNew };
    } catch (err) {
      db.prepare(
        `UPDATE sync_log SET finished_at = datetime('now'),
         status = 'error', error_message = ? WHERE id = ?`
      ).run(err.message, logId);
      throw err;
    }
  }

  // ── Placeholder: Replace with real web scraping ──
  async _scrapeWebsite(source) {
    // In production:
    // import * as cheerio from 'cheerio';
    // const html = await (await fetch(source.identifier)).text();
    // const $ = cheerio.load(html);
    // return [{
    //   url: source.identifier,
    //   title: $('title').text(),
    //   content: $('main, article, .content').text(),
    //   headings: $('h1, h2, h3').map((_, el) => $(el).text()).get(),
    //   links: $('a[href]').map((_, el) => ({ text: $(el).text(), href: $(el).attr('href') })).get(),
    // }];

    console.log(`🌐 [Website] Would scrape ${source.identifier}`);
    return [];
  }

  // ── Extract event info from scraped page content ──
  _extractEventsFromPages(pages, source) {
    const db = this.db;

    for (const page of pages) {
      if (!page.content) continue;

      // Look for common event patterns in page text
      const eventBlocks = page.content.match(
        /(?:meeting|event|workshop|session)[\s\S]{0,200}?(?:\d{1,2}[\/\-]\d{1,2}|\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/gi
      );

      if (eventBlocks) {
        for (const block of eventBlocks) {
          db.prepare(`
            INSERT OR IGNORE INTO announcements (club_id, title, body, type, source, source_id)
            VALUES (?, ?, ?, 'event', 'website', ?)
          `).run(
            source.club_id,
            block.substring(0, 100),
            block,
            `${page.url}#${Date.now()}`
          );
        }
      }
    }
  }

  // ── Get all scraped website content for a club ──
  getClubWebContent(clubId) {
    return this.db.prepare(`
      SELECT ii.* FROM ingested_items ii
      JOIN data_sources ds ON ii.source_id = ds.id
      WHERE ds.club_id = ? AND ii.platform = 'website'
      ORDER BY ii.ingested_at DESC
    `).all(clubId);
  }
}

export default new WebsiteService();
