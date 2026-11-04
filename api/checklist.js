// api/checklist.js
import { MODEL } from './_config.js';
import { verifyLicense, g4tMatches } from './_license.js';
import { callComplete } from './_complete.js';
import { typeInfo, fallbackFor } from './_checklist-fallbacks.js';
import { resolveStateValue, lockBlock, lintText, problemList, logHit } from './_lock.js';

const PRODUCT_LINK = '8TWrB';

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
    const prompt = `Generate a practical checklist for a homeowner sending a letter to their HOA about ${typeInfo(type).focus}, as a JSON array of 8 to 10 strings. Every item is one plain action step of at most 25 words and fits this situation only. Always include sending the letter by certified mail with return receipt and keeping a copy. Return ONLY a valid JSON array, no other text.

State: ${state}
Situation: ${type || 'HOA dispute'}
Letter excerpt: ${letterExcerpt?.substring(0, 200) || ''}${lockBlock(abbr)}`;

    // Never parse a cut-off reply: callComplete retries once with a higher limit, then reports truncation.
    // Any model failure (HTTP error, truncation, unparseable reply) falls back to this dispute type's own list (HTTP 200).
    const diag = {};
    const r = await callComplete(apiKey, max => ({ model: MODEL, max_tokens: max, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] }), [2000, 4000]);
    diag.attempts = r.attempts; diag.stop = r.stop; diag.status = r.status;
    let checklist = null;
    if (r.ok) {
      try { checklist = JSON.parse(r.text.replace(/```json|```/g, '').trim()); } catch { diag.parseFailed = true; }
    } else {
      diag.failed = r.truncated ? 'truncated' : 'model-error';
      console.log(JSON.stringify({ evt: 'checklist_model_fail', app: 'hoafight', reason: diag.failed, status: r.status || null }));
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
