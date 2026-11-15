// ── Email Integration Service (Inbound IMAP + Webhooks & Outbound SMTP / Resend / SendGrid) ──
// Zero-dependency Node 22 implementation supporting:
//   1. Live IMAP4rev1 inbox sync (Gmail / UCSC Google Workspace App Password / standard IMAP)
//      using BODY.PEEK[] so unread status in the inbox is preserved.
//   2. Inbound Email Webhooks (Resend, SendGrid, Mailgun, Cloudflare Email Workers, Google Apps Script).
//   3. Outbound Emails (HTML + Plain Text + .ics Calendar Attachment) via SMTP (implicit TLS 465 or
//      STARTTLS 587), Resend HTTP API, or SendGrid HTTP API.

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  formatPostRow,
  normalizeClubId,
  getIntegrationConfig,
  saveIntegrationConfig,
  maskSecret,
} from '../database.js';
import { ingestResourceItem, getDataSources } from './resourceIngestor.js';
import { buildIcsCalendar } from '../../src/utils/calendarSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLUBS_JSON_PATH = path.resolve(__dirname, '../../collector/clubs.json');

const DEMO_EMAILS = [
  {
    id: 'email_cs_newsletter_1',
    clubId: 'demo_ucsc_csclub',
    clubName: 'Computer Science Club',
    identifier: 'csclub@ucsc.edu',
    title: '[CS Club Mailing List] Weekly Digest & Technical Interview Prep',
    caption:
      '📧 [Mailing List: csclub@ucsc.edu] Reminder: Technical Interview Prep session this Wednesday from 7pm to 8:30pm in Baskin Engineering 152. Slides: https://docs.google.com/presentation/d/demoCSPrep',
  },
  {
    id: 'email_art_newsletter_1',
    clubId: 'demo_ucsc_artcollective',
    clubName: 'Art Collective',
    identifier: 'artcollective@ucsc.edu',
    title: '[Art Collective Newsletter] Winter Zine Submissions Open',
    caption:
      '📧 [Mailing List: artcollective@ucsc.edu] Submit your artwork for the Winter Zine! Open studio hours every Sunday at 1pm in Porter D-Building studio 3B.',
  },
];

export function isMaskedSecret(val) {
  return typeof val === 'string' && val.includes('••••');
}

export function isValidEmailAddress(addr = '') {
  const s = String(addr || '').trim();
  return /^[^\s@<>,"']+@[^\s@<>,"']+\.[^\s@<>,"']+$/.test(s) && !/[\r\n]/.test(s);
}

function escapeHtml(str = '') {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(s = '') {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Normalize Google App Passwords (which Google displays as "abcd efgh ijkl mnop")
 * when connecting to Gmail / Google Workspace hosts.
 */
function normalizeMailPassword(password = '', host = '') {
  const raw = String(password || '').trim();
  if (/gmail\.com|googlemail\.com/i.test(host) && /^[a-z]{4}(\s+[a-z]{4}){3}$/i.test(raw)) {
    return raw.replace(/\s+/g, '');
  }
  return raw;
}

export function getEffectiveEmailConfig() {
  const saved = getIntegrationConfig('email_global')?.config || {};

  const emailUser = String(saved.emailUser ?? process.env.EMAIL_USER ?? '').trim();
  const rawPass = String(saved.emailPassword ?? process.env.EMAIL_PASSWORD ?? '').trim();

  const isGmailLike = /@(gmail\.com|ucsc\.edu|googlemail\.com)$/i.test(emailUser);
  const imapHost = String(
    saved.imapHost || process.env.EMAIL_IMAP_HOST || (isGmailLike ? 'imap.gmail.com' : '')
  ).trim();
  const imapPort = Number(saved.imapPort || process.env.EMAIL_IMAP_PORT || 993) || 993;
  const imapTls =
    saved.imapTls !== undefined
      ? Boolean(saved.imapTls)
      : process.env.EMAIL_IMAP_TLS !== undefined
        ? process.env.EMAIL_IMAP_TLS !== 'false'
        : imapPort === 993;
  const imapMailbox = String(
    saved.imapMailbox || process.env.EMAIL_IMAP_MAILBOX || 'INBOX'
  ).trim();

  const smtpHost = String(
    saved.smtpHost || process.env.EMAIL_SMTP_HOST || (isGmailLike ? 'smtp.gmail.com' : '')
  ).trim();
  const smtpPort = Number(saved.smtpPort || process.env.EMAIL_SMTP_PORT || 465) || 465;
  const smtpSecure =
    saved.smtpSecure !== undefined
      ? Boolean(saved.smtpSecure)
      : process.env.EMAIL_SMTP_SECURE !== undefined
        ? process.env.EMAIL_SMTP_SECURE !== 'false'
        : smtpPort === 465;

  const emailPassword = normalizeMailPassword(rawPass, imapHost || smtpHost);

  const resendApiKey = String(saved.resendApiKey ?? process.env.RESEND_API_KEY ?? '').trim();
  const sendgridApiKey = String(saved.sendgridApiKey ?? process.env.SENDGRID_API_KEY ?? '').trim();

  const fromEmail = String(
    saved.fromEmail ||
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      emailUser ||
      (resendApiKey ? 'onboarding@resend.dev' : '')
  ).trim();
  const fromName = String(saved.fromName || process.env.EMAIL_FROM_NAME || 'ClubHub Campus Sync').trim();
  const defaultRecipient = String(saved.defaultRecipient || process.env.EMAIL_DEFAULT_TO || emailUser || '').trim();
  const defaultClubId = saved.defaultClubId ? normalizeClubId(saved.defaultClubId) : '';
  const provider = String(saved.provider || process.env.EMAIL_PROVIDER || 'auto').trim().toLowerCase();
  const lookbackDays = Math.min(Math.max(Number(saved.lookbackDays || process.env.EMAIL_LOOKBACK_DAYS || 30), 1), 180);

  const imapReady = Boolean(imapHost && emailUser && emailPassword);
  const smtpReady = Boolean(smtpHost && emailUser && emailPassword);
  const resendReady = Boolean(resendApiKey);
  const sendgridReady = Boolean(sendgridApiKey && fromEmail);

  return {
    provider,
    emailUser,
    emailPassword,
    passwordSource: saved.emailPassword ? 'saved' : rawPass ? 'env' : 'none',
    imapHost,
    imapPort,
    imapTls,
    imapMailbox,
    smtpHost,
    smtpPort,
    smtpSecure,
    resendApiKey,
    resendKeySource: saved.resendApiKey ? 'saved' : resendApiKey ? 'env' : 'none',
    sendgridApiKey,
    sendgridKeySource: saved.sendgridApiKey ? 'saved' : sendgridApiKey ? 'env' : 'none',
    fromEmail,
    fromName,
    defaultRecipient,
    defaultClubId,
    lookbackDays,
    imapReady,
    smtpReady,
    resendReady,
    sendgridReady,
    inboundReady: imapReady,
    outboundReady: resendReady || sendgridReady || smtpReady,
  };
}

// ── RFC 2047, Quoted-Printable, Base64, HTML & Multipart MIME Parser ──

export function decodeQuotedPrintableBuffer(input = '') {
  const cleaned = String(input || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const charBytes = Buffer.from(cleaned[i], 'utf8');
      for (const b of charBytes) bytes.push(b);
    }
  }
  return Buffer.from(bytes);
}

export function decodeMimeWords(str = '') {
  if (!str) return '';
  // Join adjacent encoded words separated only by whitespace per RFC 2047
  const joined = String(str).replace(/\?=\s+=\?/g, '?==?');
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, enc, text) => {
    try {
      let buf;
      if (enc.toUpperCase() === 'B') {
        buf = Buffer.from(text.replace(/\s+/g, ''), 'base64');
      } else {
        buf = decodeQuotedPrintableBuffer(text.replace(/_/g, ' '));
      }
      const cs = String(charset || 'utf-8').toLowerCase();
      if (cs === 'iso-8859-1' || cs === 'latin1') {
        return buf.toString('latin1');
      }
      return buf.toString('utf8');
    } catch {
      return text;
    }
  });
}

