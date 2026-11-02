// api/checklist.js
import { MODEL } from './_config.js';
import { verifyLicense, g4tMatches } from './_license.js';

const PRODUCT_LINK = '8TWrB';

export const config = { runtime: 'edge' };


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
    const { accessCode, state, varianceType, letterExcerpt } = await req.json();

    const payhipApiKey = process.env.PAYHIP_API_KEY;
    if (!payhipApiKey) return new Response(JSON.stringify({ error: 'Service not configured' }), { status: 500, headers });
    // Same gate as generate.js: a passed Payhip verification (valid, enabled, this product) or a G4T test code.
    // No usage check/mark here: the checklist is requested after the letter has consumed the code.
    if (!g4tMatches(accessCode, process.env.G4_TEST_CODE_SECRET)) {
      const lic = await verifyLicense(accessCode, PRODUCT_LINK, payhipApiKey);
      if (!lic.ok) return new Response(JSON.stringify({ error: lic.error }), { status: lic.status, headers });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        thinking: { type: 'disabled' },
        messages: [{
          role: 'user',
          content: `Generate a practical submission checklist for a HOA fine appeal / violation dispute as a JSON array of strings. Include items like: send via certified mail, request formal hearing, review CC&Rs for the specific rule, document inconsistent enforcement, request HOA financial records, check state HOA statutes, file with state HOA ombudsman if ignored. Return ONLY a valid JSON array, no other text.

State: ${state}
Situation: ${varianceType || 'HOA fine appeal / violation dispute'}
Letter excerpt: ${letterExcerpt?.substring(0, 200) || ''}`,
        }],
      }),
    });

    // Fail loudly on an API error instead of silently returning an empty
    // checklist (the pre-migration bug: a dead model 404'd and this returned []).
    if (!response.ok) {
      const detail = await response.text();
      return new Response(JSON.stringify({ error: 'Checklist generation failed', detail }), { status: 502, headers });
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === 'text')?.text || '[]';
    const clean = text.replace(/```json|```/g, '').trim();

    let checklist;
    try {
      checklist = JSON.parse(clean);
    } catch {
      checklist = ['Send letter via certified mail with return receipt requested', 'Pull the specific CC&R section the HOA claims you violated — read it carefully', 'Document any neighbors with similar conditions who were NOT fined', 'Request a formal hearing in writing — most state laws require this before fines are final', 'Request copies of board meeting minutes and enforcement records', "Check your state's HOA statute for homeowner rights and board obligations", 'Photograph your property to document compliance or the alleged violation', "File complaint with your state's HOA ombudsman or regulatory agency if ignored", 'Consult an HOA attorney for fines over $500 or pattern of harassment'];
    }

    return new Response(JSON.stringify({ checklist }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
