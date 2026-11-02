// tests/checklist-lock.test.js — the citation + figure lock on api/checklist.js. Fetch mocked; no keys, no network.
//   node tests/checklist-lock.test.js
import assert from 'node:assert/strict';
import checklist from '../api/checklist.js';
import VERIFIED from '../api/_verified-citations.js';

process.env.PAYHIP_API_KEY = 'mock-payhip-key';
process.env.ANTHROPIC_API_KEY = 'mock-anthropic-key';
delete process.env.G4_TEST_CODE_SECRET;

const realFetch = globalThis.fetch;
const origLog = console.log;
const logs = [];
console.log = (...a) => logs.push(a.join(' '));
let modelItems = [], modelPrompts = [], rawText = null;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.anthropic.com')) {
    modelPrompts.push(JSON.parse(init.body).messages[0].content);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: rawText ?? JSON.stringify(modelItems) }], stop_reason: 'end_turn' }), { status: 200 });
  }
  if (url.includes('/license/verify')) return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 });
  throw new Error('unexpected network call ' + url);
};
async function call(extra = {}) {
  const r = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify({ accessCode: 'GOOD', state: 'Florida', varianceType: 'HOA fine', letterExcerpt: 'x', ...extra }) }));
  return { status: r.status, json: await r.json() };
}
const results = [];
const subs = VERIFIED.states.FL.subs['S:720.305'];
assert.ok(subs.includes('(2)') && !subs.includes('(9)'));

// 1. unverified statute, unverified subsection, invented figures are dropped; verified items kept
modelPrompts = []; rawText = null;
modelItems = [
  'Send the letter by certified mail with return receipt',
  'Cite Fla. Stat. § 720.305(2) when you request a hearing',
  'Cite Fla. Stat. § 999.999 in your cover note',
  'Quote Fla. Stat. § 720.305(9) to the board',
  'The board must answer within 45 days or pay $7,777',
  'Photograph the property',
  'Request meeting minutes and enforcement records',
];
let r = await call();
assert.equal(r.status, 200);
const cl = r.json.checklist;
assert.ok(cl.includes('Cite Fla. Stat. § 720.305(2) when you request a hearing'), 'verified section + subsection kept');
assert.ok(!cl.some(x => x.includes('999.999')), 'unverified statute dropped');
assert.ok(!cl.some(x => x.includes('720.305(9)')), 'unverified subsection dropped');
assert.ok(!cl.some(x => /7,777|45 days/.test(x)), 'invented figures dropped');
assert.equal(cl.length, 4);
assert.ok(modelPrompts[0].includes('CITATION RULE') && modelPrompts[0].includes('FIGURE RULE'), 'model prompt carries both rules');
assert.ok(logs.some(l => l.includes('"evt":"citelint"') && l.includes('hoafight-checklist') && l.includes('999.999')), 'hit logged with citation strings only');
results.push('checklist: fake statute, fake subsection and invented figures removed; verified items kept; hit logged');

// 2. too few survivors -> safe static list (itself free of citations and figures)
modelItems = ['See Fla. Stat. § 999.999', 'Pay $9,999 now', 'Wait 77 days', 'Good item'];
r = await call();
assert.ok(r.json.checklist.length >= 3 && !r.json.checklist.some(x => /999|77 days/.test(x)));
results.push('checklist: fewer than 3 clean items falls back to the static list');

// 3. unparseable output -> static list
rawText = 'not json at all';
r = await call();
assert.equal(r.status, 200); assert.ok(r.json.checklist.length >= 3);
results.push('checklist: unparseable model output falls back to the static list');

// 4. the static fallback itself passes the lock
rawText = 'not json'; modelItems = [];
r = await call();
const { lintText } = await import('../api/_lock.js');
for (const item of r.json.checklist) { const p = lintText(item, 'FL'); assert.equal(p.cites.length + p.figs.length, 0, 'fallback item violates the lock: ' + item); }
results.push('checklist: static fallback list contains no unverified citation or figure');

// 5. no code -> 401 and no model call
modelPrompts = [];
const noCode = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify({ state: 'Florida' }) }));
assert.equal(noCode.status, 401); assert.equal(modelPrompts.length, 0);
results.push('checklist: missing code -> 401, no model call');

globalThis.fetch = realFetch;
console.log = origLog;
console.log(`checklist-lock test: ${results.length} groups passed\n - ` + results.join('\n - '));
