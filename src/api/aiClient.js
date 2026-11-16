// ── ClubHub Generative AI Search Client (Gemini 4 + Hybrid RAG Grounding) ──
// Upgrades instant local Hybrid Semantic RAG results with live Gemini 4
// (`gemini-4-hydrogen`) synthesis via `/api/ai/search` or an optional client
// Gemini API key, while strictly preventing hallucinated clubs.

import { fetchActionJSON } from './client.js';
import { formatEventWhenLabel, recommendClubsForInterests } from '../utils/aiClubAgent.js';
import { getClubSearchDocument, isClubExcluded } from '../utils/search.js';

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
const CANDIDATE_LIMIT = 16;

export function buildCandidateCatalog(clubs, ragResult) {
  const intent = ragResult?.intent || {};
  const clubById = new Map(clubs.filter(club => club?.id).map(club => [String(club.id), club]));
  const matches = ragResult?.matches || [];
  const relevant = matches.length >= CANDIDATE_LIMIT || !ragResult?.query
    ? matches
    : [...matches, ...recommendClubsForInterests(clubs, ragResult.query, {
      maxResults: CANDIDATE_LIMIT,
      events: ragResult.relatedEvents,
      userMajor: intent.userMajor,
    }).matches];

  const seen = new Set();
  const candidates = [];
  for (const match of relevant) {
    const id = String(match?.club?.id ?? '');
    const club = clubById.get(id);
    if (!club || seen.has(id) || isClubExcluded(club, intent, intent.tokens)) continue;
    seen.add(id);
    const doc = getClubSearchDocument(club);
    const budget = Math.floor(480 / Math.max(1, doc.descriptions.length));
    candidates.push({
      id,
      name: club.name,
      categoryLabel: club.categoryLabel || club.category,
      members: club.members || 0,
      joined: Boolean(club.joined),
      summary: doc.descriptions.map(text => text.trim().slice(0, budget)).join(' · '),
      tags: [...new Set([...(match.matchedTerms || []), ...doc.tags])].slice(0, 6),
      ragScore: match.matchScore,
      nextEvent: match.nextEvent ? {
        title: match.nextEvent.event || match.nextEvent.title || '',
        when: formatEventWhenLabel(match.nextEvent),
        location: match.nextEvent.location || '',
      } : null,
    });
    if (candidates.length === CANDIDATE_LIMIT) break;
  }
  return candidates;
}

/**
 * A model may point out supplied clubs. All rendered evidence and ordering
 * continue to come from the local catalog; free-form activity claims cannot
 * be validated merely by checking a club ID.
 */
export function mergeGenerativeWithRag({
  clubs, ragResult, llmPayload, maxResults = 6,
  candidateClubs = buildCandidateCatalog(clubs, ragResult),
}) {
  if (!Array.isArray(llmPayload?.result?.recommendations)) return null;
  const candidates = new Set(candidateClubs.map(candidate => candidate.id));
  const allowed = new Map(clubs.map(club => [String(club.id), club]));
  const intent = ragResult?.intent || {};
  const matched = new Set();
  const assistantPicks = [];
  for (const rec of llmPayload.result.recommendations) {
    const id = String(rec?.clubId ?? '').trim();
    const club = allowed.get(id);
    if (!club || !candidates.has(id) || matched.has(id) || isClubExcluded(club, intent, intent.tokens)) continue;
    matched.add(id);
    assistantPicks.push(club);
    if (assistantPicks.length >= Math.min(3, maxResults)) break;
  }
  if (!assistantPicks.length) return null;
  return {
    ...ragResult,
    assistantPicks,
    interactionId: llmPayload.interactionId || '',
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

  const candidateClubs = buildCandidateCatalog(clubs, ragResult);
  if (!candidateClubs.length) return null;

  const caps = await getAiCapabilities();
  if (!caps.generativeEnabled) return null;
  if (signal?.aborted) return null;

  const candidateIds = new Set(candidateClubs.map(club => club.id));
  const upcomingEvents = (ragResult.relatedEvents?.length ? ragResult.relatedEvents : events)
    .filter(ev => candidateIds.has(String(ev.clubId || '')))
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
        candidateClubs,
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
        candidateClubs,
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
