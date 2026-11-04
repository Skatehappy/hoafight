// Refusal handling, neutral checklist framing, and per-request time budgets (mocked Anthropic; no network, no real waiting).
//  - stop_reason "refusal" is a model failure: never parsed as a list, never returned as a letter, code not burned
//  - every dispute type's checklist prompt carries the neutral framing and none of the phrasing that triggered live refusals
//  - the G4T-only _diag carries the request preview + stop details; real buyers never see _diag
//  - a fake clock + slow mocked fetch proves no generate path exceeds 50s and no checklist path exceeds 20s
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SECRET = 'TESTSECRETTESTSECRET1234';
process.env.PAYHIP_API_KEY = 'x'; process.env.ANTHROPIC_API_KEY = 'x'; process.env.G4_TEST_CODE_SECRET = SECRET;
const BUYER = 'LD-MOCK-0001', G4T = 'G4T-' + SECRET;
const { default: checklist } = await import('../api/checklist.js');
const { default: generate } = await import('../api/generate.js');
const { TYPES, fallbackFor } = await import('../api/_checklist-fallbacks.js');
const { buildChecklistPrompt, NEUTRAL_FRAMING } = await import('../api/_checklist-prompt.js');

const realFetch = globalThis.fetch, realLog = console.log, realNow = Date.now, realTimeout = AbortSignal.timeout;
let calls = [], usage = 0, clock = 0, timeouts = [];
const refusalDetails = { type: 'refusal', category: 'cyber', explanation: 'blocked' };

// replies: [{ text, stop, http, ms }]; ms = how long (fake clock) the model call takes; a call longer than its abort timeout is aborted.
function mockModel(replies) {
  calls = []; usage = 0; timeouts = []; clock = 1e12;
  Date.now = () => clock;
  AbortSignal.timeout = ms => { timeouts.push(ms); return realTimeout.call(AbortSignal, 1e9); };
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/license/verify')) return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 });
    if (u.includes('/license/usage')) { usage++; return new Response('{}', { status: 200 }); }
    assert.ok(u.includes('api.anthropic.com'), 'unexpected fetch: ' + u);
    calls.push(JSON.parse(init.body));
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    const limit = timeouts.length ? timeouts[timeouts.length - 1] : Infinity;
    const ms = r.ms || 1000;
    if (ms > limit) { clock += limit; const e = new Error('aborted'); e.name = 'TimeoutError'; throw e; }
    clock += ms;
    if (r.http) return new Response('boom', { status: r.http });
    const body = { stop_reason: r.stop || 'end_turn', content: [{ type: 'text', text: r.text }] };
    if (r.stop === 'refusal') body.stop_details = refusalDetails;
    return new Response(JSON.stringify(body), { status: 200 });
  };
}
test.beforeEach(() => { console.log = () => {}; });
test.afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; Date.now = realNow; AbortSignal.timeout = realTimeout; });

const callChecklist = async (issueType, code = BUYER, state = 'Florida') => {
  const res = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify({ accessCode: code, state, issueType, letterExcerpt: 'excerpt' }) }));
  return { status: res.status, ...(await res.json()) };
};
const callGenerate = async (extra = {}) => {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: { accessCode: BUYER, systemPrompt: 'sys', userPrompt: 'STATE: Florida\nFINE AMOUNT: $150\nwrite', state: 'Florida', disputeType: 'Wrongful Fine', ...extra } }, res);
  return { status, json };
};
const goodList = Array.from({ length: 9 }, (_, i) => `Model step ${i + 1}: keep dated records and a copy of everything you send`);

// ---- refusal ----------------------------------------------------------------------------------------------------------
test('checklist: stop_reason refusal -> per-type fallback, a parseable list in the refused reply is never used', async () => {
  for (const type of Object.keys(TYPES)) {
    mockModel([{ stop: 'refusal', text: JSON.stringify(goodList) }]);
    const r = await callChecklist(type);
    assert.equal(r.status, 200);
    assert.deepEqual(r.checklist, fallbackFor(type));
    assert.ok(!r.checklist.some(x => x.startsWith('Model step')));
    assert.equal(calls.length, 1, 'a refusal is not retried with a bigger limit');
    assert.equal(r._diag, undefined);
  }
});

