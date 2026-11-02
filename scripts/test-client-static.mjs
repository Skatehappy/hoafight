// scripts/test-client-static.mjs — gate A14: every statute / regulation / case citation written into the client
// (src/App.jsx prompts and placeholders, public/landing.html, scripts/templates/*.js) must be in the verified set,
// subsection included. The same lock that guards generated letters, applied to static client text.
//   node scripts/test-client-static.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCitations, subsectionOk } from '../api/_citelint.js';
import VERIFIED from '../api/_verified-citations.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['src/App.jsx', 'public/landing.html', ...fs.readdirSync(path.join(ROOT, 'scripts/templates')).map(f => 'scripts/templates/' + f)];
const allowed = new Set(VERIFIED.federal.keys);
const subs = {};
const merge = src => { for (const [k, v] of Object.entries(src || {})) subs[k] = [...new Set([...(subs[k] || []), ...v])]; };
merge(VERIFIED.federal.subs);
for (const [s, v] of Object.entries(VERIFIED.states)) { if (s.startsWith('_')) continue; v.keys.forEach(k => allowed.add(k)); merge(v.subs); }

const bad = [];
for (const f of FILES) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const c of extractCitations(text)) {
    if (!allowed.has(c.key) || !subsectionOk(c, subs)) bad.push(`${f}: ${c.text} (${c.key}${c.sub || ''})`);
  }
}
if (bad.length) {
  const uniq = [...new Set(bad)];
  console.error('client static citations not in the verified set (' + uniq.length + '):\n  ' + uniq.join('\n  '));
  process.exit(1);
}
console.log('client static text: all citations in src/App.jsx, public/landing.html and scripts/templates are verified (section + subsection)');
