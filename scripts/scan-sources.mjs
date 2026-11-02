// scripts/scan-sources.mjs — gate A20: no source file under scripts/data/** may carry an unlogged citation or
// a dollar/percent/day figure without a dated log entry. Sources are scanned raw (NOT through the build-time holdBack),
// so the unverified sentence must be deleted from the file itself.
//   node scripts/scan-sources.mjs [--all]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlogged, withScope, slugToAbbr } from './data/pending.js';
import { numericClaims } from '../api/_citelint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// All string values (and object keys are ignored) of a JSON document, or the raw text of a non-JSON file.
export function textsOf(name, raw) {
  if (!name.endsWith('.json')) return [raw];
  const out = [];
  (function walk(v) { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(JSON.parse(raw));
  return out;
}
export function walkFiles(dir) {
  const out = [];
  (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (/\.(json|js)$/.test(e.name) && e.name !== 'pending.js') out.push(p); } })(dir);
  return out;
}
// Returns [{where, kind, item}] for every citation / figure in the files that has no DATED log entry for its state
// (state = generated/<slug>/ directory, or the top-level key of state-data.json; other files use the union of all states).
export function scan(files, root = ROOT) {
  const bad = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, 'utf8');
    const name = path.relative(root, f).split(path.sep).join('/');
    const gm = /scripts\/data\/generated\/([^/]+)\//.exec(name);
    const parts = [];   // [scope, text]
    if (/state-data\.json$/.test(name)) { for (const [k, v] of Object.entries(JSON.parse(raw))) for (const t of textsOf('x.json', JSON.stringify(v))) parts.push([k.length === 2 ? k : null, t]); }
    else for (const t of textsOf(f, raw)) parts.push([gm ? slugToAbbr(gm[1]) : null, t]);
    for (const [scope, t] of parts) {
      const txt = t.replace(/<[^>]+>/g, ' ');
      for (const u of withScope(scope, () => unlogged(txt))) bad.push({ where: name, kind: 'unmapped', item: u });
    }
  }
  return bad;
}
export function figSet(data) {
  const s = new Set();
  for (const b of [...Object.values(data.states || {}), data.federal].filter(Boolean)) for (const k of b.nums || []) if (b.ndates?.[k]) s.add(k);
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'api', '_verified-citations.json'), 'utf8'));
  const files = walkFiles(path.join(ROOT, 'scripts', 'data'));
  const bad = scan(files);
  const by = {}; for (const b of bad) (by[b.where] ||= []).push(b);
  if (process.argv.includes('--all') || bad.length) for (const [w, l] of Object.entries(by).slice(0, process.argv.includes('--all') ? 1e9 : 25)) console.log(w + ': ' + l.slice(0, 6).map(x => x.kind[0] + ':' + x.item).join(' | '));
  console.log(`A20 scanned ${files.length} source files; unlogged/undated items: ${bad.length} in ${Object.keys(by).length} files`);
  if (bad.length) process.exit(1);
}