test('checklist: G4T _diag carries the request preview and the stop details; refusal is labelled', async () => {
  mockModel([{ stop: 'refusal', text: '[]' }]);
  const r = await callChecklist('Wrongful Fine', G4T);
  const d = r._diag;
  assert.equal(d.stop, 'refusal'); assert.equal(d.failed, 'refusal'); assert.equal(d.usedFallback, true);
  assert.deepEqual(d.stopDetails, refusalDetails);
  assert.equal(d.request.model.length > 0, true); assert.equal(d.request.max_tokens, 2000);
  assert.equal(d.request.state, 'Florida'); assert.equal(d.request.issueType, 'Wrongful Fine');
  assert.ok(d.request.user.length > 0 && d.request.user.length <= 600 && d.request.userLen > 0);
  assert.ok(!JSON.stringify(d).includes('x-api-key') && !JSON.stringify(d).includes(SECRET));
  mockModel([{ text: JSON.stringify(goodList) }]);
  const ok = await callChecklist('Wrongful Fine', G4T);
  assert.equal(ok._diag.attempts, 1); assert.equal(ok._diag.stop, 'end_turn'); assert.equal(ok._diag.survivors, 9); assert.ok(!ok._diag.usedFallback);
});

test('checklist: the refusal log line carries the request preview and stop info only (no key, no code)', async () => {
  mockModel([{ stop: 'refusal', text: '[]' }]);
  const lines = []; console.log = s => lines.push(String(s));
  await callChecklist('Records Denied');
  const hit = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).find(j => j && j.evt === 'checklist_model_fail');
  assert.ok(hit); assert.equal(hit.reason, 'refusal'); assert.deepEqual(hit.stopDetails, refusalDetails);
  assert.equal(hit.request.issueType, 'Records Denied'); assert.ok(hit.request.user.includes('responding to'));
  assert.ok(!lines.join('\n').includes(BUYER));
});

test('generate: stop_reason refusal -> 502, no text returned, licence not burned', async () => {
  mockModel([{ stop: 'refusal', text: 'Dear Board, here is a full letter anyway.' }]);
  const r = await callGenerate();
  assert.equal(r.status, 502); assert.equal(r.json.code, 'refusal'); assert.equal(r.json.text, undefined);
  assert.ok(!JSON.stringify(r.json).includes('Dear Board')); assert.equal(usage, 0); assert.equal(calls.length, 1);
});

// ---- neutral framing -------------------------------------------------------------------------------------------------------
test('checklist prompt: every dispute type carries the neutral framing and none of the phrasing that triggered live refusals', () => {
  for (const type of Object.keys(TYPES)) {
    for (const [st, abbr] of [['Florida', 'FL'], ['Georgia', 'GA']]) {
      const { user } = buildChecklistPrompt(st, type, 'Dear Board, I dispute the fine.', abbr);
      assert.ok(user.includes(NEUTRAL_FRAMING), type);
      assert.ok(user.includes(TYPES[type].focus), type);
      assert.ok(user.includes('CITATION RULE') && user.includes('FIGURE RULE'), 'citation lock block kept: ' + type);
      assert.ok(!/sending a letter to their HOA/i.test(user), type);
      assert.ok(!/harass|retaliat|intimidat|threat|sue\b|lawsuit|attack|exploit|bypass|hack/i.test(user.slice(0, user.indexOf('CITATION RULE'))), 'no adversarial wording: ' + type);
      assert.ok(/mailing the response by certified mail with return receipt and keeping a copy/.test(user));
    }
  }
});

// ---- time budgets ----------------------------------------------------------------------------------------------------------
const longLetter = 'Dear Board, I dispute the fine for my trash can.\n\nPlease rescind it.';
const badLetter = 'Dear Board, you must answer within 77 days or pay $9,999. Please rescind the fine.\n\nSincerely, Alex';

