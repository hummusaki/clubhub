// ── ClubHub Grounded AI Search Route (Gemini 4 Interactions v1 API) ─────────
// Synthesizes conversational AI Overviews, personalized club rationales, and
// multi-turn follow-up suggestions grounded strictly on retrieved UCSC clubs
// and upcoming campus events. Gracefully reports `{ configured: false }` when
// no GEMINI_API_KEY is present so the frontend uses Hybrid Semantic RAG cleanly.

import { Router } from 'express';

const router = Router();

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1/interactions';
const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

export const AI_SEARCH_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    overview: {
      type: 'string',
      description:
        'Warm, specific 2-3 sentence campus advisor summary explaining the best UCSC club matches, how they blend the student query, and any notable upcoming event or honored exclusion.',
    },
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
          clubId: {
            type: 'string',
            description: 'Exact id from the provided candidateClubs catalog. Never invent IDs.',
          },
          matchScore: {
            type: 'integer',
            description: 'Calibrated relevance score between 45 and 99.',
          },
          matchLabel: {
            type: 'string',
            enum: ['Best Fit', 'Strong Match', 'Good Match'],
          },
          rationale: {
            type: 'string',
            description:
              '1-2 concise sentences tailored to why this specific UCSC club fits the student prompt.',
          },
          highlightTags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['clubId', 'matchScore', 'matchLabel', 'rationale', 'highlightTags'],
      },
    },
    followUpSuggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Short chip label (max 34 chars, may start with one relevant emoji).',
          },
          appendQuery: {
            type: 'string',
            description: 'Refinement phrase to append on click.',
          },
        },
        required: ['label', 'appendQuery'],
      },
    },
  },
  required: ['overview', 'interpretedIntents', 'recommendations', 'followUpSuggestions'],
};

const SYSTEM_INSTRUCTION = [
  'You are the UCSC ClubHub AI Search & Campus Involvement Advisor.',
  'Your job is to help UC Santa Cruz students discover student organizations and upcoming meetings.',
  'STRICT GROUNDING RULES:',
  '1. ONLY recommend clubs whose exact `clubId` appears in the provided `candidateClubs` JSON list. NEVER invent or hallucinate club names, IDs, or event dates.',
  '2. Strictly respect negative constraints (e.g., "no Greek life", "not coding", "exclude clubs I already joined").',
  '3. Balance multi-faceted queries (e.g., if a student asks for "CS + something creative", include top matches from both domains rather than only one).',
  '4. Keep `overview` conversational, helpful, and concise (2-3 sentences). Mention specific club names and real upcoming events if present in the context.',
  '5. Return valid JSON matching the requested schema.',
].join('\n');

function resolveApiKey(req) {
  const headerKey = String(req.headers['x-gemini-api-key'] || '').trim();
  if (headerKey) return headerKey;
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function extractInteractionText(interaction) {
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

async function callGeminiInteractions({ apiKey, model, inputText, previousInteractionId }) {
  const buildBody = includePrev => ({
    model,
    system_instruction: SYSTEM_INSTRUCTION,
    input: inputText,
    ...(includePrev && previousInteractionId
      ? { previous_interaction_id: String(previousInteractionId) }
      : {}),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: AI_SEARCH_RESPONSE_SCHEMA,
    },
  });

  let response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(buildBody(true)),
  });

  // If previous_interaction_id expired or belonged to another session, retry statelessly with full turns context
  if (!response.ok && previousInteractionId && (response.status === 400 || response.status === 404)) {
    response = await fetch(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(buildBody(false)),
    });
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Gemini Interactions API HTTP ${response.status}: ${errText.slice(0, 240)}`);
  }

  return response.json();
}

// GET /api/ai/status
router.get('/status', (req, res) => {
  const apiKey = resolveApiKey(req);
  const model = String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  res.json({
    ok: true,
    configured: Boolean(apiKey),
    model,
  });
});

// POST /api/ai/search
router.post('/search', async (req, res) => {
  const apiKey = resolveApiKey(req);
  const model = String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();

  if (!apiKey) {
    return res.json({
      ok: false,
      configured: false,
      reason: 'GEMINI_API_KEY is not configured on the server.',
    });
  }

  const {
    query = '',
    turns = [],
    candidateClubs = [],
    upcomingEvents = [],
    userProfile = {},
    previousInteractionId = '',
  } = req.body || {};

  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    return res.status(400).json({ ok: false, error: 'Missing search query.' });
  }

  const compactCandidates = (Array.isArray(candidateClubs) ? candidateClubs : [])
    .slice(0, 18)
    .map(c => ({
      clubId: String(c.id || c.clubId || ''),
      name: String(c.name || '').slice(0, 90),
      category: String(c.categoryLabel || c.category || '').slice(0, 40),
      members: Number(c.members || 0),
      joined: Boolean(c.joined),
      summary: String(c.summary || c.directoryDescription || c.description || '').slice(0, 220),
      tags: Array.isArray(c.tags) ? c.tags.slice(0, 5) : [],
      nextEvent: c.nextEvent || null,
      ragScore: Number(c.ragScore || 0),
    }))
    .filter(c => c.clubId && c.name);

  const compactEvents = (Array.isArray(upcomingEvents) ? upcomingEvents : [])
    .slice(0, 8)
    .map(e => ({
      clubId: e.clubId || '',
      club: e.club || e.clubName || '',
      title: String(e.event || e.title || '').slice(0, 90),
      when: e.when || [e.day, e.date, e.time].filter(Boolean).join(' '),
      location: e.location || '',
    }));

  const promptPayload = {
    studentQuery: cleanQuery,
    conversationTurns: Array.isArray(turns) ? turns.slice(-5) : [cleanQuery],
    studentProfile: {
      major: userProfile?.major || '',
      year: userProfile?.year || '',
    },
    candidateClubs: compactCandidates,
    upcomingEvents: compactEvents,
  };

  try {
    const interaction = await callGeminiInteractions({
      apiKey,
      model,
      inputText: JSON.stringify(promptPayload),
      previousInteractionId,
    });

    const rawJson = extractInteractionText(interaction);
    if (!rawJson) {
      return res.json({
        ok: false,
        configured: true,
        error: 'Empty model output from Gemini Interactions API.',
      });
    }

    const parsed = JSON.parse(rawJson);
    return res.json({
      ok: true,
      configured: true,
      model,
      interactionId: interaction.id || '',
      result: parsed,
    });
  } catch (err) {
    console.warn('[AI Search] Gemini synthesis fallback:', err.message);
    return res.json({
      ok: false,
      configured: true,
      error: err.message || 'AI synthesis request failed.',
    });
  }
});

export default router;
