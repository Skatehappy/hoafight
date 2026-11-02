// scripts/test-scan-sources.mjs — mock tests for gate A20 (no unlogged citation / unmapped figure in any scripts/data/** source). No network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scan, walkFiles } from './scan-sources.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-'));
const put = (rel, obj) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); return p; };
const run = () => scan(walkFiles(path.join(tmp, 'scripts', 'data')), tmp);

// clean source (only logged items: Fla. Stat. 720.305 and its $100 / $1,000 caps are logged for FL) -> passes
put('scripts/data/generated/florida/ok.json', { a: 'Fines under Fla. Stat. § 720.305 are capped at $100 per violation and $1,000 aggregate.' });
assert.deepEqual(run(), []);
// unlogged citation in a source -> fails
put('scripts/data/generated/florida/bad-cite.json', { a: 'See Fla. Stat. § 999.123 for the rule.' });
let r = run(); assert.ok(r.some(x => /bad-cite/.test(x.where) && /999\.123/.test(x.item)), JSON.stringify(r));
fs.rmSync(path.join(tmp, 'scripts/data/generated/florida/bad-cite.json'));
// unmapped figure in a source (an unlogged-citation-free sentence) -> fails
put('scripts/data/generated/florida/bad-fig.json', { a: { b: ['The board must answer within 47 days.'] } });
r = run(); assert.ok(r.some(x => /bad-fig/.test(x.where) && /47 days/.test(x.item)), JSON.stringify(r));
fs.rmSync(path.join(tmp, 'scripts/data/generated/florida/bad-fig.json'));
// state scope: an Ohio-only figure ($6,000, R.C. 1925.02) in a Florida source -> fails; in an Ohio source -> passes
put('scripts/data/generated/florida/oh-fig.json', { a: 'Small claims courts hear cases up to $6,000.' });
r = run(); assert.ok(r.some(x => /oh-fig/.test(x.where)), 'cross-state figure must fail');
fs.rmSync(path.join(tmp, 'scripts/data/generated/florida/oh-fig.json'));
put('scripts/data/generated/ohio/oh-fig.json', { a: 'Small claims courts hear cases up to $6,000.' });
assert.deepEqual(run(), []);
// state-data.json is scoped by its top-level state key
put('scripts/data/state-data.json', { FL: { x: 'Small claims courts hear cases up to $6,000.' } });
r = run(); assert.ok(r.some(x => /state-data/.test(x.where)), 'state-data cross-state figure must fail');
fs.rmSync(tmp, { recursive: true, force: true });
console.log('scan-sources tests passed (clean passes; unlogged citation fails; unmapped figure fails; state scope; state-data scope)');
