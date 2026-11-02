// tests/isCheckCall.test.js — the access-code check path of api/generate.js.
// A check call must (a) require a verified license first, (b) never reach Anthropic, (c) never mark usage,
// and (d) be triggered ONLY by the exact client string. Fetch is mocked.   node tests/isCheckCall.test.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import generate from '../api/generate.js';

process.env.PAYHIP_API_KEY = 'mock-payhip-key';
process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';
delete process.env.G4_TEST_CODE_SECRET;

const realFetch = globalThis.fetch;
const origLog = console.log;
console.log = () => {};
let anthropic = 0, marks = 0, licenseGood = true;
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) { anthropic++; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Dear Board.' }], stop_reason: 'end_turn' }), { status: 200 }); }
  if (url.includes('/license/usage')) { marks++; return new Response('{}', { status: 200 }); }
  if (url.includes('/license/verify')) return licenseGood ? new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 }) : new Response('{}', { status: 404 });
  throw new Error('unexpected network call ' + url);
};
async function post(payload) {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: payload }, res);
  return { status, json };
}
const reset = () => { anthropic = 0; marks = 0; };
const results = [];

// 1. the client's exact check string, valid license: VALID, no model call, no usage mark, repeatable
reset(); licenseGood = true;
for (let i = 0; i < 3; i++) { const r = await post({ accessCode: 'GOOD', systemPrompt: 'Reply: VALID', userPrompt: 'check' }); assert.equal(r.status, 200); assert.equal(r.json.text, 'VALID'); }
assert.equal(anthropic, 0); assert.equal(marks, 0);
results.push('check call with a valid license: VALID x3, no model call, no usage mark');

// 2. invalid license: a check call is still refused
reset(); licenseGood = false;
let r = await post({ accessCode: 'NOPE', systemPrompt: 'Reply: VALID', userPrompt: 'check' });
assert.equal(r.status, 401); assert.equal(anthropic, 0);
results.push('check call with an invalid license: 401');

// 3. near-miss strings are NOT check calls: they go through the full path (and, with a bad license, are refused)
for (const sp of ['Reply: valid', 'Respond with only: VALID', 'Reply: VALID ', 'reply: VALID']) {
  reset(); licenseGood = false;
  r = await post({ accessCode: 'NOPE', systemPrompt: sp, userPrompt: 'check' });
  assert.equal(r.status, 401, sp); assert.equal(anthropic, 0, sp);
}
results.push('near-miss check strings are never treated as a check call');

// 4. near-miss with a valid license runs the real path (model call + usage mark), proving the check path is not a bypass
reset(); licenseGood = true;
r = await post({ accessCode: 'GOOD', systemPrompt: 'Respond with only: VALID', userPrompt: 'STATE: Florida\ncheck', state: 'Florida' });
assert.equal(r.status, 200); assert.ok(anthropic >= 1); assert.equal(marks, 1);
results.push('near-miss string with a valid license follows the full generation path');

// 5. the client sends exactly the string the server matches
const client = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const m = /systemPrompt: "([^"]*VALID[^"]*)"/.exec(client);
assert.ok(m, 'client sends a check string');
assert.equal(m[1], 'Reply: VALID', 'client check string equals the server string');
const server = readFileSync(new URL('../api/generate.js', import.meta.url), 'utf8');
assert.ok(server.includes("systemPrompt === 'Reply: VALID'"), 'server matches the exact string');
results.push('client and server agree on the exact check string');

// 6. no accessCode: 401 before any network call
reset();
r = await post({ systemPrompt: 'Reply: VALID', userPrompt: 'check' });
assert.equal(r.status, 401); assert.equal(anthropic, 0);
results.push('missing code: 401');

globalThis.fetch = realFetch;
console.log = origLog;
console.log(`isCheckCall test: ${results.length} groups passed\n - ` + results.join('\n - '));