function decodeHtmlEntities(str = '') {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

export function htmlToReadableTextAndLinks(html = '') {
  if (!html) return { text: '', links: [] };
  const extractedLinks = [];
  const seenUrls = new Set();

  let working = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|head|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  // Preserve meaningful hyperlinks (<a href="...">Label</a>) so form/Zoom/Discord URLs aren't lost
  working = working.replace(
    /<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi,
    (_, u1, u2, u3, innerHtml) => {
      const rawHref = decodeHtmlEntities(u1 || u2 || u3 || '').trim();
      const label = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
      if (
        /^https?:\/\//i.test(rawHref) &&
        !/unsubscribe|list-manage\.com\/unsubscribe|mailto:|open\.substack\.com\/pub\/.*\/track/i.test(rawHref)
      ) {
        if (!seenUrls.has(rawHref)) {
          seenUrls.add(rawHref);
          extractedLinks.push({ url: rawHref, label: label || rawHref });
        }
        if (label && !label.includes(rawHref)) {
          return `${label} (${rawHref})`;
        }
        return rawHref;
      }
      return label;
    }
  );

  const text = decodeHtmlEntities(
    working
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text, links: extractedLinks };
}

function parseHeadersBlock(rawHeaderText = '') {
  const unfolded = String(rawHeaderText || '').replace(/\r?\n[ \t]+/g, ' ');
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = decodeMimeWords(line.slice(idx + 1).trim());
    if (headers[key]) {
      headers[key] = `${headers[key]}, ${val}`;
    } else {
      headers[key] = val;
    }
  }
  return headers;
}

function decodeBodyPart(rawBody = '', transferEncoding = '', charset = 'utf-8') {
  const enc = String(transferEncoding || '').trim().toLowerCase();
  const cs = String(charset || 'utf-8').trim().toLowerCase();
  let buf;
  if (enc === 'base64') {
    buf = Buffer.from(String(rawBody || '').replace(/\s+/g, ''), 'base64');
  } else if (enc === 'quoted-printable') {
    buf = decodeQuotedPrintableBuffer(rawBody);
  } else {
    return String(rawBody || '');
  }
  if (cs === 'iso-8859-1' || cs === 'latin1') {
    return buf.toString('latin1');
  }
  return buf.toString('utf8');
}

function extractMimeParts(rawMessage = '') {
  const str = String(rawMessage || '');
  const sepMatch = str.match(/\r?\n\r?\n/);
  const headerText = sepMatch ? str.slice(0, sepMatch.index) : str;
  const bodyText = sepMatch ? str.slice(sepMatch.index + sepMatch[0].length) : '';

  const headers = parseHeadersBlock(headerText);
  const contentType = headers['content-type'] || 'text/plain; charset=utf-8';
  const transferEncoding = headers['content-transfer-encoding'] || '';
  const charsetMatch = contentType.match(/charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i);
  const charset = charsetMatch ? charsetMatch[1] || charsetMatch[2] || charsetMatch[3] : 'utf-8';

  if (/^multipart\//i.test(contentType)) {
    const boundaryMatch = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s;]+))/i);
    const boundary = boundaryMatch ? boundaryMatch[1] || boundaryMatch[2] || boundaryMatch[3] : null;
    if (boundary) {
      const marker = `--${boundary}`;
      const segments = bodyText.split(marker);
      const collected = { plain: [], html: [], calendar: [], headers };
      // Skip preamble (index 0); stop at closing `--`
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.startsWith('--')) break;
        const trimmedSeg = seg.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
        if (!trimmedSeg.trim()) continue;
        const sub = extractMimeParts(trimmedSeg);
        collected.plain.push(...sub.plain);
        collected.html.push(...sub.html);
        collected.calendar.push(...sub.calendar);
      }
      return collected;
    }
  }

  const disposition = headers['content-disposition'] || '';
  if (/^attachment/i.test(disposition) && !/text\/calendar/i.test(contentType)) {
    return { plain: [], html: [], calendar: [], headers };
  }

  const decoded = decodeBodyPart(bodyText, transferEncoding, charset);
  if (/text\/html/i.test(contentType)) {
    return { plain: [], html: [decoded], calendar: [], headers };
  }
  if (/text\/calendar/i.test(contentType)) {
    return { plain: [], html: [], calendar: [decoded], headers };
  }
  if (/^text\//i.test(contentType) || !headers['content-type']) {
    return { plain: [decoded], html: [], calendar: [], headers };
  }
  return { plain: [], html: [], calendar: [], headers };
}

