// api/generate.js
import { MODEL } from './_config.js';
import { resolveStateValue, lockBlock, lintText, stripText, problemList, logHit } from './_lock.js';
import { verifyLicense, g4tMatches } from './_license.js';
import { callComplete } from './_complete.js';
import { stripMarkdown } from './_markdown.js';
import { VOICE_RULE, findAttorneyVoice } from './_voice.js';

// The letter is shown, copied, emailed and printed as plain text, so the model is told to write plain text and any markdown that still
// comes back is stripped (api/_markdown.js) before the lint and before the reply.
const PLAIN_TEXT_RULE = '\n\nFORMAT RULE: write the letter in plain text only. No markdown: no # headings, no ** or __ bold, no * or _ italics, no bullet symbols, no tables or | characters, no code fences. Use ordinary paragraphs, and numbered sentences such as "1." if a list is needed.';

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

// ── Citation + figure lock (api/_lock.js) ────────────────────────────────────
// Hobby maxDuration is 60s. Every request has a hard 50s budget (licence check + model calls + usage mark): each model fetch is
// aborted at the deadline, the truncation retry only starts with 30s left, and the lint regeneration (one single-attempt call)
// only starts with 30s left; otherwise the unverified sentences are stripped from the text already in hand.
const REQUEST_BUDGET_MS = 50000;
const RETRY_MIN_MS = 30000;
const REGEN_MIN_MS = 30000;

function resolveState(body) {
  return resolveStateValue(body.state || (/^STATE:\s*(.+)$/m.exec(String(body.userPrompt || '')) || [])[1]);
}

// stop_reason "max_tokens" = truncated: retried once with a higher limit, never returned or linted as a letter.
const TOKEN_LIMITS = [3000, 6000];
const callClaude = (anthropicKey, system, messages, deadlineAt, limits = TOKEN_LIMITS) =>
  callComplete(anthropicKey, max => ({ model: MODEL, max_tokens: max, thinking: { type: 'disabled' }, system: system || undefined, messages }), limits, { deadlineAt, minRetryMs: RETRY_MIN_MS });

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

  const t0 = Date.now();
  const deadlineAt = t0 + REQUEST_BUDGET_MS;
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

    // Input caps (invalid input -> 400 with a clear message; the client keeps the buyer's code and form intact).
    const tooLong = (v, max) => typeof v === 'string' && v.length > max;
    if (tooLong(systemPrompt, 8000) || tooLong(userPrompt, 30000) || tooLong(draftLetter, 16000)) {
      return res.status(400).json({ error: 'Your text is too long. Shorten the longest field and try again.', code: 'input_too_long' });
    }
    if ((systemPrompt != null && typeof systemPrompt !== 'string') || (userPrompt != null && typeof userPrompt !== 'string') || (draftLetter != null && typeof draftLetter !== 'string')) {
      return res.status(400).json({ error: 'Invalid request.', code: 'bad_input' });
    }
    if (!reviewMode && !String(userPrompt || '').trim()) {
      return res.status(400).json({ error: 'Nothing to generate: the request was empty.', code: 'bad_input' });
    }

    let messages;
    if (reviewMode && draftLetter) {
      messages = [{ role: 'user', content: `Review and improve this appeal letter. Fix vague language, ensure all arguments are explicitly stated, remove emotional appeals, tighten redundancy. Write plain text only (no markdown, headings, bold, bullets or tables). Return ONLY the improved letter:\n\n${draftLetter}` }];
    } else {
      messages = [{ role: 'user', content: userPrompt }];
    }

    const abbr = resolveState(body);
    const lockOn = !isCheckCall;
    const system = lockOn
      ? ((systemPrompt || '') + `

${VOICE_RULE}` + PLAIN_TEXT_RULE + lockBlock(abbr))
      : (systemPrompt || undefined);
    const ownTexts = [String(userPrompt || ''), String(systemPrompt || ''), String(draftLetter || '')];

    const result = await callClaude(anthropicKey, system, messages, deadlineAt);
    // Failure (incl. a reply still cut off after the retry) returns here, BEFORE the usage mark: the code is not burned
    // and no partial letter is ever returned.
    if (!result.ok) {
      if (result.refusal) { console.log(JSON.stringify({ evt: 'generate_refusal', app: APP, stop: result.stop, stopDetails: result.stopDetails || null })); return res.status(502).json({ error: 'The letter service could not complete this request. Please try again; your access code was not used.', code: 'refusal' }); }
      if (result.timeout) return res.status(504).json({ error: 'The letter took too long to finish. Please try again; your access code was not used.', code: 'timeout' });
      if (result.truncated) return res.status(502).json({ error: 'The letter was too long to finish. Please try again; your access code was not used.', code: 'truncated' });
      return res.status(502).json({ error: 'AI generation failed', detail: result.err });
    }
    let text = stripMarkdown(result.text);
    // Fail loudly on a missing text block — never return undefined — and because this throws BEFORE the
    // mark-usage call below, the buyer's one-use license is NOT burned on a parse miss.
    if (!text) throw new Error(`No text block in API response (stop_reason: ${result.stop || 'unknown'})`);

    // Voice lint: the homeowner writes and signs; any attorney/counsel/firm signature or self-description is regenerated once,
    // then rejected (502, BEFORE the usage mark, offending text never returned).
    const voiceFail = () => res.status(502).json({ error: 'The letter service produced a letter written in a lawyer voice, which is not allowed. Please try again; your access code was not used.', code: 'attorney_voice' });
    let voiceHits = lockOn ? findAttorneyVoice(text) : [];
    if (voiceHits.length) {
      console.log(JSON.stringify({ evt: 'voice_lint_hit', app: APP, hits: voiceHits, retried: deadlineAt - Date.now() >= REGEN_MIN_MS }));
      if (deadlineAt - Date.now() >= REGEN_MIN_MS) {
        const vnotice = `

REGENERATION NOTICE: the previous draft contained the phrase "${voiceHits[0]}", which is not allowed. ${VOICE_RULE} Rewrite the whole letter as a homeowner writing for themselves, signed [Your Name].`;
        const again = await callClaude(anthropicKey, system + vnotice, messages, deadlineAt, [TOKEN_LIMITS[1]]);
        if (again.ok && again.text) { text = stripMarkdown(again.text); voiceHits = findAttorneyVoice(text); }
      }
      if (voiceHits.length) return voiceFail();
    }

    // Post-generation lint: citations (section AND subsection) and dollar/percent/time figures outside the verified
    // set are regenerated once without them, else their sentences are stripped.
    if (lockOn) {
      const letterType = String(body.disputeType || body.letterType || '').slice(0, 60);
      let p = lintText(text, abbr, ...ownTexts);
      let regenerated = false;
      let stripped = 0;
      const first = problemList(p);
      if (first.length) {
        if (deadlineAt - Date.now() >= REGEN_MIN_MS) {
          regenerated = true;
          const notice = `\n\nREGENERATION NOTICE: the previous draft used authorities or figures that are not verified (${first.slice(0, 8).join('; ')}). Rewrite the letter without them: cite nothing outside the verified list and state no dollar, percent or day figure outside the verified list or the owner's facts.`;
          const second = await callClaude(anthropicKey, system + notice, messages, deadlineAt, [TOKEN_LIMITS[1]]);
          if (second.ok && second.text) { text = stripMarkdown(second.text); p = lintText(text, abbr, ...ownTexts); }
        }
        if (p.cites.length || p.figs.length) { text = stripText(text, abbr, ...ownTexts); stripped = p.cites.length + p.figs.length; }
      }
      if (findAttorneyVoice(text).length) return voiceFail();
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
