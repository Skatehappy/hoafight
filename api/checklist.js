// api/checklist.js
export const config = { runtime: 'edge' };

const VALID_CODES = (process.env.ACCESS_CODES || '').split(',').map(c => c.trim()).filter(Boolean);

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

    if (!accessCode || !VALID_CODES.includes(accessCode.toUpperCase())) {
      return new Response(JSON.stringify({ error: 'Invalid access code' }), { status: 401, headers });
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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `Generate a practical submission checklist for a HOA fine appeal / violation dispute as a JSON array of strings. Include items like: send via certified mail, request formal hearing, review CC&Rs for the specific rule, document inconsistent enforcement, request HOA financial records, check state HOA statutes, file with state HOA ombudsman if ignored. Return ONLY a valid JSON array, no other text.

State: ${state}
Situation: ${varianceType || 'HOA fine appeal / violation dispute'}
Letter excerpt: ${letterExcerpt?.substring(0, 200) || ''}`,
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '[]';
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