export function parseEmailAddressField(raw = '') {
  const decoded = decodeMimeWords(String(raw || '').trim());
  const angleMatch = decoded.match(/^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>/);
  if (angleMatch) {
    return {
      name: (angleMatch[1] || '').trim().replace(/^"+|"+$/g, ''),
      address: angleMatch[2].trim().toLowerCase(),
    };
  }
  const plainMatch = decoded.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (plainMatch) {
    const addr = plainMatch[1].toLowerCase();
    const rest = decoded.replace(plainMatch[0], '').replace(/[<>()"']/g, '').trim();
    return { name: rest, address: addr };
  }
  return { name: decoded, address: '' };
}

/**
 * Parse a complete raw RFC 5322 / MIME email into clean text, subject, addresses, date, and links.
 */
export function parseRawMimeEmail(rawMime = '') {
  const parts = extractMimeParts(rawMime);
  const headers = parts.headers || {};

  const from = parseEmailAddressField(headers.from || headers.sender || '');
  const replyTo = parseEmailAddressField(headers['reply-to'] || '');
  const toAddresses = [headers.to, headers['delivered-to'], headers['x-original-to'], headers.cc]
    .filter(Boolean)
    .flatMap(v => String(v).split(','))
    .map(v => parseEmailAddressField(v).address)
    .filter(Boolean);

  const subject = (headers.subject || '').trim() || 'Club Newsletter Update';
  const messageId = (headers['message-id'] || '').replace(/[<>]/g, '').trim();
  const parsedDate = headers.date ? new Date(headers.date) : null;
  const postedAt =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  const htmlCombined = parts.html.join('\n');
  const htmlParsed = htmlCombined ? htmlToReadableTextAndLinks(htmlCombined) : { text: '', links: [] };
  const plainCombined = parts.plain.join('\n').trim();

  // Prefer plain text when substantial, but append any links discovered only in the HTML version
  let text = plainCombined.length >= 24 ? plainCombined : htmlParsed.text || plainCombined;
  for (const link of htmlParsed.links) {
    if (link.url && !text.includes(link.url)) {
      text += `\n${link.label && link.label !== link.url ? `${link.label}: ` : ''}${link.url}`;
    }
  }

  return {
    messageId,
    subject,
    from,
    replyTo,
    toAddresses,
    postedAt,
    text: text.trim(),
    html: htmlCombined,
    links: htmlParsed.links,
    calendarParts: parts.calendar,
  };
}

// ── Club Matching for Inbound Emails ──

export function loadEmailClubsCatalog() {
  let fileClubs = [];
  try {
    if (fs.existsSync(CLUBS_JSON_PATH)) {
      fileClubs = JSON.parse(fs.readFileSync(CLUBS_JSON_PATH, 'utf8'));
    }
  } catch {
    fileClubs = [];
  }

  let dbClubs = [];
  try {
    dbClubs = getDb().stmt('SELECT id, name, instagram, alsoKnownAs, email FROM clubs').all();
  } catch {
    dbClubs = [];
  }

  const byId = new Map();
  for (const c of fileClubs) {
    const cid = normalizeClubId(c.instagram || c.id);
    if (!cid) continue;
    byId.set(cid.toLowerCase(), {
      id: cid,
      name: c.name || cid,
      alsoKnownAs: Array.isArray(c.alsoKnownAs) ? c.alsoKnownAs : [],
      emails: c.email ? [String(c.email).trim().toLowerCase()] : [],
    });
  }

  for (const c of dbClubs) {
    const cid = normalizeClubId(c.id || c.instagram);
    if (!cid) continue;
    const existing = byId.get(cid.toLowerCase());
    if (existing) {
      if (c.email && !existing.emails.includes(String(c.email).trim().toLowerCase())) {
        existing.emails.push(String(c.email).trim().toLowerCase());
      }
      continue;
    }
    let aka = [];
    try {
      aka = JSON.parse(c.alsoKnownAs || '[]');
    } catch {
      aka = [];
    }
    byId.set(cid.toLowerCase(), {
      id: cid,
      name: c.name || cid,
      alsoKnownAs: Array.isArray(aka) ? aka : [],
      emails: c.email ? [String(c.email).trim().toLowerCase()] : [],
    });
  }

  return [...byId.values()];
}

export function matchClubFromEmail(
  {
    explicitClubId = null,
    defaultClubId = null,
    from = { name: '', address: '' },
    replyTo = { name: '', address: '' },
    toAddresses = [],
    subject = '',
    text = '',
  } = {},
  catalog = [],
  savedSources = []
) {
  if (explicitClubId) {
    const cid = normalizeClubId(explicitClubId);
    const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
    return { clubId: found ? found.id : cid, clubName: found?.name || null };
  }

  // 1. Check `+clubHandle` subaddressing on recipient (e.g. clubhub+ucsc_acm@gmail.com)
  for (const toAddr of toAddresses || []) {
    const plusMatch = String(toAddr).match(/^[^+@]+\+([a-zA-Z0-9._-]+)@/);
    if (plusMatch) {
      const tag = normalizeClubId(plusMatch[1]);
      const exact = catalog.find(
        c => c.id.toLowerCase() === tag.toLowerCase() || slugify(c.id) === slugify(tag)
      );
      if (exact) return { clubId: exact.id, clubName: exact.name };
    }
  }

  // Extract forwarded `From:` address/name if a user forwarded a club newsletter into the inbox
  let forwardedFrom = { name: '', address: '' };
  const fwdBlockMatch = String(text || '').match(
    /(?:Forwarded message|Begin forwarded message)[\s\S]{0,240}?From:\s*([^\r\n]+)/i
  );
  if (fwdBlockMatch) {
    forwardedFrom = parseEmailAddressField(fwdBlockMatch[1]);
  }

  const candidateAddresses = [
    forwardedFrom.address,
    from?.address,
    replyTo?.address,
  ]
    .map(a => String(a || '').trim().toLowerCase())
    .filter(Boolean);

  // 2. Check registered Email sources in dictionary_store
  for (const src of savedSources || []) {
    if (src.isActive === false) continue;
    const srcEmail = String(src.identifier || '').trim().toLowerCase();
    if (srcEmail && candidateAddresses.includes(srcEmail)) {
      const cid = normalizeClubId(src.clubId);
      const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
      return { clubId: found ? found.id : cid, clubName: found?.name || src.config?.clubName || null };
    }
  }

  // 3. Check all 137 clubs' official `email` addresses
  for (const addr of candidateAddresses) {
    const byEmail = catalog.find(c => (c.emails || []).includes(addr));
    if (byEmail) return { clubId: byEmail.id, clubName: byEmail.name };
  }

  // 4. Check sender display name or `[Club Name]` subject tag
  const cleanSubject = String(subject || '').replace(/^(?:Fwd?|Re):\s*/gi, '').trim();
  const bracketTag = cleanSubject.match(/^\[([^\]]{3,60})\]/)?.[1] || '';
  const nameCandidates = [forwardedFrom.name, bracketTag, from?.name, replyTo?.name]
    .map(s => String(s || '').trim())
    .filter(Boolean);

  for (const cand of nameCandidates) {
    const targetSlug = slugify(cand);
    if (targetSlug.length < 4) continue;
    for (const club of catalog) {
      const slugs = [club.id, club.name, ...(club.alsoKnownAs || [])].map(slugify).filter(Boolean);
      if (slugs.includes(targetSlug)) {
        return { clubId: club.id, clubName: club.name };
      }
    }
    for (const club of catalog) {
      const nameSlug = slugify(club.name);
      if (nameSlug.length >= 7 && (targetSlug.includes(nameSlug) || nameSlug.includes(targetSlug))) {
        return { clubId: club.id, clubName: club.name };
      }
    }
  }

  // 5. Check Instagram @handle inside the email signature
  const igMatch = String(text || '').match(/instagram\.com\/([a-zA-Z0-9._]{3,30})/i);
  if (igMatch) {
    const handle = normalizeClubId(igMatch[1]).toLowerCase();
    const found = catalog.find(c => c.id.toLowerCase() === handle);
    if (found) return { clubId: found.id, clubName: found.name };
  }

  if (defaultClubId) {
    const cid = normalizeClubId(defaultClubId);
    const found = catalog.find(c => c.id.toLowerCase() === cid.toLowerCase());
    return { clubId: found ? found.id : cid, clubName: found?.name || null };
  }

  return { clubId: null, clubName: null };
}

// ── Zero-Dependency IMAP4rev1 Client (`node:tls` / `node:net`) ──

function quoteImapString(val = '') {
  return `"${String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function formatImapDate(dt) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${dt.getUTCDate()}-${months[dt.getUTCMonth()]}-${dt.getUTCFullYear()}`;
}

/**
 * Parse IMAP FETCH responses containing byte-counted literals `{N}\r\n<N octets>`.
 */
export function parseImapFetchBuffer(buf) {
  const messages = [];
  let offset = 0;

  while (offset < buf.length) {
    const nl = buf.indexOf(0x0a, offset);
    if (nl === -1) break;
    const lineBuf = buf.subarray(offset, nl + 1);
    const lineStr = lineBuf.toString('latin1');
    offset = nl + 1;

    // Look for `* <seq> FETCH (... {byteCount}\r\n`
    const literalMatch = lineStr.match(/^\*\s+\d+\s+FETCH\s+\((.*)\{(\d+)\}\r?\n$/i);
    if (literalMatch) {
      const metaPart = literalMatch[1] || '';
      const byteLen = parseInt(literalMatch[2], 10);
      if (Number.isFinite(byteLen) && byteLen >= 0 && offset + byteLen <= buf.length) {
        const rawLiteral = buf.subarray(offset, offset + byteLen).toString('utf8');
        offset += byteLen;

        // Read trailing line of the FETCH item (which may also hold UID if placed after BODY[])
        const tailNl = buf.indexOf(0x0a, offset);
        let tailStr = '';
        if (tailNl !== -1) {
          tailStr = buf.subarray(offset, tailNl + 1).toString('latin1');
          offset = tailNl + 1;
        }

        const combinedMeta = `${metaPart} ${tailStr}`;
        const uidMatch = combinedMeta.match(/\bUID\s+(\d+)/i);
        const dateMatch = combinedMeta.match(/\bINTERNALDATE\s+"([^"]+)"/i);
        messages.push({
          uid: uidMatch ? uidMatch[1] : null,
          internalDate: dateMatch ? dateMatch[1] : null,
          rawMime: rawLiteral,
        });
      }
    }
  }

  return messages;
}

class ImapSession {
  constructor({ host, port = 993, tls: useTls = true, rejectUnauthorized = true, timeoutMs = 15000 }) {
    this.host = host;
    this.port = Number(port) || 993;
    this.useTls = Boolean(useTls);
    this.rejectUnauthorized = rejectUnauthorized;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.seq = 0;
    this.waiter = null;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const onError = err => {
        cleanup();
        reject(err);
      };
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.socket?.removeListener('error', onError);
      };

      if (this.useTls) {
        this.socket = tls.connect(
          {
            host: this.host,
            port: this.port,
            servername: net.isIP(this.host) ? undefined : this.host,
            rejectUnauthorized: this.rejectUnauthorized,
          },
          onConnect
        );
      } else {
        this.socket = net.connect({ host: this.host, port: this.port }, onConnect);
      }

      this.socket.setTimeout(this.timeoutMs, () => {
        this.socket?.destroy(new Error(`IMAP connection timed out (${this.host}:${this.port})`));
      });
      this.socket.once('error', onError);
      this.socket.on('data', chunk => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.checkWaiter();
      });
      this.socket.on('close', () => {
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.reject(new Error('IMAP connection closed unexpectedly'));
        }
      });
    });

    // Wait for server `* OK` greeting
    await this.waitForGreeting();
  }

  checkWaiter() {
    if (!this.waiter) return;
    if (this.waiter.type === 'greeting') {
      const nl = this.buffer.indexOf(0x0a);
      if (nl !== -1) {
        const line = this.buffer.subarray(0, nl + 1).toString('utf8');
        this.buffer = this.buffer.subarray(nl + 1);
        const w = this.waiter;
        this.waiter = null;
        if (/^\*\s+OK\b/i.test(line)) w.resolve(line);
        else w.reject(new Error(`Unexpected IMAP greeting: ${line.trim()}`));
      }
      return;
    }

    // For tagged commands, ensure we don't match the tag inside a byte literal `{N}\r\n`
    const tag = this.waiter.tag;
    let scanPos = 0;
    while (scanPos < this.buffer.length) {
      const nl = this.buffer.indexOf(0x0a, scanPos);
      if (nl === -1) return; // Incomplete line
      const lineStr = this.buffer.subarray(scanPos, nl + 1).toString('latin1');

      const litMatch = lineStr.match(/\{(\d+)\}\r?\n$/);
      if (litMatch) {
        const litBytes = parseInt(litMatch[1], 10);
        if (nl + 1 + litBytes > this.buffer.length) {
          return; // Still receiving literal bytes
        }
        scanPos = nl + 1 + litBytes;
        continue;
      }

      if (lineStr.startsWith(`${tag} `)) {
        const fullResponse = this.buffer.subarray(0, nl + 1);
        this.buffer = this.buffer.subarray(nl + 1);
        const w = this.waiter;
        this.waiter = null;
        const statusMatch = lineStr.slice(tag.length + 1).match(/^(OK|NO|BAD)\b\s*(.*)/i);
        const status = statusMatch ? statusMatch[1].toUpperCase() : 'BAD';
        const info = (statusMatch ? statusMatch[2] : lineStr).trim();
        if (status === 'OK') {
          w.resolve({ status, info, raw: fullResponse });
        } else {
          w.reject(new Error(`IMAP ${status}: ${info}`));
        }
        return;
      }

      scanPos = nl + 1;
    }
  }

  waitForGreeting() {
    return new Promise((resolve, reject) => {
      this.waiter = { type: 'greeting', resolve, reject };
      this.checkWaiter();
    });
  }

  command(cmdStr) {
    const tag = `A${String(++this.seq).padStart(4, '0')}`;
    return new Promise((resolve, reject) => {
      this.waiter = { type: 'tag', tag, resolve, reject };
      this.socket.write(`${tag} ${cmdStr}\r\n`);
    });
  }

  async close() {
    if (!this.socket || this.socket.destroyed) return;
    try {
      await this.command('LOGOUT');
    } catch {
      // ignore logout error
    }
    this.socket.destroy();
  }
}

