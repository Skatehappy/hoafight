// tests/payhip-mock.test.js — Payhip license verification and usage-mark behaviour, with fetch fully mocked.
// No network, no real codes, no real keys.   node tests/payhip-mock.test.js
import assert from 'node:assert/strict';
import { verifyLicense, g4tMatches } from '../api/_license.js';
import generate from '../api/generate.js';

process.env.PAYHIP_API_KEY = 'mock-payhip-key';
process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';
delete process.env.G4_TEST_CODE_SECRET;

const realFetch = globalThis.fetch;
const origLog = console.log;
console.log = () => {};
let payhipCalls = [], anthropicCalls = 0, mode = 'good', anthropicMode = 'ok';

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    anthropicCalls++;
    if (anthropicMode === 'fail') return new Response('upstream down', { status: 529 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Dear Board, please respond within 30 days.' }], stop_reason: 'end_turn' }), { status: 200 });
  }
  if (url.startsWith('https://payhip.com/api/v1/license/')) {
    payhipCalls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (url.includes('/verify')) {
      if (mode === 'timeout') return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
      if (mode === 'down') throw new Error('ECONNRESET');
      if (mode === 'html') return new Response('<html>', { status: 200 });
      if (mode === 'notfound') return new Response('{}', { status: 404 });
      if (mode === 'disabled') return new Response(JSON.stringify({ data: { enabled: false, product_link: '8TWrB' } }), { status: 200 });
      if (mode === 'otherproduct') return new Response(JSON.stringify({ data: { enabled: true, product_link: 'ZZZZZ' } }), { status: 200 });
      if (mode === 'nodata') return new Response(JSON.stringify({}), { status: 200 });
      return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB', uses: 3 } }), { status: 200 });
    }
    return new Response('{}', { status: 200 }); // usage mark
  }
  throw new Error('unexpected network call: ' + url);
};

const results = [];
const ok = n => results.push(n);

// verifyLicense: request shape
mode = 'good'; payhipCalls = [];
let r = await verifyLicense('  ABC-123  ', '8TWrB', 'mock-payhip-key');
assert.deepEqual(r, { ok: true });
assert.equal(payhipCalls.length, 1);
assert.ok(payhipCalls[0].url.includes('product_link=8TWrB') && payhipCalls[0].url.includes('license_key=ABC-123'), 'trimmed key and product link in the query');
assert.equal(payhipCalls[0].headers['payhip-api-key'], 'mock-payhip-key', 'Payhip key sent in the payhip-api-key header, only to payhip.com');
assert.ok(payhipCalls[0].url.startsWith('https://payhip.com/'), 'only payhip.com is contacted');
ok('verify request: trimmed key, product link, key header to payhip.com only');

// a license with prior uses still verifies (the client makes several calls per letter)
assert.equal((await verifyLicense('X', '8TWrB', 'k')).ok, true);
ok('uses > 0 still verifies');

// fail-closed matrix
for (const [m, status] of [['notfound', 401], ['disabled', 401], ['otherproduct', 401], ['nodata', 401], ['down', 503], ['html', 503], ['timeout', 503]]) {
  mode = m;
  const t0 = Date.now();
  r = await verifyLicense('CODE', '8TWrB', 'k');
  assert.equal(r.ok, false, m);
  assert.equal(r.status, status, `${m} -> ${status}`);
  if (m === 'timeout') assert.ok(Date.now() - t0 < 12000, 'timeout aborts');
}
assert.equal((await verifyLicense('', '8TWrB', 'k')).status, 401);
assert.equal((await verifyLicense('   ', '8TWrB', 'k')).status, 401);
ok('fail-closed: not found / disabled / other product / no data -> 401; outage / bad JSON / timeout -> 503; empty -> 401');

// G4T helper is inert without a long secret
assert.equal(g4tMatches('G4T-short', 'short'), false);
assert.equal(g4tMatches('G4T-0123456789abcdef', undefined), false);
assert.equal(g4tMatches('G4T-0123456789abcdef', '0123456789abcdef'), true);
assert.equal(g4tMatches('G4T-0123456789abcdeX', '0123456789abcdef'), false);
ok('G4T matcher: inert without 16+ char secret, exact match only');

// generate: success marks usage exactly once; failure does not
async function post(payload) {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: payload }, res);
  return { status, json };
}
const body = { accessCode: 'GOOD', systemPrompt: 'Write a letter.', userPrompt: 'STATE: Florida\nRESPONSE DEADLINE: 30 days', state: 'Florida' };
mode = 'good'; payhipCalls = []; anthropicCalls = 0; anthropicMode = 'ok';
let out = await post(body);
assert.equal(out.status, 200);
const marks = payhipCalls.filter(c => c.method === 'PUT');
assert.equal(marks.length, 1, 'usage marked once');
assert.ok(marks[0].body.includes('product_link=8TWrB') && marks[0].body.includes('license_key=GOOD'));
ok('successful letter marks usage exactly once');

payhipCalls = []; anthropicMode = 'fail';
out = await post(body);
assert.equal(out.status, 502);
assert.equal(payhipCalls.filter(c => c.method === 'PUT').length, 0, 'failed generation does not burn the code');
ok('upstream failure: 502 and the license is NOT marked used');

payhipCalls = []; anthropicCalls = 0; anthropicMode = 'ok'; mode = 'notfound';
out = await post(body);
assert.equal(out.status, 401); assert.equal(anthropicCalls, 0);
mode = 'down';
out = await post(body);
assert.equal(out.status, 503); assert.equal(anthropicCalls, 0);
ok('invalid code -> 401, Payhip outage -> 503, Anthropic never called');

globalThis.fetch = realFetch;
console.log = origLog;
console.log(`payhip-mock test: ${results.length} groups passed\n - ` + results.join('\n - '));
