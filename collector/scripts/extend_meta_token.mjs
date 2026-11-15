// Exchanges a 1-hour Meta Graph API Explorer token for a 60-day long-lived IG_ACCESS_TOKEN
// and updates both `.env` and `collector/.env`.
//
// Usage:
//   npm run ig:extend-token -- <NEW_1H_TOKEN>
//   (Requires INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env)

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function upsertEnv(filePath, key, value) {
  const lines = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/) : [];
  let found = false;
  const updated = lines.map(line => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) updated.push(`${key}=${value}`);
  fs.writeFileSync(filePath, updated.filter((l, i, arr) => i < arr.length - 1 || l !== '').join('\n') + '\n');
}

const shortToken = (process.argv[2] || process.env.IG_ACCESS_TOKEN || '').trim();
const appId = (process.env.INSTAGRAM_APP_ID || '').trim();
const appSecret = (process.env.INSTAGRAM_APP_SECRET || '').trim();

if (!shortToken) {
  console.error('Usage: npm run ig:extend-token -- <SHORT_LIVED_TOKEN>');
  process.exit(1);
}
if (!appId || appId === 'your_app_id' || !appSecret || appSecret === 'your_app_secret') {
  console.error(
    'Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in .env first (from developers.facebook.com -> App Settings -> Basic).'
  );
  process.exit(1);
}

const url = new URL('https://graph.facebook.com/v26.0/oauth/access_token');
url.searchParams.set('grant_type', 'fb_exchange_token');
url.searchParams.set('client_id', appId);
url.searchParams.set('client_secret', appSecret);
url.searchParams.set('fb_exchange_token', shortToken);

const res = await fetch(url);
const body = await res.json();

if (!res.ok || !body.access_token) {
  console.error('Failed to exchange token:', body.error?.message || JSON.stringify(body));
  process.exit(1);
}

upsertEnv(path.join(ROOT, '.env'), 'IG_ACCESS_TOKEN', body.access_token);
upsertEnv(path.join(ROOT, 'collector/.env'), 'IG_ACCESS_TOKEN', body.access_token);

const days = body.expires_in ? Math.round(body.expires_in / 86400) : 60;
console.log(`✅ Updated .env and collector/.env with ${days}-day IG_ACCESS_TOKEN!`);
console.log('   Copy the new IG_ACCESS_TOKEN from .env into your GitHub Repo Secret IG_ACCESS_TOKEN as well.');
