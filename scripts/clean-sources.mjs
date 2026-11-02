// scripts/clean-sources.mjs — physically deletes from the source files (scripts/data/**/*.json) every sentence that carries a
// citation or a dollar/percent/day figure with no DATED entry in the verification logs (same rule as the build-time hold-back).
//   node scripts/build-verified-citations.mjs && node scripts/clean-sources.mjs [--dry]
// Gate A20 (scripts/scan-sources.mjs) fails if any such item remains in a source file.
import fs from 'node:fs';
import path from 'node:path';
import { strip, withScope, slugToAbbr } from './data/pending.js';
import { walkFiles } from './scan-sources.mjs';

const dry = process.argv.includes('--dry');
let changed = 0;
for (const f of walkFiles('scripts/data').filter(f => f.endsWith('.json'))) {
  const raw = fs.readFileSync(f, 'utf8'), j = JSON.parse(raw);
  const m = /generated\/([^/]+)\//.exec(f.split(path.sep).join('/'));
  const out = m ? withScope(slugToAbbr(m[1]), () => strip(j)) : (/state-data.json$/.test(f) ? Object.fromEntries(Object.entries(j).map(([k, v]) => [k, withScope(k.length === 2 ? k : null, () => strip(v))])) : strip(j));
  const txt = JSON.stringify(out, null, 2) + (raw.endsWith('\n') ? '\n' : '');
  if (JSON.stringify(j) !== JSON.stringify(out)) { changed++; if (!dry) fs.writeFileSync(f, txt); console.log((dry ? 'would clean ' : 'cleaned ') + f); }
}
console.log(`${changed} source files ${dry ? 'would change' : 'changed'}`);
