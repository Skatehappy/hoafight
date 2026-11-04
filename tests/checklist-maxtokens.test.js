// Checklist + generate: truncation handling and per-dispute-type content (mocked Anthropic; no network).
//  - stop_reason "max_tokens" is never parsed: retried once with a higher limit, then fallback (checklist) / 502 (generate)
//  - every dispute type gets its model items on success and its own fallback on forced failure
//  - fallback items carry no digits, no citations, no figures, no wording from another dispute type
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYHIP_API_KEY = 'x'; process.env.ANTHROPIC_API_KEY = 'x'; delete process.env.G4_TEST_CODE_SECRET;
const CODE = 'LD-MOCK-0001';
const { default: checklist } = await import('../api/checklist.js');
const { default: generate } = await import('../api/generate.js');
const { TYPES, fallbackFor } = await import('../api/_checklist-fallbacks.js');
const { lintText } = await import('../api/_lock.js');
const VERIFIED = (await import('../api/_verified-citations.js')).default;

const TYPE_NAMES = Object.keys(TYPES);
const UI_TYPES = ['Wrongful Fine', 'Architectural Denial', 'Inconsistent Enforcement', 'Records Denied', 'Special Assessment Dispute', 'Election Irregularity', 'Failure to Maintain Common Areas', 'Board Harassment / Targeted Enforcement', 'HOA Fee / Dues Dispute', 'Other'];
const realFetch = globalThis.fetch;
const realLog = console.log;
let calls, usage = 0;
function mockModel(replies) {
  calls = []; usage = 0;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/license/verify')) return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 });
    if (u.includes('/license/usage')) { usage++; return new Response('{}', { status: 200 }); }
    assert.ok(u.includes('api.anthropic.com'), 'unexpected fetch: ' + u);
    const body = JSON.parse(init.body); calls.push(body);
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r.http) return new Response('boom', { status: r.http });
    return new Response(JSON.stringify({ stop_reason: r.stop || 'end_turn', content: [{ type: 'text', text: r.text }] }), { status: 200 });
  };
}
test.beforeEach(() => { console.log = () => {}; });
test.afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; });

const callChecklist = async (issueType, state = 'Georgia') => {
  const res = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify({ accessCode: CODE, state, issueType, letterExcerpt: 'excerpt' }) }));
  return { status: res.status, ...(await res.json()) };
};
const modelItems = type => Array.from({ length: 8 }, (_, i) => `Model step ${i + 1} for ${type}: keep dated records and send copies by certified mail`);
const callGenerate = async () => {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: { accessCode: CODE, systemPrompt: 'sys', userPrompt: 'STATE: Georgia\nwrite', state: 'Georgia', disputeType: 'Wrongful Fine' } }, res);
  return { status, json };
};

test('the dispute types covered match the UI list', () => {
  assert.deepEqual([...TYPE_NAMES].sort(), [...UI_TYPES].sort());
});

for (const type of TYPE_NAMES) {
  test(`checklist [${type}]: model items returned; HTTP 500 -> its own fallback`, async () => {
    const items = modelItems(type);
    mockModel([{ text: JSON.stringify(items) }]);
    let r = await callChecklist(type);
    assert.equal(r.status, 200); assert.deepEqual(r.checklist, items);
    assert.equal(calls.length, 1); assert.equal(calls[0].max_tokens, 2000);
    assert.ok(calls[0].messages[0].content.includes(TYPES[type].focus), 'prompt built from the type focus');
    mockModel([{ http: 500 }]);
    r = await callChecklist(type);
    assert.equal(r.status, 200); assert.deepEqual(r.checklist, fallbackFor(type));
    assert.equal(r._diag, undefined, 'no _diag for a real buyer');
  });
}

