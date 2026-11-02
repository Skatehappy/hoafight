// scripts/test-verified-on.mjs — mock tests for gate A19 (verified_on freshness). No network.
//   node scripts/test-verified-on.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluate } from './check-verified-on.mjs';
import { parseEntries, stamp, classify, monthsBetween } from './verified-on.mjs';
import { build } from './build-verified-citations.mjs';
import { stampFile } from './stamp-verified-on.mjs';

const NOW = '2026-11-01';
const log = d => `## Phase B (2026-11-01)\n\n### Florida (FL) — page\n| Citation | Status | What it says | Source | verified_on |\n|---|---|---|---|---|\n| Fla. Stat. § 720.305 | VERIFIED | Fines up to $100 per violation. | Official: x | ${d} |\n`;
const lockFor = d => ({ states: { FL: { keys: ['S:720.305'], dates: { 'S:720.305': d }, nums: [], ndates: {} } }, federal: null });
const page = { name: 'public/florida/fines/index.html', html: '<p>Fla. Stat. § 720.305 lets the board fine owners.</p>' };
const run = d => evaluate({ logText: log(d), data: lockFor(d), pages: [page], now: NOW });

// fresh -> clean
let r = run('2026-10-15'); assert.deepEqual([r.fail, r.warn], [[], []]);
// 10-month-plus -> warn only (non-fatal), attributed to lock and page
r = run('2025-12-15'); assert.equal(r.fail.length, 0); assert.ok(r.warn.some(w => /public\/florida\/fines/.test(w)) && r.warn.some(w => /^lock FL/.test(w)), r.warn.join('\n'));
// 13 months -> fail
r = run('2025-09-30'); assert.ok(r.fail.some(f => /more than 12 months/.test(f) && /public\/florida\/fines/.test(f)), r.fail.join('\n'));
assert.ok(r.fail.some(f => /^lock FL/.test(f)));
// boundary: exactly 12 months ago is not "more than" 12; exactly 10 months ago is not a warning
assert.equal(classify('2025-11-01', NOW), 'warn'); assert.equal(classify('2025-12-31', NOW), 'warn'); assert.equal(classify('2025-12-30', NOW), 'warn');
assert.equal(classify('2026-01-01', NOW), 'ok'); assert.equal(classify('2025-10-31', NOW), 'fail'); assert.equal(monthsBetween('2025-09-30', NOW), 13);
// missing date -> fail
const noDate = log('2026-10-15').replace(' 2026-10-15 |\n', ' |\n');
r = evaluate({ logText: noDate, data: lockFor('2026-10-15'), pages: [], now: NOW }); assert.ok(r.fail.some(f => /no verified_on/.test(f)), r.fail.join('\n'));
// table without the verified_on column -> its rows are undated -> fail
const noCol = log('2026-10-15').replace(' verified_on |', '').replace('|---|---|---|---|---|', '|---|---|---|---|').replace(' 2026-10-15 |\n', '\n');
assert.ok(parseEntries(noCol)[0].date === null);
// bullet without verified_on -> fail; invalid / future dates -> fail
const bullet = '## Texas (TX)\n- **Sources (1):**\n  - [records] https://example.org/a (retrieved 2026-10-01)\n';
r = evaluate({ logText: bullet, data: { states: {}, federal: null }, now: NOW }); assert.ok(r.fail.some(f => /no verified_on/.test(f)));
r = evaluate({ logText: bullet + '', data: { states: {}, federal: null }, now: NOW }); assert.equal(parseEntries(bullet).length, 1);
r = evaluate({ logText: log('2026-13-45'), data: lockFor('2026-10-15'), now: NOW }); assert.ok(r.fail.some(f => /invalid verified_on/.test(f)));
r = evaluate({ logText: log('2027-01-01'), data: lockFor('2026-10-15'), now: NOW }); assert.ok(r.fail.some(f => /in the future/.test(f)));
// lock key with no date -> fail
r = evaluate({ logText: log('2026-10-15'), data: { states: { FL: { keys: ['S:720.305'], dates: {}, nums: [] } }, federal: null }, now: NOW }); assert.ok(r.fail.some(f => /S:720.305 has no verified_on/.test(f)));
// figure fed to a generator: stale figure date fails via the lock data
r = evaluate({ logText: log('2026-10-15'), data: { states: { FL: { keys: [], dates: {}, nums: ['$100'], ndates: { '$100': '2025-01-01' } } }, federal: null }, now: NOW }); assert.ok(r.fail.some(f => /figure \$100/.test(f)));

// stamping: idempotent, new entries get the supplied "today", existing dates preserved
const raw = '## T\n\n| A | Status | B | Source |\n|---|---|---|---|\n| § 1 | VERIFIED | x | y |\n\n## Texas (TX)\n  - [k] https://e.org/z (retrieved 2026-07-22)\n';
const s1 = stamp(raw, () => '2026-11-01'); assert.equal(s1.stamped, 2); assert.ok(parseEntries(s1.text).every(e => e.date === '2026-11-01'));
assert.equal(stamp(s1.text, () => '2030-01-01').stamped, 0); assert.equal(stamp(s1.text, () => '2030-01-01').text, s1.text);

// generator preserves / uses verified_on and stamps new entries with today's date (temp repo, no git)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-'));
const seo = path.join(tmp, 'VERIFICATION_LOG-SEO-CONTENT.md');
fs.writeFileSync(seo, log('2026-03-04') + '| Fla. Stat. § 720.306 | VERIFIED | Quorum is 30 percent. | Official: y |\n');
assert.equal(stampFile(seo, '2026-11-01'), 1);
let d = build(tmp);
assert.equal(d.states.FL.dates['S:720.305'], '2026-03-04');   // preserved
assert.equal(d.states.FL.dates['S:720.306'], '2026-11-01');   // new entry -> today
fs.rmSync(tmp, { recursive: true, force: true });
console.log('verified_on tests passed (fresh, 10-month warn, 13-month fail, missing date fail, stamping, generator)');
