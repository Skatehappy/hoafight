// scripts/scan-unlogged.mjs — scans every built page under public/ and reports citations that are not in the
// verification logs (should be 0) and, with --live, compares sampled live pages byte-for-byte with public/.
//   node scripts/scan-unlogged.mjs [--live https://hoafight.com]
import fs from 'node:fs';
import path from 'node:path';
import { unlogged } from './data/pending.js';

const ROOT = path.resolve('public');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p); } })(ROOT);

const text = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
let bad = 0;
for (const f of files) {
  const u = unlogged(text(fs.readFileSync(f, 'utf8')));
  if (u.length) { bad += u.length; console.log(path.relative(ROOT, f) + ': ' + u.slice(0, 6).join(' | ')); }
}
console.log(`scanned ${files.length} pages; unlogged citations: ${bad}`);

const li = process.argv.indexOf('--live');
if (li > -1) {
  const base = process.argv[li + 1];
  const pick = files.filter((f, i) => i % Math.ceil(files.length / 12) === 0).concat(files.filter(f => /georgia[\\/]hoa-lien|ohio[\\/]hoa-special/.test(f)));
  let diff = 0, liveBad = 0;
  for (const f of pick) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/').replace(/index\.html$/, '').replace(/\/$/, '');
    const url = base + '/' + rel;
    const res = await fetch(url, { redirect: 'follow' });
    const body = await res.text();
    const local = fs.readFileSync(f, 'utf8');
    if (res.status !== 200) { console.log('LIVE non-200', res.status, url); diff++; continue; }
    if (body.replace(/\r\n/g, '\n') !== local.replace(/\r\n/g, '\n')) { console.log('LIVE differs from build:', url); diff++; }
    const u = unlogged(text(body));
    if (u.length) { liveBad += u.length; console.log('LIVE unlogged:', url, u.slice(0, 4).join(' | ')); }
  }
  console.log(`live sample ${pick.length}: differs ${diff}, unlogged ${liveBad}`);
}
if (bad > 0) process.exit(1);
