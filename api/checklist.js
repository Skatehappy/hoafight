// api/checklist.js
import { MODEL } from './_config.js';
import { verifyLicense, g4tMatches } from './_license.js';
import { callComplete } from './_complete.js';
import { fallbackFor } from './_checklist-fallbacks.js';
import { resolveStateValue, lintText, problemList, logHit } from './_lock.js';
import { buildChecklistPrompt } from './_checklist-prompt.js';

const PRODUCT_LINK = '8TWrB';
const EDGE_BUDGET_MS = 20000;

export const config = { runtime: 'edge' };

const FALLBACK = ['Send letter via certified mail with return receipt requested', 'Pull the specific CC&R section the HOA claims you violated — read it carefully', 'Document any neighbors with similar conditions who were NOT fined', 'Request a formal hearing in writing if the notice or your governing documents provide for one', 'Request copies of board meeting minutes and enforcement records', "Check your state's HOA statute for homeowner rights and board obligations", 'Photograph your property to document compliance or the alleged violation', "File complaint with your state's HOA ombudsman or regulatory agency if ignored", 'Consult an HOA attorney for large fines or a pattern of harassment'];


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
    const t0 = Date.now();
    const { accessCode, state, varianceType, issueType, letterExcerpt } = await req.json();

    const payhipApiKey = process.env.PAYHIP_API_KEY;
    if (!payhipApiKey) return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 500, headers });
    // Same gate as generate.js: a passed Payhip verification (valid, enabled, this product) or a G4T test code.
    // No usage check/mark here: the checklist is requested after the letter has consumed the code.
    const testMode = g4tMatches(accessCode, process.env.G4_TEST_CODE_SECRET);
    if (!testMode) {
      const lic = await verifyLicense(accessCode, PRODUCT_LINK, payhipApiKey);
      if (!lic.ok) return new Response(JSON.stringify({ error: lic.error }), { status: lic.status, headers });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    const abbr = resolveStateValue(state);

    // The dispute type comes from issueType (the client sends the form's Type of Dispute); varianceType is the legacy field.
    const type = issueType || varianceType;
    const built = buildChecklistPrompt(state, type, letterExcerpt, abbr);
    const prompt = built.user;
    const system = built.system;

    // Edge must start responding within 25s: the whole request (licence check + model calls) gets a 20s budget,
    // a truncation retry only starts with 10s left, and any failure falls back to this dispute type's own list.
    const deadlineAt = t0 + EDGE_BUDGET_MS;
    const diag = {};
    const reqPreview = { model: MODEL, max_tokens: 2000, state: String(state || '').slice(0, 40), issueType: String(type || '').slice(0, 60), systemLen: (system || '').length, userLen: prompt.length, system: (system || '').slice(0, 600), user: prompt.slice(0, 600) };
    const r = await callComplete(apiKey, max => ({ model: MODEL, max_tokens: max, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: prompt }] }), [2000, 4000], { deadlineAt, minRetryMs: 10000 });
    diag.attempts = r.attempts; diag.stop = r.stop; diag.stopDetails = r.stopDetails; diag.status = r.status; diag.ms = Date.now() - t0;
    diag.request = reqPreview;
    let checklist = null;
    if (r.ok) {
      try { checklist = JSON.parse(r.text.replace(/```json|```/g, '').trim()); } catch { diag.parseFailed = true; }
    } else {
      diag.failed = r.refusal ? 'refusal' : r.truncated ? 'truncated' : r.timeout ? 'timeout' : 'model-error';
      // Diagnostics only: request preview (prompt text, state, type - no keys, no PII beyond the 200-char excerpt) + stop info.
      console.log(JSON.stringify({ evt: 'checklist_model_fail', app: 'hoafight', reason: diag.failed, status: r.status || null, stop: r.stop || null, stopDetails: r.stopDetails || null, usage: r.usage || null, ms: diag.ms, request: reqPreview }));
    }

    if (Array.isArray(checklist)) {
      // Same lock as the letter: drop any item that cites an unverified authority or states an unverified figure.
      const own = [String(type || ''), String(letterExcerpt || '')];
      const kept = [], flagged = [];
      for (const item of checklist.filter(x => typeof x === 'string' && x.trim())) {
        const p = lintText(item, abbr, ...own);
        if (p.cites.length || p.figs.length) {
          flagged.push(...problemList(p));
          (diag.droppedItems = diag.droppedItems || []).push({ item: item.slice(0, 120), cites: p.cites.map(c => c.text), nums: p.figs.map(f => f.text) });
        } else kept.push(item);
      }
      if (flagged.length) logHit('hoafight-checklist', { state: abbr || 'unknown', flagged: flagged.length, stripped: checklist.length - kept.length, cites: flagged.slice(0, 8) });
      checklist = kept.slice(0, 15);
    }
    diag.survivors = Array.isArray(checklist) ? checklist.length : -1;
    if (!Array.isArray(checklist) || checklist.length < 3) { diag.usedFallback = true; checklist = fallbackFor(type); }

    return new Response(JSON.stringify(testMode ? { checklist, _diag: diag } : { checklist }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
