// Attorney-voice lint: the letter is written and signed by the homeowner. Mocked fetch; no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
process.env.PAYHIP_API_KEY = 'x'; process.env.ANTHROPIC_API_KEY = 'x';
const { findAttorneyVoice, VOICE_RULE } = await import('../api/_voice.js');
const { default: generate } = await import('../api/generate.js');
const { default: checklist } = await import('../api/checklist.js');

const BANNED = ['Attorney for the Homeowner', 'ATTORNEY   FOR  THE HOMEOWNER', 'attorney for the owner', 'Counsel for the homeowner', 'Attorney for [Your Name]',
  'Jane Roe, Esq.', 'JANE ROE ESQ', 'J. Roe, E s q.', 'Esquire', 'on behalf of my client', 'On  Behalf of   Our Client', 'my client', 'our client',
  'This firm represents the owner', 'Attorney at Law', 'Law Office of Roe', 'Law Offices of Roe', 'as attorney for the member', 'Sincerely,\nAttorney for Jane Roe'];
const LEGIT = ['you may wish to consult an attorney', 'You may recover attorney’s fees and costs', "attorney's fees", 'consult counsel for advice on this', 'counsel for the HOA may respond',
  "Please have the association's attorney contact me.", 'I consulted an attorney for advice', 'law firm', 'Sincerely,\n[Your Name]', 'a client of the HOA management company'];
test('every banned phrase and its case/spacing variants is detected', () => { for (const t of BANNED) assert.ok(findAttorneyVoice(t).length, 'missed: ' + JSON.stringify(t)); });
test('legitimate homeowner text is not flagged', () => { for (const t of LEGIT) assert.deepEqual(findAttorneyVoice(t), [], 'false positive: ' + JSON.stringify(t)); });

const realFetch = globalThis.fetch, realLog = console.log;
let usage = 0, calls = [];
function mock(replies) {
  usage = 0; calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/license/verify')) return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 });
    if (u.includes('/license/usage')) { usage++; return new Response('{}', { status: 200 }); }
    assert.ok(u.includes('api.anthropic.com'));
    calls.push(JSON.parse(init.body));
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: r }] }), { status: 200 });
  };
}
test.beforeEach(() => { console.log = () => {}; });
test.afterEach(() => { globalThis.fetch = realFetch; console.log = realLog; });
const run = async (extra = {}) => {
  let status = 0, json = null;
  const res = { setHeader() {}, status(c) { status = c; return res; }, json(o) { json = o; return res; }, end() { return res; } };
  await generate({ method: 'POST', body: { accessCode: 'LD-MOCK-0001', systemPrompt: 'sys', userPrompt: 'STATE: Florida\nwrite', state: 'Florida', disputeType: 'Wrongful Fine', ...extra } }, res);
  return { status, json };
};
const CLEAN = 'Dear Board,\n\nI dispute this fine and request a hearing.\n\nSincerely,\n[Your Name]';
const BAD = 'Dear Board,\n\nI dispute this fine.\n\nSincerely,\nJane Roe\nAttorney for the Homeowner';

test('generate: banned phrase then clean letter -> clean letter returned, regeneration names the phrase, usage marked once', async () => {
  mock([BAD, CLEAN]);
  const r = await run();
  assert.equal(r.status, 200); assert.equal(r.json.text, CLEAN); assert.equal(usage, 1); assert.equal(calls.length, 2);
  assert.ok(calls[1].system.includes('Attorney for'), 'notice names the rejected phrase');
  assert.ok(calls[0].system.includes(VOICE_RULE), 'first call carries the user-signs rule');
});
test('generate: banned phrase twice -> 502, usage NOT marked, offending text never returned', async () => {
  mock([BAD, BAD]);
  const r = await run();
  assert.equal(r.status, 502); assert.equal(usage, 0); assert.ok(!JSON.stringify(r.json).includes('Attorney for the Homeowner'));
});
test('generate: review mode is linted too; a clean assertive letter passes', async () => {
  mock([BAD, BAD]);
  const r = await run({ reviewMode: true, draftLetter: 'draft', userPrompt: '' });
  assert.equal(r.status, 502); assert.equal(usage, 0);
  mock([CLEAN]); assert.equal((await run({ userPrompt: 'STATE: Florida\nWrite a MORE ASSERTIVE appeal letter' })).status, 200);
});
test('checklist: items with a banned phrase are dropped', async () => {
  const items = Array.from({ length: 9 }, (_, i) => `Keep dated copy number ${i + 1} of everything you send`);
  items[0] = 'Have Esq. review it'; items[1] = 'Sign as Attorney for the Homeowner';
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/license/verify')) return new Response(JSON.stringify({ data: { enabled: true, product_link: '8TWrB' } }), { status: 200 });
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(items) }] }), { status: 200 });
  };
  const res = await checklist(new Request('http://x/api/checklist', { method: 'POST', body: JSON.stringify({ accessCode: 'LD-MOCK-0001', state: 'Florida', issueType: 'Wrongful Fine', letterExcerpt: 'x' }) }));
  const j = await res.json();
  assert.ok(j.checklist.length >= 3 && j.checklist.every(i => !findAttorneyVoice(i).length) && !j.checklist.some(i => /Esq|Attorney for/.test(i)));
});

test('every letter-type prompt in the app carries the user-signs rule, no attorney self-description', () => {
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.ok(/import \{ VOICE_RULE \}/.test(src));
  const defs = [...src.matchAll(/const (\w*[pP]rompt) = (["`])([\s\S]*?)\2( \+ VOICE_RULE)?;/g)].filter(m => /^You are/.test(m[3]));
  assert.ok(defs.length >= 8, 'found ' + defs.length + ' prompts');
  for (const [, name, , body] of defs) {
    assert.ok(body.includes('VOICE_RULE') || /VOICE_RULE/.test(src.slice(src.indexOf(body), src.indexOf(body) + body.length + 20)), name + ' lacks the rule');
    assert.ok(/letter writer/.test(body) && !/\b(attorney|lawyer|counsel)\b/i.test(body.split('\n')[0]), name + ' persona self-describes as a lawyer');
    assert.deepEqual(findAttorneyVoice(body), [], name);
  }
  assert.ok(!/You are an expert HOA and community association attorney/.test(src));
});
test('static samples/templates/generated pages contain no attorney-voice phrases', () => {
  const root = new URL('../', import.meta.url);
  const files = [...readdirSync(new URL('scripts/templates/', root)).map(f => 'scripts/templates/' + f), 'src/App.jsx', 'api/_checklist-fallbacks.js', 'api/_checklist-prompt.js', 'public/landing.html'];
  for (const st of readdirSync(new URL('scripts/data/generated/', root))) { const d = 'scripts/data/generated/' + st; try { for (const f of readdirSync(new URL(d + '/', root))) files.push(d + '/' + f); } catch { /* not a dir */ } }
  for (const f of files) assert.deepEqual(findAttorneyVoice(readFileSync(new URL(f, root), 'utf8')), [], f);
});
