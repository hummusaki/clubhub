// ── ClubHub Generative AI Search Client (Gemini 4 + Hybrid RAG Grounding) ──
// Upgrades instant local Hybrid Semantic RAG results with live Gemini 4
// (`gemini-4-hydrogen`) synthesis via `/api/ai/search` or an optional client
// Gemini API key, while strictly preventing hallucinated clubs.

import { fetchActionJSON } from './client.js';
import { formatEventWhenLabel } from '../utils/aiClubAgent.js';

const GEMINI_KEY_STORAGE = 'clubhub_gemini_api_key_v1';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1/interactions';
const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

const ENV_GEMINI_KEY = String(import.meta.env?.VITE_GEMINI_API_KEY || '').trim();

let cachedServerStatus = null; // { checked: boolean, configured: boolean, model: string }
let statusProbePromise = null;

const CLIENT_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    interpretedIntents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          kind: { type: 'string', enum: ['topic', 'modifier', 'exclusion'] },
        },
        required: ['label', 'kind'],
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clubId: { type: 'string' },
          matchScore: { type: 'integer' },
          matchLabel: { type: 'string', enum: ['Best Fit', 'Strong Match', 'Good Match'] },
          rationale: { type: 'string' },
          highlightTags: { type: 'array', items: { type: 'string' } },
        },
        required: ['clubId', 'matchScore', 'matchLabel', 'rationale', 'highlightTags'],
      },
    },
    followUpSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          appendQuery: { type: 'string' },
        },
        required: ['label', 'appendQuery'],
      },
    },
  },
  required: ['overview', 'interpretedIntents', 'recommendations', 'followUpSuggestions'],
};

const CLIENT_SYSTEM_INSTRUCTION = [
  'You are the UCSC ClubHub AI Search & Campus Involvement Advisor.',
  'STRICT GROUNDING RULES:',
  '1. ONLY recommend clubs whose exact `clubId` appears in `candidateClubs`. NEVER invent club IDs, names, or events.',
  '2. Strictly honor exclusions (e.g., "no Greek life", "not coding", "exclude joined").',
  '3. Balance multi-interest prompts across all requested areas.',
  '4. Write a warm, specific 2-3 sentence `overview` naming the best UCSC clubs and any upcoming event.',
  '5. Output JSON matching the schema.',
].join('\n');

export function getStoredGeminiKey() {
  if (ENV_GEMINI_KEY) return ENV_GEMINI_KEY;
  try {
    if (typeof localStorage !== 'undefined') {
      return String(localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
    }
  } catch {
    // Ignore storage errors
  }
  return '';
}

export function hasEnvGeminiKey() {
  return Boolean(ENV_GEMINI_KEY);
}

export function saveStoredGeminiKey(nextKey) {
  const clean = String(nextKey || '').trim();
  try {
    if (typeof localStorage !== 'undefined') {
      if (clean) {
        localStorage.setItem(GEMINI_KEY_STORAGE, clean);
      } else {
        localStorage.removeItem(GEMINI_KEY_STORAGE);
      }
    }
  } catch {
    // Ignore storage errors
  }
  return clean;
}

export async function getAiCapabilities() {
  const localKey = getStoredGeminiKey();
  if (cachedServerStatus?.checked) {
    return {
      generativeEnabled: Boolean(cachedServerStatus.configured || localKey),
      serverConfigured: Boolean(cachedServerStatus.configured),
      hasClientKey: Boolean(localKey),
      model: cachedServerStatus.model || DEFAULT_GEMINI_MODEL,
    };
  }

  if (!statusProbePromise) {
    statusProbePromise = (async () => {
      const res = await fetchActionJSON('/ai/status', { method: 'GET' });
      cachedServerStatus = {
        checked: true,
        configured: Boolean(res?.ok && res?.configured),
        model: res?.model || DEFAULT_GEMINI_MODEL,
      };
      statusProbePromise = null;
      return cachedServerStatus;
    })();
  }

  const status = await statusProbePromise;
  return {
    generativeEnabled: Boolean(status.configured || localKey),
    serverConfigured: Boolean(status.configured),
    hasClientKey: Boolean(localKey),
    model: status.model || DEFAULT_GEMINI_MODEL,
  };
}

function extractClientInteractionText(interaction) {
  if (!interaction || typeof interaction !== 'object') return '';
  if (typeof interaction.text === 'string' && interaction.text.trim()) {
    return interaction.text.trim();
  }
  if (Array.isArray(interaction.steps)) {
    for (let i = interaction.steps.length - 1; i >= 0; i--) {
      const step = interaction.steps[i];
      if (step?.type === 'model_output' && Array.isArray(step.content)) {
        for (const part of step.content) {
          if (part?.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
            return part.text.trim();
          }
        }
      }
    }
  }
  if (Array.isArray(interaction.outputs)) {
    for (let i = interaction.outputs.length - 1; i >= 0; i--) {
      const out = interaction.outputs[i];
      if (out?.type === 'text' && typeof out.text === 'string' && out.text.trim()) {
        return out.text.trim();
      }
    }
  }
  return '';
}

async function callDirectGeminiInteractions({
  apiKey,
  inputPayload,
  previousInteractionId,
  signal,
}) {
  const makeBody = includePrev => ({
    model: DEFAULT_GEMINI_MODEL,
    system_instruction: CLIENT_SYSTEM_INSTRUCTION,
    input: JSON.stringify(inputPayload),
    ...(includePrev && previousInteractionId
      ? { previous_interaction_id: String(previousInteractionId) }
      : {}),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: CLIENT_SCHEMA,
    },
  });

  let res = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(makeBody(true)),
    signal,
  });

  if (!res.ok && previousInteractionId && (res.status === 400 || res.status === 404)) {
    res = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(makeBody(false)),
      signal,
    });
  }

  if (!res.ok) {
    throw new Error(`Gemini API HTTP ${res.status}`);
  }

  const interaction = await res.json();
  const rawJson = extractClientInteractionText(interaction);
  if (!rawJson) throw new Error('Empty Gemini output');
  return {
    interactionId: interaction.id || '',
    model: DEFAULT_GEMINI_MODEL,
    result: JSON.parse(rawJson),
  };
}

