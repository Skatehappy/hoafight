// api/generate.js
import { MODEL } from './_config.js';
import VERIFIED from './_verified-citations.js';
import { findUnverified, stripSentences, logHit } from './_citelint.js';

export const config = { runtime: 'edge' };

const PRODUCT_LINK = '8TWrB';
const APP = 'hoafight';

// ── Gate 4 test-code path ────────────────────────────────────────────────────
// Inert unless G4_TEST_CODE_SECRET is set (Vercel env var, no default, 16+ chars). A code of the form
// "G4T-<secret>" skips the Payhip check and the usage mark, is capped per UTC day, and every use is logged.
// The counter is per edge instance (best effort): a cold start resets it, so treat the cap as a guard rail,
// not an accounting system.
const G4T_DAILY_CAP = 10;
const g4tState = (globalThis.__g4tState ||= { day: '', used: 0 });

function g4tMatches(code, secret) {
  if (!secret || secret.length < 16) return false;
  const want = 'G4T-' + secret;
  const got = String(code || '').trim();
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function g4tTake() {
  const day = new Date().toISOString().slice(0, 10);
  if (g4tState.day !== day) { g4tState.day = day; g4tState.used = 0; }
  if (g4tState.used >= G4T_DAILY_CAP) return false;
  g4tState.used += 1;
  console.log(JSON.stringify({ evt: 'g4t_use', app: APP, day, used: g4tState.used, cap: G4T_DAILY_CAP }));
  return true;
}

// ── Citation lock ────────────────────────────────────────────────────────────
const STATE_ABBR = { california: 'CA', texas: 'TX', florida: 'FL', 'new york': 'NY', illinois: 'IL', pennsylvania: 'PA', ohio: 'OH', georgia: 'GA', 'north carolina': 'NC', arizona: 'AZ' };

function resolveState(body) {
  const raw = String(body.state || (/^STATE:\s*(.+)$/m.exec(String(body.userPrompt || '')) || [])[1] || '').trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (VERIFIED.states[up] && up.length === 2) return up;
  return STATE_ABBR[raw.toLowerCase()] || null;
}

function allowedKeys(abbr) {
  const set = new Set(VERIFIED.federal.keys);
  if (abbr && VERIFIED.states[abbr]) VERIFIED.states[abbr].keys.forEach(k => set.add(k));
  else for (const [s, v] of Object.entries(VERIFIED.states)) if (!s.startsWith('_')) v.keys.forEach(k => set.add(k));
  return set;
}

function citationBlock(abbr) {
  const shown = new Set(VERIFIED.federal.display);
  if (abbr && VERIFIED.states[abbr]) VERIFIED.states[abbr].display.forEach(d => shown.add(d));
  const list = [...shown].slice(0, 90).join('; ') || '(none verified for this state)';
  return `\n\nCITATION RULE (enforced by the server): cite ONLY these verified authorities${abbr ? ` for ${abbr}` : ''}, including their subsections: ${list}. Cite nothing else: no other statute, regulation, rule, or court case, and no invented section numbers, even if you believe it exists. If a point needs authority that is not on the list, make the point without a citation.`;
}

async function callClaude(anthropicKey, system, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      thinking: { type: 'disabled' },
      system: system || undefined,
      messages,
    }),
  });
  if (!response.ok) return { ok: false, detail: await response.text() };
  const data = await response.json();
  return { ok: true, text: data.content?.[0]?.text || '', stop: data.stop_reason };
}

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  try {
    const body = await req.json();
    const { accessCode, systemPrompt, userPrompt, reviewMode, draftLetter } = body;

    if (!accessCode || !accessCode.trim()) {
      return new Response(JSON.stringify({ error: 'Access code required' }), { status: 401, headers });
    }

    const payhipApiKey = process.env.PAYHIP_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!payhipApiKey || !anthropicKey) {
      return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 500, headers });
    }

    const isCheckCall = systemPrompt === 'Reply: VALID';
    const isTestCode = g4tMatches(accessCode, process.env.G4_TEST_CODE_SECRET);

    if (isTestCode) {
      if (isCheckCall) return new Response(JSON.stringify({ text: 'VALID' }), { status: 200, headers });
      if (!g4tTake()) return new Response(JSON.stringify({ error: 'Test-code daily limit reached.' }), { status: 429, headers });
    } else if (!isCheckCall) {
      const payhipRes = await fetch(
        `https://payhip.com/api/v1/license/verify?product_link=${PRODUCT_LINK}&license_key=${encodeURIComponent(accessCode.trim())}`,
        {
          method: 'GET',
          headers: { 'payhip-api-key': payhipApiKey },
        }
      );

      const payhipData = payhipRes.ok ? await payhipRes.json().catch(() => null) : null;

      if (!payhipData || !payhipData.data) {
        return new Response(JSON.stringify({ error: 'Invalid access code. Check your Payhip receipt email.' }), { status: 401, headers });
      }

      if (payhipData.data.uses >= 1) {
        return new Response(JSON.stringify({ error: 'This code has already been used. Each code generates one letter.' }), { status: 401, headers });
      }
    }

    let messages;
    if (reviewMode && draftLetter) {
      messages = [{ role: 'user', content: `Review and improve this appeal letter. Fix vague language, ensure all arguments are explicitly stated, remove emotional appeals, tighten redundancy. Return ONLY the improved letter:\n\n${draftLetter}` }];
    } else {
      messages = [{ role: 'user', content: userPrompt }];
    }

    const abbr = resolveState(body);
    const lockOn = !isCheckCall;
    const system = lockOn
      ? ((systemPrompt || '') + citationBlock(abbr))
      : (systemPrompt || undefined);

    let result = await callClaude(anthropicKey, system, messages);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: 'AI generation failed', detail: result.detail }), { status: 502, headers });
    }
    let text = result.text;

    // Fail loudly on an empty/refused response instead of returning a blank
    // letter (and do NOT burn the buyer's one-use license code on failure).
    if (!text) {
      return new Response(JSON.stringify({ error: 'AI returned an empty response. Please try again.', detail: result.stop || 'no_content' }), { status: 502, headers });
    }

    // Post-generation citation lint: anything outside the verified set is regenerated once without it, else stripped.
    if (lockOn) {
      const allowed = allowedKeys(abbr);
      const letterType = String(body.disputeType || body.letterType || '').slice(0, 60);
      let bad = findUnverified(text, allowed);
      let regenerated = false;
      let stripped = 0;
      const first = bad.map(b => b.text);
      if (bad.length) {
        regenerated = true;
        const notice = `\n\nREGENERATION NOTICE: the previous draft cited authorities that are not verified (${first.slice(0, 8).join('; ')}). Rewrite the letter without citing them, and cite nothing outside the verified list.`;
        const second = await callClaude(anthropicKey, system + notice, messages);
        if (second.ok && second.text) { text = second.text; bad = findUnverified(text, allowed); }
        if (bad.length) { text = stripSentences(text, bad); stripped = bad.length; }
      }
      logHit(APP, { state: abbr || 'unknown', letterType, flagged: first.length, regenerated, stripped, cites: first.slice(0, 8) });
      if (!text.trim()) {
        return new Response(JSON.stringify({ error: 'AI returned an empty response. Please try again.', detail: 'citation_lint_empty' }), { status: 502, headers });
      }
    }

    // Mark license as used (non-blocking). Test codes and check calls never touch Payhip.
    if (!isCheckCall && !isTestCode) {
      fetch(
        `https://payhip.com/api/v1/license/usage`,
        {
          method: 'PUT',
          headers: {
            'payhip-api-key': payhipApiKey,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `product_link=${PRODUCT_LINK}&license_key=${encodeURIComponent(accessCode.trim())}`,
        }
      ).catch(() => {});
    }

    return new Response(JSON.stringify({ text }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
