// Automated Meta Graph API Token Health & Expiry Check (for GitHub Actions & CI)
// Replaces manual local token checks (`extend_meta_token.mjs`) with an automated daily check
// that warns in GitHub Actions before a 60-day `IG_ACCESS_TOKEN` expires — never leaking secret values.

import 'dotenv/config';
import fs from 'node:fs';

function appendSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  } catch {
    // ignore
  }
}

async function main() {
  const token = (process.env.IG_ACCESS_TOKEN || '').trim();
  const appId = (process.env.INSTAGRAM_APP_ID || '').trim();
  const appSecret = (process.env.INSTAGRAM_APP_SECRET || '').trim();
  const version = (process.env.GRAPH_API_VERSION || 'v26.0').trim();

  if (!token) {
    console.log('ℹ️ IG_ACCESS_TOKEN is not set — collector will use Instaloader personal-account fallback.');
    appendSummary([
      '### 🔑 Meta Graph API Token Health',
      '- Status: `Not configured` (running in Instaloader fallback + cached snapshot mode)',
      '',
    ]);
    return;
  }

  // 1. If INSTAGRAM_APP_ID + INSTAGRAM_APP_SECRET are configured, inspect exact expiration timestamp
  if (appId && appSecret && appId !== 'your_app_id' && appSecret !== 'your_app_secret') {
    try {
      const url = new URL(`https://graph.facebook.com/${version}/debug_token`);
      url.searchParams.set('input_token', token);
      url.searchParams.set('access_token', `${appId}|${appSecret}`);

      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const body = await res.json();
      const data = body?.data;

      if (data) {
        const isValid = Boolean(data.is_valid);
        const expiresAtSec = Number(data.expires_at) || 0;
        const daysRemaining =
          expiresAtSec > 0 ? Math.max(0, Math.round((expiresAtSec * 1000 - Date.now()) / 86_400_000)) : null;

        if (!isValid) {
          console.warn('::warning title=IG_ACCESS_TOKEN Expired::Meta Graph API IG_ACCESS_TOKEN is expired or invalid. Refresh the GitHub Actions secret IG_ACCESS_TOKEN.');
          appendSummary([
            '### 🔑 Meta Graph API Token Health',
            '- Status: ⚠️ **Expired / Invalid** — falling back to Instaloader until `IG_ACCESS_TOKEN` secret is refreshed.',
            '',
          ]);
          return;
        }

        if (daysRemaining !== null && daysRemaining <= 10) {
          console.warn(
            `::warning title=IG_ACCESS_TOKEN Expiring Soon::Meta Graph API IG_ACCESS_TOKEN expires in ${daysRemaining} day(s). Run npm run ig:extend-token and update the IG_ACCESS_TOKEN repo secret.`
          );
        } else {
          console.log(
            `✅ IG_ACCESS_TOKEN is valid${daysRemaining !== null ? ` (${daysRemaining} days remaining)` : ' (non-expiring)'}.`
          );
        }

        appendSummary([
          '### 🔑 Meta Graph API Token Health',
          `- Status: ✅ **Valid**${daysRemaining !== null ? ` (**${daysRemaining}** days remaining)` : ''}`,
          '',
        ]);
        return;
      }
    } catch (err) {
      console.warn('⚠️ debug_token check skipped:', err.message);
    }
  }

  // 2. Lightweight token liveness check without requiring INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET
  try {
    const meUrl = new URL(`https://graph.facebook.com/${version}/me`);
    meUrl.searchParams.set('fields', 'id');
    meUrl.searchParams.set('access_token', token);

    const res = await fetch(meUrl, { signal: AbortSignal.timeout(8000) });
    const body = await res.json();

    if (res.ok && body?.id) {
      console.log('✅ IG_ACCESS_TOKEN is active and reachable.');
      appendSummary([
        '### 🔑 Meta Graph API Token Health',
        '- Status: ✅ **Active**',
        '',
      ]);
    } else {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      console.warn(`::warning title=IG_ACCESS_TOKEN Check::Meta Graph API returned: ${msg}`);
      appendSummary([
        '### 🔑 Meta Graph API Token Health',
        `- Status: ⚠️ **Needs Renewal** (\`${msg}\`) — collector automatically falls back to Instaloader.`,
        '',
      ]);
    }
  } catch (err) {
    console.warn('⚠️ Meta Graph API liveness check could not complete:', err.message);
  }
}

main();