test('fallbacks: no digits, no citations in any state, no figures, no cross-type wording', () => {
  const states = Object.keys(VERIFIED.states).filter(s => !s.startsWith('_'));
  const other = /tenant|landlord|deposit|lease\b|rent\b/i;
  // wording distinctive to one dispute type must not appear in another type's own steps
  const own = { 'Records Denied': /\binspect\b|records request/i, 'Election Irregularity': /ballot|election|proxy/i, 'Special Assessment Dispute': /assessment/i, 'Architectural Denial': /architectural|committee/i, 'HOA Fee / Dues Dispute': /ledger|late fees/i, 'Failure to Maintain Common Areas': /common area/i };
  for (const type of TYPE_NAMES) {
    for (const item of fallbackFor(type)) {
      assert.ok(!/\d/.test(item), `digit in ${type}: ${item}`);
      assert.ok(!other.test(item), `non-HOA wording in ${type}: ${item}`);
      for (const st of states) { const p = lintText(item, st, ''); assert.equal(p.cites.length + p.figs.length, 0, `${type}/${st}: ${item}`); }
    }
    for (const [t2, re] of Object.entries(own)) if (t2 !== type) for (const s of TYPES[type].steps) assert.ok(!re.test(s), `${t2} wording in ${type}: ${s}`);
    assert.ok(TYPES[type].steps.length >= 4 && TYPES[type].steps.length <= 6);
  }
});

test('unknown / missing type -> neutral list', async () => {
  mockModel([{ http: 500 }]);
  for (const t of [undefined, '', 'Something Else']) { const r = await callChecklist(t); assert.deepEqual(r.checklist, fallbackFor(t)); assert.ok(r.checklist.length >= 6); }
});

test('checklist: truncated once -> retried with a higher limit, partial never used', async () => {
  const items = modelItems('x');
  mockModel([{ stop: 'max_tokens', text: '["Partial item one", "Partial it' }, { text: JSON.stringify(items) }]);
  const r = await callChecklist('Wrongful Fine');
  assert.deepEqual(r.checklist, items);
  assert.equal(calls.length, 2); assert.ok(calls[1].max_tokens > calls[0].max_tokens);
});

test('checklist: truncated twice -> per-type fallback, a parseable partial is never used', async () => {
  mockModel([{ stop: 'max_tokens', text: JSON.stringify(['Partial A', 'Partial B', 'Partial C', 'Partial D']) }]);
  const r = await callChecklist('Records Denied');
  assert.equal(r.status, 200); assert.deepEqual(r.checklist, fallbackFor('Records Denied'));
  assert.ok(!r.checklist.some(x => x.startsWith('Partial')));
  assert.equal(calls.length, 2);
});

test('checklist: unparseable or fewer than 3 survivors -> fallback, still HTTP 200', async () => {
  mockModel([{ text: 'not json at all' }]);
  assert.deepEqual((await callChecklist('Election Irregularity')).checklist, fallbackFor('Election Irregularity'));
  mockModel([{ text: JSON.stringify(['Cite Fla. Stat. § 999.999', 'Pay $9,999 now', 'Wait 77 days', 'One good item']) }]);
  assert.deepEqual((await callChecklist('Wrongful Fine', 'Florida')).checklist, fallbackFor('Wrongful Fine'));
});

test('citation/figure lock keeps type-appropriate items (CC&R sections, dates)', async () => {
  const items = ['Pull CC&R Article IV, Section 3.2 and read it closely', 'Photograph the property on March 10, 2026', 'Request the board minutes from the last two meetings', 'Ask the board in writing for the evidence behind the fine'];
  mockModel([{ text: JSON.stringify(items) }]);
  const r = await callChecklist('Wrongful Fine', 'Florida');
  assert.deepEqual(r.checklist, items);
});

test('generate: truncated once -> retried and the full letter returned, code marked used', async () => {
  mockModel([{ stop: 'max_tokens', text: 'Dear Board, partial lett' }, { text: 'Dear Board, the full letter.' }]);
  const r = await callGenerate();
  assert.equal(r.status, 200); assert.equal(r.json.text, 'Dear Board, the full letter.');
  assert.equal(calls.length, 2); assert.ok(calls[1].max_tokens > calls[0].max_tokens); assert.equal(usage, 1);
});

test('generate: truncated twice -> 502, partial never returned, license NOT marked used', async () => {
  mockModel([{ stop: 'max_tokens', text: 'Dear Board, partial lett' }]);
  const r = await callGenerate();
  assert.equal(r.status, 502); assert.ok(!JSON.stringify(r.json).includes('partial'));
  assert.equal(r.json.text, undefined); assert.equal(usage, 0); assert.equal(calls.length, 2);
});