function enrichMailAuthError(err, host = '') {
  const msg = err?.message || String(err);
  if (/Invalid credentials|AUTHENTICATIONFAILED|Application-specific password|WEBALERT/i.test(msg)) {
    if (/gmail\.com|googlemail\.com/i.test(host)) {
      return new Error(
        `Gmail authentication failed (${msg}). Google requires a 16-character App Password (myaccount.google.com/apppasswords with 2-Step Verification enabled), not your regular account password.`
      );
    }
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function verifyImapConnection(customConfig = {}) {
  const cfg = { ...getEffectiveEmailConfig(), ...customConfig };
  if (!cfg.imapHost || !cfg.emailUser || !cfg.emailPassword) {
    throw new Error('IMAP host, email address, and password/App Password are required.');
  }

  const session = new ImapSession({
    host: cfg.imapHost,
    port: cfg.imapPort,
    tls: cfg.imapSecure !== undefined ? Boolean(cfg.imapSecure) : cfg.imapTls,
    rejectUnauthorized: cfg.rejectUnauthorized !== false,
  });

  try {
    await session.connect();
    await session.command(
      `LOGIN ${quoteImapString(cfg.emailUser)} ${quoteImapString(
        normalizeMailPassword(cfg.emailPassword, cfg.imapHost)
      )}`
    );
    const sel = await session.command(`EXAMINE ${quoteImapString(cfg.imapMailbox || 'INBOX')}`);
    const existsMatch = sel.raw.toString('utf8').match(/\*\s+(\d+)\s+EXISTS/i);
    await session.close();
    return {
      ok: true,
      host: cfg.imapHost,
      port: cfg.imapPort,
      mailbox: cfg.imapMailbox || 'INBOX',
      messagesInMailbox: existsMatch ? Number(existsMatch[1]) : 0,
    };
  } catch (err) {
    try {
      session.socket?.destroy();
    } catch {
      // ignore
    }
    throw enrichMailAuthError(err, cfg.imapHost);
  }
}

export async function fetchImapEmails({
  limit = 30,
  lookbackDays = 30,
  customConfig = {},
} = {}) {
  const cfg = { ...getEffectiveEmailConfig(), ...customConfig };
  if (!cfg.imapHost || !cfg.emailUser || !cfg.emailPassword) {
    throw new Error('IMAP credentials are not configured.');
  }

  const session = new ImapSession({
    host: cfg.imapHost,
    port: cfg.imapPort,
    tls: cfg.imapSecure !== undefined ? Boolean(cfg.imapSecure) : cfg.imapTls,
    rejectUnauthorized: cfg.rejectUnauthorized !== false,
    timeoutMs: 25000,
  });

  try {
    await session.connect();
    await session.command(
      `LOGIN ${quoteImapString(cfg.emailUser)} ${quoteImapString(
        normalizeMailPassword(cfg.emailPassword, cfg.imapHost)
      )}`
    );
    await session.command(`EXAMINE ${quoteImapString(cfg.imapMailbox || 'INBOX')}`);

    const sinceDate = new Date(Date.now() - Math.max(Number(lookbackDays) || 30, 1) * 86400 * 1000);
    const searchRes = await session.command(`UID SEARCH SINCE ${formatImapDate(sinceDate)}`);
    const searchStr = searchRes.raw.toString('utf8');
    const searchLine = searchStr.match(/^\*\s+SEARCH\b(.*)$/im)?.[1] || '';
    const allUids = searchLine
      .trim()
      .split(/\s+/)
      .filter(u => /^\d+$/.test(u));

    if (allUids.length === 0) {
      await session.close();
      return [];
    }

    const recentUids = allUids.slice(-Math.min(Math.max(Number(limit) || 30, 1), 100));
    const fetchRes = await session.command(
      `UID FETCH ${recentUids.join(',')} (UID INTERNALDATE BODY.PEEK[])`
    );
    const parsedItems = parseImapFetchBuffer(fetchRes.raw);
    await session.close();
    return parsedItems;
  } catch (err) {
    try {
      session.socket?.destroy();
    } catch {
      // ignore
    }
    throw enrichMailAuthError(err, cfg.imapHost);
  }
}

// ── Zero-Dependency SMTP Client (`node:tls` / `node:net`, Implicit TLS 465 + STARTTLS 587) ──

function createSmtpLineReader(socket, timeoutMs = 15000) {
  let buf = '';
  let waiter = null;

  socket.setTimeout(timeoutMs, () => {
    socket.destroy(new Error('SMTP connection timed out'));
  });

  const processBuffer = () => {
    if (!waiter) return;
    const lines = buf.split('\r\n');
    // Keep incomplete trailing chunk
    const completeCount = lines.length - 1;
    if (completeCount <= 0) return;

    const collected = [];
    for (let i = 0; i < completeCount; i++) {
      const line = lines[i];
      collected.push(line);
      // Multi-line SMTP replies have `-` after the 3-digit code (`250-PIPELINING`), final line has space (`250 OK`)
      if (/^\d{3}(?: |$)/.test(line)) {
        buf = lines.slice(i + 1).join('\r\n');
        const code = parseInt(line.slice(0, 3), 10);
        const text = collected.join('\n');
        const w = waiter;
        waiter = null;
        w.resolve({ code, text, lines: collected });
        return;
      }
    }
  };

  const onData = chunk => {
    buf += chunk.toString('utf8');
    processBuffer();
  };
  const onError = err => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(err);
    }
  };
  const onClose = () => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w.reject(new Error('SMTP socket closed unexpectedly'));
    }
  };

  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);

  return {
    readReply() {
      return new Promise((resolve, reject) => {
        waiter = { resolve, reject };
        processBuffer();
      });
    },
    async sendCmd(cmd, expectedPrefix = [2, 3]) {
      socket.write(`${cmd}\r\n`);
      const reply = await this.readReply();
      const firstDigit = Math.floor(reply.code / 100);
      if (!expectedPrefix.includes(firstDigit)) {
        throw new Error(`SMTP error (${reply.code}): ${reply.text}`);
      }
      return reply;
    },
    detach() {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    },
  };
}

