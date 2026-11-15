// ── ClubHub Server-Side Supabase Cloud Client & JWT Verifier ──
// Supports both RLS-enforced per-user clients and Service-Role administrative operations.

import { createClient } from '../src/lib/supabaseJsShim.js';

function cleanVal(v) {
  return String(v || '').trim();
}

function isRealUrl(url) {
  return Boolean(url && /^https?:\/\//i.test(url) && !/your-project-ref|placeholder/i.test(url));
}

function isRealKey(key) {
  return Boolean(key && key.length >= 20 && !/^your_supabase_|placeholder/i.test(key));
}

export function getSupabaseServerConfig() {
  const url =
    cleanVal(process.env.SUPABASE_URL) ||
    cleanVal(process.env.VITE_SUPABASE_URL) ||
    cleanVal(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey =
    cleanVal(process.env.SUPABASE_ANON_KEY) ||
    cleanVal(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    cleanVal(process.env.VITE_SUPABASE_ANON_KEY) ||
    cleanVal(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    cleanVal(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    cleanVal(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const serviceRoleKey =
    cleanVal(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    cleanVal(process.env.SUPABASE_SECRET_KEY);

  if (!isRealUrl(url) || (!isRealKey(anonKey) && !isRealKey(serviceRoleKey))) {
    return null;
  }

  return {
    url,
    anonKey: isRealKey(anonKey) ? anonKey : serviceRoleKey,
    serviceRoleKey: isRealKey(serviceRoleKey) ? serviceRoleKey : '',
  };
}

export function isServerSupabaseConfigured() {
  return Boolean(getSupabaseServerConfig());
}

let cachedAdminClient = null;
let cachedAnonClient = null;

export function getSupabaseAdminClient() {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return null;
  const key = cfg.serviceRoleKey || cfg.anonKey;
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(cfg.url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAdminClient;
}

export function getSupabaseAnonClient() {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return null;
  if (!cachedAnonClient) {
    cachedAnonClient = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cachedAnonClient;
}

export function getSupabaseRlsClient(accessToken) {
  const cfg = getSupabaseServerConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export async function verifySupabaseAccessToken(accessToken) {
  if (!accessToken || accessToken.startsWith('ch_sess_')) return null;
  const client = getSupabaseAnonClient() || getSupabaseAdminClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