test('generate budget: every path (truncation retry, lint regeneration, timeouts) finishes within 50s of fake time', async () => {
  const stops = [undefined, 'max_tokens'];
  let paths = 0;
  for (const d1 of [2000, 12000, 19000, 21000, 24000, 30000, 45000, 49000, 60000, 90000]) {
    for (const s1 of stops) for (const t1 of [longLetter, badLetter]) for (const d2 of [3000, 25000, 40000, 80000]) {
      mockModel([{ text: t1, stop: s1, ms: d1 }, { text: s1 ? longLetter : longLetter, ms: d2 }, { text: longLetter, ms: d2 }]);
      const start = clock;
      const r = await callGenerate();
      const elapsed = clock - start;
      assert.ok(elapsed <= 50000, `elapsed ${elapsed} (d1 ${d1}, stop ${s1}, d2 ${d2})`);
      assert.ok(calls.length <= 3, 'at most 3 model calls');
      assert.ok(r.status === 200 || r.status === 502 || r.status === 504, 'status ' + r.status);
      if (r.status === 200) { assert.ok(!/77 days|9,999/.test(r.json.text), 'unverified figures never returned'); assert.equal(usage, 1); } else assert.equal(usage, 0);
      for (const t of timeouts) assert.ok(t <= 50000, 'abort timeout within the budget');
      paths++;
    }
  }
  assert.ok(paths >= 150);
});

test('generate budget: slow first call skips regeneration and strips the unverified sentences instead', async () => {
  mockModel([{ text: badLetter, ms: 26000 }, { text: longLetter, ms: 1000 }]);
  const r = await callGenerate();
  assert.equal(r.status, 200); assert.equal(calls.length, 1, 'no regeneration with under 30s left');
  assert.ok(!/77 days|9,999/.test(r.json.text)); assert.ok(r.json.text.includes('Please rescind'));
});

test('generate budget: fast first call still gets the regeneration pass', async () => {
  mockModel([{ text: badLetter, ms: 8000 }, { text: longLetter, ms: 8000 }]);
  const r = await callGenerate();
  assert.equal(r.status, 200); assert.equal(calls.length, 2); assert.equal(r.json.text, longLetter);
});

test('generate budget: truncated with under 30s left -> 502 without a second call; truncated early -> retried', async () => {
  mockModel([{ text: 'cut', stop: 'max_tokens', ms: 25000 }, { text: longLetter }]);
  let r = await callGenerate();
  assert.equal(r.status, 502); assert.equal(calls.length, 1);
  mockModel([{ text: 'cut', stop: 'max_tokens', ms: 10000 }, { text: longLetter, ms: 20000 }]);
  r = await callGenerate();
  assert.equal(r.status, 200); assert.equal(calls.length, 2);
});

test('generate budget: a model call that never returns is aborted at the deadline -> 504, licence not burned', async () => {
  mockModel([{ text: longLetter, ms: 600000 }]);
  const start = clock;
  const r = await callGenerate();
  assert.equal(r.status, 504); assert.equal(r.json.code, 'timeout'); assert.equal(usage, 0);
  assert.ok(clock - start <= 50000);
});

test('checklist budget: every path finishes within 20s of fake time and falls back instead of waiting', async () => {
  for (const d1 of [1000, 6000, 9000, 11000, 15000, 19000, 25000, 90000]) for (const s1 of [undefined, 'max_tokens', 'refusal']) for (const d2 of [2000, 8000, 30000]) {
    mockModel([{ text: JSON.stringify(goodList), stop: s1, ms: d1 }, { text: JSON.stringify(goodList), ms: d2 }]);
    const start = clock;
    const r = await callChecklist('Wrongful Fine');
    assert.ok(clock - start <= 20000, `elapsed ${clock - start} (d1 ${d1}, ${s1}, d2 ${d2})`);
    assert.equal(r.status, 200); assert.ok(r.checklist.length >= 3);
    assert.ok(calls.length <= 2);
    if (s1 === 'refusal' || d1 > 20000) assert.deepEqual(r.checklist, fallbackFor('Wrongful Fine'));
  }
});