function encodeMimeHeaderText(text = '') {
  const s = String(text || '').replace(/[\r\n]+/g, ' ').trim();
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function wrapBase64Lines(bufOrStr) {
  const b64 = Buffer.isBuffer(bufOrStr)
    ? bufOrStr.toString('base64')
    : Buffer.from(String(bufOrStr), 'utf8').toString('base64');
  return b64.replace(/(.{76})/g, '$1\r\n').trim();
}

export function buildOutboundMimeMessage({
  fromEmail,
  fromName = 'ClubHub',
  to,
  replyTo = '',
  subject,
  text = '',
  html = '',
  icsContent = '',
  icsFilename = 'clubhub-schedule.ics',
}) {
  const recipients = (Array.isArray(to) ? to : [to]).map(s => String(s || '').trim()).filter(Boolean);
  for (const r of recipients) {
    if (!isValidEmailAddress(r)) {
      throw new Error(`Invalid recipient email address: "${r}"`);
    }
  }
  if (!isValidEmailAddress(fromEmail)) {
    throw new Error(`Invalid sender email address: "${fromEmail}"`);
  }

  const altBoundary = `clubhub_alt_${crypto.randomBytes(12).toString('hex')}`;
  const mixedBoundary = `clubhub_mix_${crypto.randomBytes(12).toString('hex')}`;
  const domain = fromEmail.split('@')[1] || 'clubhub.local';
  const msgId = `<${crypto.randomBytes(16).toString('hex')}@${domain}>`;

  const formattedFrom = fromName
    ? `${encodeMimeHeaderText(fromName)} <${fromEmail}>`
    : fromEmail;

  const headers = [
    `From: ${formattedFrom}`,
    `To: ${recipients.join(', ')}`,
    ...(replyTo && isValidEmailAddress(replyTo) ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeMimeHeaderText(subject || 'ClubHub Notification')}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${msgId}`,
    'MIME-Version: 1.0',
  ];

  const altBlock = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64Lines(text || 'Notification from ClubHub.'),
    ...(html
      ? [
          `--${altBoundary}`,
          'Content-Type: text/html; charset="UTF-8"',
          'Content-Transfer-Encoding: base64',
          '',
          wrapBase64Lines(html),
        ]
      : []),
    `--${altBoundary}--`,
  ].join('\r\n');

  if (!icsContent) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      altBlock,
      '',
    ].join('\r\n');
  }

  const safeFilename = String(icsFilename || 'clubhub-schedule.ics').replace(/[^a-zA-Z0-9._-]/g, '-');
  const mixedBlock = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    altBlock,
    `--${mixedBoundary}`,
    `Content-Type: text/calendar; charset="UTF-8"; method=PUBLISH; name="${safeFilename}"`,
    `Content-Disposition: attachment; filename="${safeFilename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64Lines(icsContent),
    `--${mixedBoundary}--`,
  ].join('\r\n');

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    mixedBlock,
    '',
  ].join('\r\n');
}

async function openSmtpAuthenticatedSession(cfg) {
  const host = cfg.smtpHost;
  const port = Number(cfg.smtpPort) || 465;
  const secure = cfg.smtpSecure !== undefined ? Boolean(cfg.smtpSecure) : port === 465;
  const rejectUnauthorized = cfg.rejectUnauthorized !== false;
  const isLocal = host === '127.0.0.1' || host === 'localhost' || host === '::1';

  let socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect(
          {
            host,
            port,
            servername: net.isIP(host) ? undefined : host,
            rejectUnauthorized,
          },
          () => resolve(s)
        )
      : net.connect({ host, port }, () => resolve(s));
    s.once('error', reject);
  });

  let reader = createSmtpLineReader(socket);
  const greeting = await reader.readReply();
  if (greeting.code !== 220) {
    socket.destroy();
    throw new Error(`Unexpected SMTP greeting (${greeting.code}): ${greeting.text}`);
  }

  let ehlo = await reader.sendCmd('EHLO clubhub.local');

  // Upgrade via STARTTLS on port 587/25 when supported
  if (!secure && /STARTTLS/i.test(ehlo.text)) {
    await reader.sendCmd('STARTTLS');
    reader.detach();
    socket = await new Promise((resolve, reject) => {
      const tlsSock = tls.connect(
        {
          socket,
          servername: net.isIP(host) ? undefined : host,
          rejectUnauthorized,
        },
        () => resolve(tlsSock)
      );
      tlsSock.once('error', reject);
    });
    reader = createSmtpLineReader(socket);
    ehlo = await reader.sendCmd('EHLO clubhub.local');
  } else if (!secure && !isLocal && !cfg.allowPlainSmtp) {
    socket.destroy();
    throw new Error(`SMTP server ${host}:${port} did not advertise STARTTLS over an unencrypted port.`);
  }

  const user = String(cfg.emailUser || '').trim();
  const pass = normalizeMailPassword(cfg.emailPassword || '', host);

  if (user && pass) {
    try {
      const plainToken = Buffer.from(`\0${user}\0${pass}`, 'utf8').toString('base64');
      await reader.sendCmd(`AUTH PLAIN ${plainToken}`);
    } catch (authErr) {
      if (/504|502|unrecognized|not supported/i.test(authErr.message || '')) {
        await reader.sendCmd('AUTH LOGIN');
        await reader.sendCmd(Buffer.from(user, 'utf8').toString('base64'));
        await reader.sendCmd(Buffer.from(pass, 'utf8').toString('base64'));
      } else {
        socket.destroy();
        throw enrichMailAuthError(authErr, host);
      }
    }
  }

  return { socket, reader };
}