/**
 * Build compact candidate catalog for Gemini 4 grounding from top RAG matches + diverse fallback pool.
 */
function buildCandidateCatalog(clubs, ragResult) {
  const intent = ragResult?.intent || {};
  const excludedCats = new Set(intent.excludedCategories || []);
  const seen = new Set();
  const candidates = [];

  for (const m of ragResult?.matches || []) {
    if (!m?.club?.id || seen.has(String(m.club.id))) continue;
    seen.add(String(m.club.id));
    candidates.push({
      id: String(m.club.id),
      name: m.club.name,
      categoryLabel: m.club.categoryLabel || m.club.category,
      members: m.club.members || 0,
      joined: Boolean(m.club.joined),
      summary: m.club.directoryDescription || m.club.description || '',
      tags: m.matchedTerms || [],
      ragScore: m.matchScore,
      nextEvent: m.nextEvent
        ? {
            title: m.nextEvent.event || m.nextEvent.title || '',
            when: formatEventWhenLabel(m.nextEvent),
            location: m.nextEvent.location || '',
          }
        : null,
    });
  }

  // Supplement up to 16 candidates so Gemini can catch nuanced semantic connections
  if (candidates.length < 16) {
    for (const c of clubs) {
      if (!c?.id || seen.has(String(c.id))) continue;
      if (intent.excludeJoined && c.joined) continue;
      if (excludedCats.has(String(c.category || '').toLowerCase())) continue;
      seen.add(String(c.id));
      candidates.push({
        id: String(c.id),
        name: c.name,
        categoryLabel: c.categoryLabel || c.category,
        members: c.members || 0,
        joined: Boolean(c.joined),
        summary: c.directoryDescription || c.description || '',
        tags: (c.tags || [])
          .map(t => t?.label)
          .filter(lbl => lbl && !lbl.startsWith('@'))
          .slice(0, 3),
        ragScore: 25,
        nextEvent: null,
      });
      if (candidates.length >= 16) break;
    }
  }

  return candidates;
}

/**
 * Strictly validate and merge Gemini 4 structured recommendations against real UCSC club objects.
 */
