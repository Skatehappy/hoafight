// scripts/test-citelint.mjs — mock test for the citation lock (Section 7) and the Gate 4 test-code path (Section 6).
// No network, no real license codes, no real Anthropic calls: global fetch is stubbed.
//   node scripts/test-citelint.mjs
import assert from 'node:assert/strict';
import handler from '../api/generate.js';
import { extractCitations, findUnverified, stripSentences } from '../api/_citelint.js';
import VERIFIED from '../api/_verified-citations.js';

process.env.PAYHIP_API_KEY = 'test-payhip-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
delete process.env.G4_TEST_CODE_SECRET;

const real = globalThis.fetch;
let anthropicQueue = [];
let calls = { anthropic: [], payhipVerify: 0, payhipUse: 0 };
const logs = [];
const origLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    const body = JSON.parse(init.body);
    calls.anthropic.push(body);
    const text = anthropicQueue.shift() ?? 'Default letter.';
    return new Response(JSON.stringify({ content: [{ text }], stop_reason: 'end_turn' }), { status: 200 });
  }
  if (url.includes('payhip.com/api/v1/license/verify')) {
    calls.payhipVerify++;
    return new Response(JSON.stringify(url.includes('GOODCODE') ? { data: { uses: 0 } } : {}), { status: url.includes('GOODCODE') ? 200 : 404 });
  }
  if (url.includes('payhip.com/api/v1/license/usage')) { calls.payhipUse++; return new Response('{}', { status: 200 }); }
  throw new Error('unexpected network call in test: ' + url);
};

function reset(queue) { anthropicQueue = queue; calls = { anthropic: [], payhipVerify: 0, payhipUse: 0 }; logs.length = 0; }
async function post(payload) {
  const res = await handler(new Request('https://x.test/api/generate', { method: 'POST', body: JSON.stringify(payload) }));
  return { status: res.status, json: await res.json() };
}
const base = { accessCode: 'GOODCODE', systemPrompt: 'You write letters.', userPrompt: 'STATE: Florida\nDISPUTE TYPE: Wrongful Fine\nCC&R SECTION: Article IV, Section 3.2', state: 'Florida', disputeType: 'Wrongful Fine' };
const FAKE = 'Under Fla. Stat. § 999.999, the board must refund every fine.';
const REAL = 'Fla. Stat. § 720.305 allows the prevailing party to recover reasonable attorney fees and costs.';
const results = [];
const ok = name => results.push(name);

// 0. unit: extraction, range expansion, stripping
assert.ok(extractCitations('See § 720.303(5) and Smith v. Jones.').length >= 2);
assert.ok(VERIFIED.states.FL.keys.includes('S:720.305'), 'FL set carries § 720.305');
assert.equal(findUnverified('Article IV, Section 3.2 of the CC&Rs applies.', new Set()).length, 0, 'governing-document sections are not flagged');
assert.ok(stripSentences(`Intro sentence. ${FAKE} Closing sentence.`, findUnverified(FAKE, new Set())).includes('Closing sentence.'));
ok('unit: extraction / CC&R exemption / stripping');

// 1. a forced fake citation survives regeneration -> sentence stripped, verified sentence kept, license marked used once
reset([`Dear Board,\n\n${REAL} ${FAKE} Please respond within 30 days.`, `Dear Board,\n\n${REAL} ${FAKE} Please respond within 30 days.`]);
let r = await post(base);
assert.equal(r.status, 200);
assert.ok(!r.json.text.includes('999.999'), 'fake citation removed');
assert.ok(r.json.text.includes('720.305') && r.json.text.includes('Please respond within 30 days.'), 'verified citation and other sentences kept');
assert.equal(calls.anthropic.length, 2, 'regenerated exactly once');
assert.ok(calls.anthropic[0].system.includes('CITATION RULE') && calls.anthropic[0].system.includes('720.305'), 'verified list is in the system prompt');
assert.ok(calls.anthropic[1].system.includes('REGENERATION NOTICE') && calls.anthropic[1].system.includes('999.999'), 'regeneration names the bad cite');
assert.equal(calls.payhipVerify, 1);
assert.equal(calls.payhipUse, 1);
const hit = logs.find(l => l.includes('"evt":"citelint"'));
assert.ok(hit && hit.includes('999.999') && !hit.includes('Dear Board') && !hit.includes('Please respond'), 'log carries citation strings only');
ok('forced fake statute: regenerated once, then stripped');

