// scripts/check-verified-on.mjs — gate A19: verified_on freshness.
//   FAIL: any entry of VERIFICATION_LOG-SEO-CONTENT.md without a valid verified_on date (or dated in the future);
//         any citation / figure that is RENDERED on a page (public/**/*.html), FED TO A GENERATOR (api/_verified-citations.*
//         lock data) or in scripts/data/state-data.json and maps to a log entry verified more than 12 months before today.
//   WARN (non-fatal, listed): the same, more than 10 months.
//   node scripts/check-verified-on.mjs [--now YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEntries, classify, DATE_RE } from './verified-on.mjs';
import { extractCitations, rangeKeys, numericClaims } from '../api/_citelint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const realDate = d => DATE_RE.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
const strip = h => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');

// data = parsed api/_verified-citations.json; pages = [{name, html}]; extra = [{name, text}] (state-data etc.)
export function evaluate({ logText, data, pages = [], extra = [], now }) {
  const fail = [], warn = [];
  const note = (where, what, d) => { const c = classify(d, now); if (c === 'fail') fail.push(`${where}: ${what} last verified ${d} (more than 12 months before ${now})`); else if (c === 'warn') warn.push(`${where}: ${what} last verified ${d} (more than 10 months before ${now})`); };

  for (const e of parseEntries(logText)) {
    if (!e.date) fail.push(`log line ${e.line + 1}: entry has no verified_on date: ${e.label}`);
    else if (!realDate(e.date)) fail.push(`log line ${e.line + 1}: invalid verified_on ${e.date}: ${e.label}`);
    else if (e.date > now) fail.push(`log line ${e.line + 1}: verified_on ${e.date} is in the future: ${e.label}`);
    else note(`log line ${e.line + 1}`, e.label, e.date);   // reported once per entry through the lookups below; kept out of the lists to avoid noise
  }
  fail.splice(0, fail.length, ...fail.filter(x => !/^log line \d+: .* last verified/.test(x)));
  warn.splice(0, warn.length);

  const buckets = [...Object.entries(data.states || {}), ['federal', data.federal]].filter(([, b]) => b);
  const keyDate = k => buckets.map(([, b]) => b.dates?.[k]).filter(Boolean).sort().at(-1) || null;   // newest verification wins
  const numDate = k => buckets.map(([, b]) => b.ndates?.[k]).filter(Boolean).sort().at(-1) || null;

  // lock data fed to api/generate.js + api/checklist.js: every key / figure must carry a date and be fresh
  for (const [st, b] of buckets) {
    for (const k of b.keys) { const d = b.dates?.[k]; if (!d) fail.push(`lock ${st}: ${k} has no verified_on`); else note(`lock ${st}`, k, d); }
    for (const k of b.nums || []) { const d = b.ndates?.[k]; if (d) note(`lock ${st}`, 'figure ' + k, d); }
  }
  // rendered pages and generator input data: attribute each citation / figure to the surface that carries it
  for (const { name, html, text } of [...pages.map(p => ({ name: p.name, text: strip(p.html) })), ...extra]) {
    const seen = new Set();
    for (const c of extractCitations(text)) for (const k of rangeKeys(c.key).slice(0, 1)) {
      const d = keyDate(k); if (!d || seen.has('c' + k)) continue; seen.add('c' + k); note(name, k, d);
    }
    for (const n of numericClaims(text)) { const d = numDate(n.key); if (!d || seen.has('n' + n.key)) continue; seen.add('n' + n.key); note(name, 'figure ' + n.key, d); }
  }
  return { fail: [...new Set(fail)], warn: [...new Set(warn)] };
}

export function loadAll(root = ROOT) {
  const logText = fs.readFileSync(path.join(root, 'VERIFICATION_LOG-SEO-CONTENT.md'), 'utf8');
  const data = JSON.parse(fs.readFileSync(path.join(root, 'api', '_verified-citations.json'), 'utf8'));
  const pages = [];
  const pub = path.join(root, 'public');
  (function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) pages.push({ name: path.relative(root, p).split(path.sep).join('/'), html: fs.readFileSync(p, 'utf8') }); } })(pub);
  const extra = [];
  const sd = path.join(root, 'scripts', 'data', 'state-data.json');
  if (fs.existsSync(sd)) extra.push({ name: 'scripts/data/state-data.json', text: fs.readFileSync(sd, 'utf8').replace(/\\"/g, '"') });
  return { logText, data, pages, extra };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ni = process.argv.indexOf('--now');
  const now = ni > -1 ? process.argv[ni + 1] : new Date().toLocaleDateString('en-CA');
  const a = loadAll();
  const entries = parseEntries(a.logText);
  const r = evaluate({ ...a, now });
  const ages = entries.filter(e => e.date);
  const n10 = ages.filter(e => classify(e.date, now) !== 'ok').length, n12 = ages.filter(e => classify(e.date, now) === 'fail').length;
  if (r.warn.length) { console.warn(`A19 WARN (${r.warn.length}, non-fatal): verified more than 10 months ago`); r.warn.slice(0, 40).forEach(w => console.warn('  ' + w)); }
  if (r.fail.length) { console.error(`A19 FAIL (${r.fail.length})`); r.fail.slice(0, 40).forEach(w => console.error('  ' + w)); process.exit(1); }
  console.log(`verified_on ok: ${entries.length} log entries, ${n10} older than 10 months, ${n12} older than 12 (now ${now}); ${a.pages.length} pages scanned`);
}