export function mergeGenerativeWithRag({ clubs, ragResult, llmPayload, maxResults = 6 }) {
  if (!llmPayload?.result) return null;
  const { result, interactionId = '', model = DEFAULT_GEMINI_MODEL } = llmPayload;

  const clubsById = new Map(clubs.map(c => [String(c.id), c]));
  const ragById = new Map((ragResult?.matches || []).map(m => [String(m.club.id), m]));
  const intent = ragResult?.intent || {};
  const excludedCats = new Set(intent.excludedCategories || []);

  const validatedMatches = [];
  const usedIds = new Set();

  for (const rec of result.recommendations || []) {
    const cid = String(rec?.clubId || '').trim();
    if (!cid || usedIds.has(cid)) continue;
    const club = clubsById.get(cid);
    if (!club) continue; // Reject hallucinated club IDs
    if (intent.excludeJoined && club.joined) continue;
    if (excludedCats.has(String(club.category || '').toLowerCase())) continue;

    usedIds.add(cid);
    const ragEntry = ragById.get(cid);
    const clampedScore = Math.min(99, Math.max(40, Math.round(Number(rec.matchScore) || ragEntry?.matchScore || 78)));

    validatedMatches.push({
      club,
      matchScore: clampedScore,
      matchLabel:
        rec.matchLabel ||
        (clampedScore >= 86 ? 'Best Fit' : clampedScore >= 68 ? 'Strong Match' : 'Good Match'),
      matchedTerms:
        Array.isArray(rec.highlightTags) && rec.highlightTags.length > 0
          ? rec.highlightTags.slice(0, 4)
          : ragEntry?.matchedTerms || [],
      aiRationale: String(rec.rationale || ragEntry?.aiRationale || '').trim(),
      nextEvent: ragEntry?.nextEvent || null,
      matchTier: clampedScore >= 80 ? 'top' : clampedScore >= 55 ? 'strong' : 'good',
    });

    if (validatedMatches.length >= maxResults) break;
  }

  // If LLM returned fewer valid clubs than RAG had strong hits, preserve remaining top RAG hits
  if (validatedMatches.length === 0 && (ragResult?.matches?.length || 0) > 0) {
    return null;
  }

  const validIntents =
    Array.isArray(result.interpretedIntents) && result.interpretedIntents.length > 0
      ? result.interpretedIntents.slice(0, 6)
      : ragResult.interpretedIntents;

  const validFollowUps =
    Array.isArray(result.followUpSuggestions) && result.followUpSuggestions.length > 0
      ? result.followUpSuggestions.slice(0, 4)
      : ragResult.followUpSuggestions;

  return {
    ...ragResult,
    hasMatches: validatedMatches.length > 0,
    matches: validatedMatches,
    aiOverview: String(result.overview || ragResult.aiOverview || '').trim(),
    interpretedIntents: validIntents,
    followUpSuggestions: validFollowUps,
    summary:
      validatedMatches.length > 0
        ? `Synthesized ${validatedMatches.length} Gemini 4 club ${validatedMatches.length === 1 ? 'match' : 'matches'}`
        : ragResult.summary,
    interactionId,
    mode: 'gemini-4',
    model,
  };
}

/**
 * Execute grounded Gemini 4 synthesis when configured on backend or via client API key.
 * Returns `null` cleanly if unconfigured, offline, or aborted.
 */
export async function runGenerativeClubSearch({
  clubs = [],
  events = [],
  query = '',
  turns = [],
  ragResult,
  userProfile = {},
  previousInteractionId = '',
  maxResults = 6,
  signal,
}) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery || !ragResult) return null;

  const caps = await getAiCapabilities();
  if (!caps.generativeEnabled) return null;
  if (signal?.aborted) return null;

  const candidateClubs = buildCandidateCatalog(clubs, ragResult);
  const upcomingEvents = (ragResult.relatedEvents?.length ? ragResult.relatedEvents : events)
    .slice(0, 8)
    .map(ev => ({
      clubId: ev.clubId || '',
      club: ev.club || ev.clubName || '',
      title: ev.event || ev.title || '',
      when: formatEventWhenLabel(ev),
      location: ev.location || '',
    }));

  const localKey = getStoredGeminiKey();

  // 1. Prefer backend `/api/ai/search` when server has GEMINI_API_KEY configured
  if (caps.serverConfigured) {
    const res = await fetchActionJSON('/ai/search', {
      method: 'POST',
      headers: localKey ? { 'x-gemini-api-key': localKey } : {},
      body: JSON.stringify({
        query: cleanQuery,
        turns,
        candidateClubs,
        upcomingEvents,
        userProfile,
        previousInteractionId,
      }),
      signal,
    });

    if (signal?.aborted || res?.aborted) return null;
    if (res?.ok && res?.result) {
      return mergeGenerativeWithRag({
        clubs,
        ragResult,
        llmPayload: res,
        maxResults,
      });
    }
  }

  // 2. Direct browser Gemini 4 Interactions API call when user supplied a client key
  if (localKey) {
    try {
      const directPayload = await callDirectGeminiInteractions({
        apiKey: localKey,
        inputPayload: {
          studentQuery: cleanQuery,
          conversationTurns: Array.isArray(turns) && turns.length ? turns : [cleanQuery],
          studentProfile: {
            major: userProfile?.major || '',
            year: userProfile?.year || '',
          },
          candidateClubs,
          upcomingEvents,
        },
        previousInteractionId,
        signal,
      });
      if (signal?.aborted) return null;
      return mergeGenerativeWithRag({
        clubs,
        ragResult,
        llmPayload: directPayload,
        maxResults,
      });
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      if (import.meta.env?.DEV) {
        console.warn('[AI Search] Direct Gemini call fell back to Hybrid RAG:', err.message);
      }
      return null;
    }
  }

  return null;
}
