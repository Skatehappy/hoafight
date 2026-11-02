// api/generate.js
import { MODEL } from './_config.js';
import VERIFIED from './_verified-citations.js';
import { findUnverified, stripSentences, logHit } from './_citelint.js';
import { verifyLicense, g4tMatches } from './_license.js';

// Node serverless runtime (NOT edge). Edge caps at ~25s on Hobby and ignores
// maxDuration, which 504'd ~25s Opus letters. Node honors maxDuration:60. This
// MUST use the classic (req, res) handler: Vercel's Node runtime writes the
// response via res and IGNORES a returned Response object (returning one hangs
// the function until the timeout).
export const config = { maxDuration: 60 };

const PRODUCT_LINK = '8TWrB';
const APP = 'hoafight';

// ── Gate 4 test-code path ────────────────────────────────────────────────────
// Inert unless G4_TEST_CODE_SECRET is set (Vercel env var, no default, 16+ chars). A code of the form
// "G4T-<secret>" skips the Payhip check and the usage mark, is capped per UTC day, and every use is logged.
// The counter is per serverless instance (best effort): a cold start resets it, so treat the cap as a guard
// rail, not an accounting system.
const G4T_DAILY_CAP = 10;
const g4tState = (globalThis.__g4tState ||= { day: '', used: 0 });

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
const REGEN_BUDGET_MS = 30000; // maxDuration is 60s; skip the regeneration pass if the first call already used half of it

function resolveState(body) {
  const raw = String(body.state || (/^STATE:\s*(.+)$/m.exec(String(body.userPrompt || '')) || [])[1] || '').trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up.length === 2 && VERIFIED.states[up]) return up;
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
  // Extract the text block by type, not by position. With adaptive thinking a
  // model can place a "thinking" block at content[0], so content[0].text is
  // undefined even on a 200.
  return { ok: true, text: data.content?.find(b => b.type === 'text')?.text, stop: data.stop_reason };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const { accessCode, systemPrompt, userPrompt, reviewMode, draftLetter } = body;

    if (!accessCode || !accessCode.trim()) {
      return res.status(401).json({ error: 'Access code required' });
    }

    const payhipApiKey = process.env.PAYHIP_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!payhipApiKey || !anthropicKey) {
      return res.status(500).json({ error: 'Service not configured' });
    }

    const isCheckCall = systemPrompt === 'Reply: VALID';
    const isTestCode = g4tMatches(accessCode, process.env.G4_TEST_CODE_SECRET);

    if (isTestCode) {
      if (isCheckCall) return res.status(200).json({ text: 'VALID' });
      if (!g4tTake()) return res.status(429).json({ error: 'Test-code daily limit reached.' });
    } else {
      const lic = await verifyLicense(accessCode, PRODUCT_LINK, payhipApiKey);
      if (!lic.ok) return res.status(lic.status).json({ error: lic.error });
      // Access-code check: license verified; answer without a model call or a usage mark.
      if (isCheckCall) return res.status(200).json({ text: 'VALID' });
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

    const t0 = Date.now();
    const result = await callClaude(anthropicKey, system, messages);
    if (!result.ok) return res.status(502).json({ error: 'AI generation failed', detail: result.detail });
    let text = result.text;
    // Fail loudly on a missing text block — never return undefined — and because this throws BEFORE the
    // mark-usage call below, the buyer's one-use license is NOT burned on a parse miss.
    if (!text) throw new Error(`No text block in API response (stop_reason: ${result.stop || 'unknown'})`);

    // Post-generation citation lint: anything outside the verified set is regenerated once without it, else stripped.
    if (lockOn) {
      const allowed = allowedKeys(abbr);
      const letterType = String(body.disputeType || body.letterType || '').slice(0, 60);
      let bad = findUnverified(text, allowed);
      let regenerated = false;
      let stripped = 0;
      const first = bad.map(b => b.text);
      if (bad.length) {
        if (Date.now() - t0 < REGEN_BUDGET_MS) {
          regenerated = true;
          const notice = `\n\nREGENERATION NOTICE: the previous draft cited authorities that are not verified (${first.slice(0, 8).join('; ')}). Rewrite the letter without citing them, and cite nothing outside the verified list.`;
          const second = await callClaude(anthropicKey, system + notice, messages);
          if (second.ok && second.text) { text = second.text; bad = findUnverified(text, allowed); }
        }
        if (bad.length) { text = stripSentences(text, bad); stripped = bad.length; }
      }
      logHit(APP, { state: abbr || 'unknown', letterType, flagged: first.length, regenerated, stripped, cites: first.slice(0, 8) });
      if (!text.trim()) throw new Error('No usable letter text after citation lint');
    }

    // Mark license as used. Awaited (not fire-and-forget): on Node serverless,
    // work after res is sent is not guaranteed to run. Only for real buyer codes
    // (never check calls or G4T test codes).
    if (!isCheckCall && !isTestCode) {
      try {
        await fetch(`https://payhip.com/api/v1/license/usage`, {
          method: 'PUT',
          headers: { 'payhip-api-key': payhipApiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `product_link=${PRODUCT_LINK}&license_key=${encodeURIComponent(accessCode.trim())}`,
        });
      } catch { /* letter already generated; don't fail the response on a usage-mark hiccup */ }
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