// 2. regeneration comes back clean -> second draft returned
reset([`Dear Board,\n\n${FAKE}`, `Dear Board,\n\n${REAL}`]);
r = await post(base);
assert.ok(!r.json.text.includes('999.999') && r.json.text.includes('720.305'));
assert.equal(calls.anthropic.length, 2);
ok('forced fake statute: clean regeneration used');

// 3. fake case name is removed
reset(['Dear Board,\n\nSee Smithson v. Jonesboro Homeowners, 12 So. 3d 456 (Fla. 2011). ' + REAL, 'Dear Board,\n\nSee Smithson v. Jonesboro Homeowners, 12 So. 3d 456 (Fla. 2011). ' + REAL]);
r = await post(base);
assert.ok(!/Smithson/.test(r.json.text) && r.json.text.includes('720.305'));
ok('forced fake case: removed');

// 4. clean draft is untouched and costs one call
reset([`Dear Board,\n\n${REAL} See Article IV, Section 3.2 of the CC&Rs.`]);
r = await post(base);
assert.equal(calls.anthropic.length, 1);
assert.ok(r.json.text.includes('Section 3.2'));
ok('clean draft: one call, untouched');

// 5. check call: no lock, no lint, no usage mark
reset(['VALID']);
r = await post({ accessCode: 'ANYTHING', systemPrompt: 'Reply: VALID', userPrompt: 'check' });
assert.equal(r.status, 200);
assert.ok(!(calls.anthropic[0].system || '').includes('CITATION RULE'));
assert.equal(calls.payhipUse, 0);
ok('check call unaffected');

// 6. G4T path: inert without the env var
reset(['Dear Board,\n\n' + REAL]);
r = await post({ ...base, accessCode: 'G4T-0123456789abcdef' });
assert.equal(r.status, 401, 'G4T code is rejected when G4_TEST_CODE_SECRET is unset');
assert.equal(calls.anthropic.length, 0);
ok('G4T inert when env var unset');

// 7. G4T path: enabled
process.env.G4_TEST_CODE_SECRET = '0123456789abcdef';
globalThis.__g4tState = { day: '', used: 0 };
reset(Array(12).fill('Dear Board,\n\n' + REAL));
for (let i = 1; i <= 10; i++) { r = await post({ ...base, accessCode: 'G4T-0123456789abcdef' }); assert.equal(r.status, 200, 'G4T use ' + i); }
r = await post({ ...base, accessCode: 'G4T-0123456789abcdef' });
assert.equal(r.status, 429, '11th G4T use is capped');
assert.equal(calls.payhipVerify, 0, 'G4T never calls Payhip verify');
assert.equal(calls.payhipUse, 0, 'G4T never marks usage');
assert.equal(logs.filter(l => l.includes('"evt":"g4t_use"')).length, 10, 'each G4T use is logged');
assert.ok(!logs.some(l => l.includes('0123456789abcdef')), 'secret never logged');
r = await post({ ...base, accessCode: 'G4T-wrongwrongwrong00' });
assert.equal(r.status, 401, 'wrong G4T secret falls through to Payhip and fails');
ok('G4T enabled: skips Payhip, capped at 10/day, logged');

delete process.env.G4_TEST_CODE_SECRET;
globalThis.fetch = real;
console.log = origLog;
console.log(`citelint mock test: ${results.length} checks passed\n - ` + results.join('\n - '));
