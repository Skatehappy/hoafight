// scripts/test-license-gate.mjs — gate A12: api/generate.js and api/checklist.js must never reach
// api.anthropic.com without a passed Payhip verification (or a G4T test code), and must hold no bypass keys.
// No network: global fetch is stubbed. Run: node scripts/test-license-gate.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import generate from '../api/generate.js';
import checklist from '../api/checklist.js';

process.env.PAYHIP_API_KEY = 'test-payhip-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.G4_TEST_CODE_SECRET;

// ── static: no bypass keys / env-list bypasses in any api file ──
for (const f of ['api/generate.js', 'api/checklist.js', 'api/_license.js']) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  for (const bad of [/SMOKE-TEST/i, /TEST_KEYS/, /ACCESS_CODES/, /BAO\b/]) assert.ok(!bad.test(src), `${f} contains bypass pattern ${bad}`);
}

const realFetch = globalThis.fetch;
let anthropic = 0, usageMarks = 0, verifyMode = 'good';
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) { anthropic++; return new Response(JSON.stringify({ content: [{ type: 'text', text: '["a"]' }], stop_reason: 'end_turn' }), { status: 200 }); }
  if (url.includes('payhip.com/api/v1/license/usage')) { usageMarks++; return new Response('{}', { status: 200 }); }
  if (url.includes('payhip.com/api/v1/license/verify')) {
    if (verifyMode === 'down') throw new Error('network down');
    if (verifyMode === 'nonok') return new Response('{}', { status: 500 });
    if (verifyMode === 'disabled') return new Response(JSON.stringify({ data: { enabled: false, product_link: '8TWrB' } }), { status: 200 });
    if (verifyMode === 'wrongproduct') return new Response(JSON.stringify({ data: { enabled: true, product_link: 'OTHER' } }), { status: 200 });
    if (verifyMode === 'notfound') return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB', uses: 1 } }), { status: 200 });
  }
  throw new Error('unexpected network call: ' + url);
};

async function callGenerate(payload) {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: payload }, res);
  return { status, json };
}
async function callChecklist(payload) {
  const r = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify(payload) }));
  return { status: r.status, json: await r.json().catch(() => null) };
}

const gen = { systemPrompt: 'x', userPrompt: 'STATE: Florida' };
const chk = { state: 'Florida', letterExcerpt: 'x' };
const denied = [
  ['no code', 'good', ''], ['fake code (not found)', 'notfound', 'FAKE-1234'], ['disabled license', 'disabled', 'DIS'],
  ['wrong product', 'wrongproduct', 'WP'], ['Payhip non-ok', 'nonok', 'ANY'], ['Payhip down', 'down', 'ANY'],
  ['old bypass key', 'notfound', 'SMOKE-TEST-2026-BAO'],
];
for (const [name, mode, code] of denied) {
  verifyMode = mode;
  for (const [label, fn, base] of [['generate', callGenerate, gen], ['checklist', callChecklist, chk]]) {
    anthropic = 0; usageMarks = 0;
    const r = await fn({ ...base, accessCode: code });
    assert.equal(anthropic, 0, `${label}/${name}: reached Anthropic`);
    assert.ok([401, 503].includes(r.status), `${label}/${name}: status ${r.status}`);
  }
}
// Access-code check with a good license: no model call, no usage mark, repeatable.
verifyMode = 'good'; anthropic = 0; usageMarks = 0;
for (let i = 0; i < 3; i++) {
  const r = await callGenerate({ accessCode: 'GOOD', systemPrompt: 'Reply: VALID', userPrompt: 'check' });
  assert.equal(r.status, 200); assert.equal(r.json.text, 'VALID');
}
assert.equal(anthropic, 0, 'access check ran a model call');
assert.equal(usageMarks, 0, 'access check marked usage');
// A passed verification does reach Anthropic from checklist, with no usage mark.
const ok = await callChecklist({ ...chk, accessCode: 'GOOD' });
assert.equal(ok.status, 200); assert.equal(anthropic, 1); assert.equal(usageMarks, 0);
globalThis.fetch = realFetch;
console.log('A12 license gate: ' + (denied.length * 2) + ' denial cases + check-path + checklist pass OK');