export async function verifySmtpConnection(customConfig = {}) {
  const cfg = { ...getEffectiveEmailConfig(), ...customConfig };
  if (!cfg.smtpHost || !cfg.emailUser || !cfg.emailPassword) {
    throw new Error('SMTP host, email address, and password/App Password are required.');
  }
  const { socket, reader } = await openSmtpAuthenticatedSession(cfg);
  try {
    await reader.sendCmd('QUIT');
  } catch {
    // ignore
  }
  socket.destroy();
  return { ok: true, host: cfg.smtpHost, port: cfg.smtpPort };
}

export async function sendSmtpMail({
  to,
  subject,
  text,
  html,
  replyTo = '',
  icsContent = '',
  icsFilename = 'clubhub-schedule.ics',
  customConfig = {},
}) {
  const cfg = { ...getEffectiveEmailConfig(), ...customConfig };
  const recipients = (Array.isArray(to) ? to : [to]).map(s => String(s || '').trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error('At least one recipient email address is required.');

  const fromEmail = cfg.fromEmail || cfg.emailUser;
  const rawMime = buildOutboundMimeMessage({
    fromEmail,
    fromName: cfg.fromName || 'ClubHub Campus Sync',
    to: recipients,
    replyTo,
    subject,
    text,
    html,
    icsContent,
    icsFilename,
  });

  const { socket, reader } = await openSmtpAuthenticatedSession(cfg);
  try {
    await reader.sendCmd(`MAIL FROM:<${fromEmail}>`);
    for (const rcpt of recipients) {
      await reader.sendCmd(`RCPT TO:<${rcpt}>`);
    }
    await reader.sendCmd('DATA');
    // RFC 5321 dot-stuffing
    const dotStuffed = rawMime.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    const dataReply = await reader.sendCmd(`${dotStuffed}\r\n.`);
    try {
      await reader.sendCmd('QUIT');
    } catch {
      // ignore
    }
    socket.destroy();
    return {
      ok: true,
      via: 'smtp',
      to: recipients,
      response: dataReply.text,
    };
  } catch (err) {
    socket.destroy();
    throw err;
  }
}

// ── Styled HTML Outbound Email Templates ──

function renderClubHubEmailTemplate({ badge = 'ClubHub', title, intro, bodyHtml = '', ctaLabel = '', ctaUrl = '', footer = '' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111111;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e0;border-radius:16px;overflow:hidden;">
    <tr>
      <td style="padding:20px 28px;background:#111111;color:#ffffff;">
        <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f2c94c;color:#111111;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${escapeHtml(badge)}</span>
        <h1 style="margin:12px 0 0;font-size:20px;line-height:1.3;font-weight:700;color:#ffffff;">${escapeHtml(title)}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:#222222;">
        ${intro ? `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>` : ''}
        ${bodyHtml}
        ${
          ctaUrl
            ? `<div style="margin-top:22px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:11px 20px;background:#111111;color:#ffffff;text-decoration:none;border-radius:999px;font-size:13px;font-weight:600;">${escapeHtml(ctaLabel || 'Open in ClubHub')}</a></div>`
            : ''
        }
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px;background:#fafaf7;border-top:1px solid #ecece6;font-size:12px;color:#6b6b66;">
        ${escapeHtml(footer || 'Sent via ClubHub Campus Workspace · UCSC Club Directory, Calendar & Announcements')}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export class EmailService {
  saveConfig(updates = {}) {
    const prev = getIntegrationConfig('email_global')?.config || {};
    const next = { ...prev };

    const plainFields = [
      'provider',
      'emailUser',
      'imapHost',
      'imapMailbox',
      'smtpHost',
      'fromEmail',
      'fromName',
      'defaultRecipient',
      'defaultClubId',
    ];
    for (const field of plainFields) {
      if (updates[field] !== undefined) {
        next[field] = field === 'defaultClubId' && updates[field]
          ? normalizeClubId(updates[field])
          : String(updates[field] ?? '').trim();
      }
    }
    if (updates.imapPort !== undefined) next.imapPort = Number(updates.imapPort) || 993;
    if (updates.smtpPort !== undefined) next.smtpPort = Number(updates.smtpPort) || 465;
    if (updates.imapTls !== undefined) next.imapTls = Boolean(updates.imapTls);
    if (updates.smtpSecure !== undefined) next.smtpSecure = Boolean(updates.smtpSecure);
    if (updates.lookbackDays !== undefined) next.lookbackDays = Number(updates.lookbackDays) || 30;

    if (updates.emailPassword !== undefined && !isMaskedSecret(updates.emailPassword)) {
      next.emailPassword = String(updates.emailPassword || '').trim();
    }
    if (updates.resendApiKey !== undefined && !isMaskedSecret(updates.resendApiKey)) {
      next.resendApiKey = String(updates.resendApiKey || '').trim();
    }
    if (updates.sendgridApiKey !== undefined && !isMaskedSecret(updates.sendgridApiKey)) {
      next.sendgridApiKey = String(updates.sendgridApiKey || '').trim();
    }

    return saveIntegrationConfig('email_global', {
      scope: 'global',
      platform: 'email',
      config: next,
    });
  }

  getStatus() {
    const cfg = getEffectiveEmailConfig();
    const db = getDb();
    const counts = db
      .stmt(`
        SELECT
          (SELECT COUNT(*) FROM posts WHERE source = 'email')         AS posts,
          (SELECT COUNT(*) FROM announcements WHERE source = 'email') AS announcements,
          (SELECT COUNT(*) FROM events WHERE source = 'email')        AS events,
          (SELECT COUNT(*) FROM clubs WHERE email IS NOT NULL AND email != '') AS clubDirectoryEmails
      `)
      .get();

    const sources = getDataSources({ platform: 'email' });
    let activeTransport = 'none';
    if (cfg.provider === 'resend' && cfg.resendReady) activeTransport = 'resend';
    else if (cfg.provider === 'sendgrid' && cfg.sendgridReady) activeTransport = 'sendgrid';
    else if (cfg.provider === 'smtp' && cfg.smtpReady) activeTransport = 'smtp';
    else if (cfg.resendReady) activeTransport = 'resend';
    else if (cfg.sendgridReady) activeTransport = 'sendgrid';
    else if (cfg.smtpReady) activeTransport = 'smtp';

    return {
      configured: cfg.inboundReady || cfg.outboundReady,
      inboundReady: cfg.inboundReady,
      outboundReady: cfg.outboundReady,
      activeTransport,
      provider: cfg.provider,
      emailUser: cfg.emailUser,
      emailPasswordConfigured: Boolean(cfg.emailPassword),
      emailPasswordMasked: maskSecret(cfg.emailPassword),
      passwordSource: cfg.passwordSource,
      imapHost: cfg.imapHost,
      imapPort: cfg.imapPort,
      imapMailbox: cfg.imapMailbox,
      smtpHost: cfg.smtpHost,
      smtpPort: cfg.smtpPort,
      smtpSecure: cfg.smtpSecure,
      resendConfigured: cfg.resendReady,
      resendApiKeyMasked: maskSecret(cfg.resendApiKey),
      resendKeySource: cfg.resendKeySource,
      sendgridConfigured: cfg.sendgridReady,
      sendgridApiKeyMasked: maskSecret(cfg.sendgridApiKey),
      fromEmail: cfg.fromEmail,
      fromName: cfg.fromName,
      defaultRecipient: cfg.defaultRecipient,
      defaultClubId: cfg.defaultClubId,
      lookbackDays: cfg.lookbackDays,
      sources,
      counts,
    };
  }

  /**
   * Ingest a single inbound email (from IMAP fetch OR `/api/webhooks/email` payload).
   */
  ingestInboundEmail(payload = {}, { catalog = null, savedSources = null, filterClubId = null } = {}) {
    const cfg = getEffectiveEmailConfig();
    const clubsCatalog = catalog || loadEmailClubsCatalog();
    const emailSources = savedSources || getDataSources({ platform: 'email' });

    let parsed;
    if (typeof payload.rawMime === 'string' && payload.rawMime.trim()) {
      parsed = parseRawMimeEmail(payload.rawMime);
    } else {
      const from = parseEmailAddressField(payload.from || payload.sender || payload.fromEmail || '');
      const replyTo = parseEmailAddressField(payload.replyTo || payload['reply-to'] || '');
      const rawTo = payload.to || payload.recipient || payload.envelope?.to || [];
      const toList = (Array.isArray(rawTo) ? rawTo : String(rawTo).split(','))
        .map(v => parseEmailAddressField(v).address)
        .filter(Boolean);
      const htmlInfo = payload.html ? htmlToReadableTextAndLinks(payload.html) : { text: '', links: [] };
      const plain = String(payload.text || payload.body || payload['body-plain'] || '').trim();
      let combinedText = plain.length >= 20 ? plain : htmlInfo.text || plain;
      for (const link of htmlInfo.links) {
        if (link.url && !combinedText.includes(link.url)) {
          combinedText += `\n${link.url}`;
        }
      }

      parsed = {
        messageId: String(payload.messageId || payload['Message-Id'] || payload.id || '').replace(/[<>]/g, ''),
        subject: decodeMimeWords(payload.subject || 'Club Newsletter Update'),
        from,
        replyTo,
        toAddresses: toList,
        postedAt: payload.date || payload.timestamp || new Date().toISOString(),
        text: combinedText.trim(),
      };
    }

    if (!parsed.text && !parsed.subject) {
      return { ingested: false, reason: 'Empty email subject and body' };
    }

    const matched = matchClubFromEmail(
      {
        explicitClubId: payload.clubId || payload.club_id || null,
        defaultClubId: cfg.defaultClubId || null,
        from: parsed.from,
        replyTo: parsed.replyTo,
        toAddresses: parsed.toAddresses,
        subject: parsed.subject,
        text: parsed.text,
      },
      clubsCatalog,
      emailSources
    );

    if (!matched.clubId) {
      return {
        ingested: false,
        reason: 'Could not match sender or recipient +tag to a club',
        from: parsed.from.address || parsed.from.name,
        subject: parsed.subject,
      };
    }

    if (filterClubId && matched.clubId.toLowerCase() !== normalizeClubId(filterClubId).toLowerCase()) {
      return { ingested: false, reason: 'Filtered out by clubId' };
    }

    const hashSeed = parsed.messageId || `${parsed.from.address}:${parsed.subject}:${parsed.postedAt}`;
    const stableHash = crypto.createHash('sha1').update(hashSeed).digest('hex').slice(0, 16);
    const postId = `email_${stableHash}`;
    const senderLabel = parsed.from.address || matched.clubId;
    const caption = `📧 [Mailing List: ${senderLabel}] ${parsed.text || parsed.subject}`;

    const result = ingestResourceItem({
      clubId: matched.clubId,
      clubName: payload.clubName || matched.clubName || undefined,
      source: 'email',
      id: postId,
      title: parsed.subject,
      caption,
      postedAt: parsed.postedAt,
      identifier: parsed.from.address || `${matched.clubId}@email`,
      forceAnnouncement: true,
    });

    return {
      ingested: true,
      from: parsed.from.address,
      subject: parsed.subject,
      ...result,
    };
  }

  /**
   * Sync club emails from the configured IMAP inbox (or demo fallback only when DB has 0 real clubs).
   */
  async syncEmail({ clubId = null, limit = 30, demo = false, customConfig = {} } = {}) {
    const cfg = { ...getEffectiveEmailConfig(), ...customConfig };

    if (cfg.imapReady && !demo) {
      const catalog = loadEmailClubsCatalog();
      const savedSources = getDataSources({ platform: 'email' });
      const fetched = await fetchImapEmails({
        limit,
        lookbackDays: cfg.lookbackDays,
        customConfig,
      });

      let synced = 0;
      let unmatched = 0;
      const items = [];

      // Process oldest-to-newest
      for (const rawItem of fetched) {
        const res = this.ingestInboundEmail(
          {
            rawMime: rawItem.rawMime,
            date: rawItem.internalDate ? new Date(rawItem.internalDate).toISOString() : undefined,
          },
          { catalog, savedSources, filterClubId: clubId }
        );
        if (res.ingested) {
          synced++;
          items.push({ clubId: res.clubId, title: res.subject || res.postId });
        } else if (res.reason !== 'Filtered out by clubId') {
          unmatched++;
        }
      }

      const warnings = [];
      if (fetched.length > 0 && synced === 0 && unmatched > 0) {
        warnings.push(
          `Checked ${fetched.length} recent email(s), none matched a club email or +clubHandle tag. Forward a club newsletter or subscribe using ${cfg.emailUser.replace('@', '+club_handle@')}.`
        );
      }

      return {
        source: 'email',
        mode: 'live_imap',
        checked: fetched.length,
        synced,
        unmatched,
        items: items.slice(-15),
        warnings,
      };
    }

    const realClubCount =
      getDb().stmt("SELECT COUNT(*) AS c FROM clubs WHERE id NOT LIKE 'demo_%'").get()?.c || 0;
    if (!demo && realClubCount > 0) {
      return {
        source: 'email',
        mode: 'unconfigured',
        synced: 0,
        warnings: [
          'Configure IMAP credentials (e.g. Gmail / UCSC App Password) in Settings -> Integrations or POST newsletters to /api/webhooks/email.',
        ],
      };
    }

    const items = clubId
      ? DEMO_EMAILS.filter(e => e.clubId.toLowerCase() === normalizeClubId(clubId).toLowerCase())
      : DEMO_EMAILS;

    for (const item of items) {
      ingestResourceItem({
        ...item,
        source: 'email',
        postedAt: new Date().toISOString(),
        forceAnnouncement: true,
      });
    }

    return { source: 'email', mode: 'demo', synced: items.length };
  }

  /**
   * Send an outbound email via Resend API, SendGrid API, or direct SMTP (TLS/STARTTLS).
   */
  async sendEmail({
    to,
    subject,
    text,
    html,
    replyTo = '',
    icsContent = '',
    icsFilename = 'clubhub-schedule.ics',
    customConfig = {},
  }) {
    const cfg = { ...getEffectiveEmailConfig(), ...customConfig };
    const recipients = (Array.isArray(to) ? to : [to || cfg.defaultRecipient])
      .map(s => String(s || '').trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      throw new Error('Recipient email address ("to") is required.');
    }
    for (const r of recipients) {
      if (!isValidEmailAddress(r)) {
        throw new Error(`Invalid recipient email address: "${r}"`);
      }
    }

    const useResend =
      (cfg.provider === 'resend' || (cfg.provider === 'auto' && cfg.resendReady)) && cfg.resendApiKey;
    const useSendGrid =
      !useResend &&
      (cfg.provider === 'sendgrid' || (cfg.provider === 'auto' && cfg.sendgridReady)) &&
      cfg.sendgridApiKey;

    if (useResend) {
      const fromHeader = cfg.fromName
        ? `${cfg.fromName} <${cfg.fromEmail || 'onboarding@resend.dev'}>`
        : cfg.fromEmail || 'onboarding@resend.dev';

      const body = {
        from: fromHeader,
        to: recipients,
        subject: subject || 'ClubHub Notification',
        text: text || 'Notification from ClubHub.',
        html: html || undefined,
        reply_to: replyTo || undefined,
        attachments: icsContent
          ? [
              {
                filename: icsFilename,
                content: Buffer.from(icsContent, 'utf8').toString('base64'),
              },
            ]
          : undefined,
      };

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(`Resend API error (${res.status}): ${resJson?.message || JSON.stringify(resJson)}`);
      }
      return { ok: true, via: 'resend', id: resJson?.id || null, to: recipients };
    }

    if (useSendGrid) {
      if (!cfg.fromEmail) {
        throw new Error('EMAIL_FROM / fromEmail is required when sending via SendGrid.');
      }
      const content = [{ type: 'text/plain', value: text || 'Notification from ClubHub.' }];
      if (html) content.push({ type: 'text/html', value: html });

      const body = {
        personalizations: [{ to: recipients.map(email => ({ email })) }],
        from: { email: cfg.fromEmail, name: cfg.fromName || 'ClubHub' },
        subject: subject || 'ClubHub Notification',
        content,
        attachments: icsContent
          ? [
              {
                content: Buffer.from(icsContent, 'utf8').toString('base64'),
                filename: icsFilename,
                type: 'text/calendar',
                disposition: 'attachment',
              },
            ]
          : undefined,
      };

      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.sendgridApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`SendGrid API error (${res.status}): ${errText.slice(0, 220)}`);
      }
      return { ok: true, via: 'sendgrid', to: recipients };
    }

    if (!cfg.smtpReady) {
      throw new Error(
        'Email outbound transport is not configured. Add a Gmail/UCSC App Password (SMTP) or a Resend API key in Settings -> Integrations.'
      );
    }

    return sendSmtpMail({
      to: recipients,
      subject,
      text,
      html,
      replyTo,
      icsContent,
      icsFilename,
      customConfig,
    });
  }

  /**
   * High-level notification builder & sender (`test`, `digest`, `announcement`, `poll`).
   */
  async sendNotification({
    kind = 'announcement',
    to,
    subject = '',
    title = '',
    message = '',
    clubName = 'ClubHub',
    url = '',
    events = [],
    poll = null,
    attachIcs = true,
    customConfig = {},
  } = {}) {
    if (kind === 'test') {
      const subj = subject || 'ClubHub Email Integration Verified';
      const intro =
        message ||
        'Your ClubHub email integration is live! You can now receive club schedule digests (with .ics calendar attachments), announcements, and Group Availability invites.';
      const html = renderClubHubEmailTemplate({
        badge: 'Integration Verified',
        title: title || 'ClubHub Email Sync & Digests Ready',
        intro,
        ctaLabel: url ? 'Open ClubHub' : '',
        ctaUrl: url,
      });
      return this.sendEmail({ to, subject: subj, text: intro, html, customConfig });
    }

    if (kind === 'digest') {
      const list = (events || []).slice(0, 20);
      const subj =
        subject || `ClubHub Schedule Digest (${list.length} Upcoming Event${list.length === 1 ? '' : 's'})`;

      const plainLines = list.map(ev => {
        const evTitle = ev.event || ev.title || 'Club Event';
        const evClub = ev.club || ev.clubName || '';
        const dtStr = ev.startIso || ev.start
          ? new Date(ev.startIso || ev.start).toLocaleString('en-US', {
              timeZone: 'America/Los_Angeles',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })
          : ev.date || 'Upcoming';
        const loc = ev.location ? ` @ ${ev.location}` : '';
        return `- ${evClub ? `[${evClub}] ` : ''}${evTitle} — ${dtStr}${loc}`;
      });

      const rowsHtml = list.length
        ? `<div style="border-top:1px solid #ecece6;">${list
            .map(ev => {
              const evTitle = escapeHtml(ev.event || ev.title || 'Club Event');
              const evClub = escapeHtml(ev.club || ev.clubName || 'Campus Club');
              const dtStr = ev.startIso || ev.start
                ? new Date(ev.startIso || ev.start).toLocaleString('en-US', {
                    timeZone: 'America/Los_Angeles',
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : escapeHtml(ev.date || 'Upcoming');
              const loc = ev.location ? ` · 📍 ${escapeHtml(ev.location)}` : '';
              return `<div style="padding:12px 0;border-bottom:1px solid #ecece6;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b6b66;">${evClub}</div>
                <div style="font-size:15px;font-weight:600;color:#111111;margin:2px 0;">${evTitle}</div>
                <div style="font-size:13px;color:#444440;">🗓️ ${escapeHtml(dtStr)}${loc}</div>
              </div>`;
            })
            .join('')}</div>`
        : '<p style="color:#6b6b66;">No upcoming events matched your current filter.</p>';

      const icsContent =
        attachIcs && list.length > 0
          ? buildIcsCalendar(list, { calendarName: 'ClubHub Schedule Digest' })
          : '';

      const html = renderClubHubEmailTemplate({
        badge: 'Schedule Digest',
        title: title || `Your Upcoming Club Schedule (${list.length})`,
        intro:
          message ||
          (icsContent
            ? 'Here are your upcoming club meetings and campus events. An .ics calendar file is attached so you can add them in one click.'
            : 'Here are your upcoming club meetings and campus events.'),
        bodyHtml: rowsHtml,
        ctaLabel: url ? 'View Full Calendar' : '',
        ctaUrl: url,
      });

      return this.sendEmail({
        to,
        subject: subj,
        text: `${title || subj}\n\n${plainLines.join('\n') || 'No upcoming events.'}${url ? `\n\n${url}` : ''}`,
        html,
        icsContent,
        icsFilename: 'clubhub-upcoming-events.ics',
        customConfig,
      });
    }

    if (kind === 'poll' || poll) {
      const pollTitle = poll?.title || title || 'Group Availability Poll';
      const voteUrl = poll?.url || url || '';
      const subj = subject || `[${clubName}] Vote on Meeting Times: ${pollTitle}`;
      const plain = [
        `${clubName} invited you to mark your availability for "${pollTitle}".`,
        poll?.duration ? `Target Duration: ${poll.duration} hr` : '',
        message || '',
        voteUrl ? `Vote here: ${voteUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const metaHtml = poll?.duration
        ? `<p style="margin:0 0 12px;font-size:13px;color:#555550;"><strong>Target Duration:</strong> ${escapeHtml(String(poll.duration))} hr${poll.bestSlot ? ` · <strong>Leading Window:</strong> ${escapeHtml(String(poll.bestSlot))}` : ''}</p>`
        : '';

      const html = renderClubHubEmailTemplate({
        badge: 'Availability Poll',
        title: pollTitle,
        intro:
          message ||
          `${clubName} is coordinating meeting times on ClubHub. Click below to toggle the windows that work for your schedule.`,
        bodyHtml: metaHtml,
        ctaLabel: 'Mark My Availability',
        ctaUrl: voteUrl,
      });

      return this.sendEmail({ to, subject: subj, text: plain, html, customConfig });
    }

    const subj = subject || `[${clubName}] ${title || 'New Club Announcement'}`;
    const bodyParagraphs = String(message || '')
      .split(/\n{2,}/)
      .filter(Boolean)
      .map(p => `<p style="margin:0 0 12px;white-space:pre-line;">${escapeHtml(p)}</p>`)
      .join('');

    const html = renderClubHubEmailTemplate({
      badge: clubName || 'Announcement',
      title: title || `${clubName} Update`,
      intro: '',
      bodyHtml: bodyParagraphs,
      ctaLabel: url ? 'View Source Post' : '',
      ctaUrl: url,
    });

    return this.sendEmail({
      to,
      subject: subj,
      text: `${title ? `${title}\n\n` : ''}${message || ''}${url ? `\n\n${url}` : ''}`.trim(),
      html,
      customConfig,
    });
  }

  getClubEmails(clubId) {
    const db = getDb();
    return db
      .stmt("SELECT * FROM posts WHERE lower(clubId) = lower(?) AND source = 'email' ORDER BY postedAt DESC")
      .all(normalizeClubId(clubId))
      .map(formatPostRow);
  }
}

export default new EmailService();
