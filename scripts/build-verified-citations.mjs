// scripts/build-verified-citations.mjs
// Builds api/_verified-citations.json (+ the .js twin the edge function imports) from the verification logs.
// Only VERIFIED / CORRECTED rows count. Rows marked REMOVED, and prose that says a claim was WRONG, never enter the set.
//   node scripts/build-verified-citations.mjs          write both files
//   node scripts/build-verified-citations.mjs --check  exit 1 if the committed files are stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampFile, SEO_LOG } from './stamp-verified-on.mjs';
import { DATE_RE } from './verified-on.mjs';
import { extractCitations, rangeKeys, numericClaims } from '../api/_citelint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = ['VERIFICATION_LOG.md', 'VERIFICATION_LOG-SEO-CONTENT.md'];
const OUT_JSON = path.join(ROOT, 'api', '_verified-citations.json');
const OUT_JS = path.join(ROOT, 'api', '_verified-citations.js');
const ABBR = { CA: 'CA', TX: 'TX', FL: 'FL', NY: 'NY', IL: 'IL', PA: 'PA', OH: 'OH', GA: 'GA', NC: 'NC', AZ: 'AZ' };
const NAME_TO_ABBR = { California: 'CA', Texas: 'TX', Florida: 'FL', 'New York': 'NY', Illinois: 'IL', Pennsylvania: 'PA', Ohio: 'OH', Georgia: 'GA', 'North Carolina': 'NC', Arizona: 'AZ' };
const FEDERAL = /U\.S\.C\.|\bCFR\b|C\.F\.R\.|FCC|OTARD/i;
const BAD_PROSE = /\b(WRONG|REMOVED|NOT FOUND|no basis|incorrect|unverified)\b/i;

const mk = () => ({ keys: new Set(), display: new Set(), subs: new Map(), nums: new Set(), dates: new Map(), ndates: new Map() });
const sets = { _federal: mk() };
function bucket(st) { return (sets[st] ||= mk()); }
// verified_on per key / figure = the NEWEST verified_on among the log entries that verify it (a re-verification supersedes).
const newer = (map, k, d) => { if (d && (!map.get(k) || d > map.get(k))) map.set(k, d); };
let curDate = null; // verified_on of the entry being read

// Keep only what the verified text says: drop parentheticals and sentences that describe what the OLD page claimed
// ("The pages said ...", "(the $500 figure is NOT in the statute)", "REMOVED", "WRONG").
const OLD = /\b(WRONG|REMOVED|pages? said|hub said|The pages?|The hub|previously|earlier|was corrected|were corrected|not in the text|is NOT|are NOT|NOT the|figure is NOT|not statutory)\b/i;
export function verifiedPart(t) {
  t = String(t).replace(/\([^()]*(WRONG|REMOVED|pages? said|hub said|previously|NOT )[^()]*\)/gi, ' ');
  return t.split(/(?<=\.)\s+(?=[A-Z])/).filter(x => !OLD.test(x)).join(' ');
}

function add(state, text, display, ctx) {
  const body = ctx == null ? null : verifiedPart(ctx);
  const toks = body ? (body.match(/\([A-Za-z0-9]{1,4}\)/g) || []).map(x => x.toLowerCase()) : [];
  for (const c of extractCitations(text)) {
    const target = /U\.S\.C\.|\bCFR\b|C\.F\.R\./.test(text) || /^S:FED/.test(c.key) ? sets._federal : bucket(state);
    for (const k of rangeKeys(c.key)) {
      target.keys.add(k); newer(target.dates, k, curDate);
      const have = target.subs.get(k) || new Set();
      toks.forEach(t => have.add(t));
      if (c.sub) c.sub.match(/\([A-Za-z0-9]{1,4}\)/g).forEach(t => have.add(t.toLowerCase()));
      target.subs.set(k, have);
    }
  }
  if (body) {
    const t = /U\.S\.C\.|\bCFR\b|C\.F\.R\./.test(text) ? sets._federal : bucket(state);
    for (const n of numericClaims(body)) { t.nums.add(n.key); newer(t.ndates, n.key, curDate); }
  }
  if (display && display.length < 110 && extractCitations(display).length) (FEDERAL.test(display) ? sets._federal : bucket(state)).display.add(display.replace(/\s+/g, ' ').trim());
}

function stateFromText(t) {
  if (/Tex\.|Texas/.test(t)) return 'TX';
  if (/North Carolina|N\.C\./.test(t)) return 'NC';
  if (/Pa\.C\.S\.|Pennsylvania/.test(t)) return 'PA';
  if (/Fla\.|Florida/.test(t)) return 'FL';
  if (/A\.R\.S\.|Arizona/.test(t)) return 'AZ';
  if (/Civ\. Code|California/.test(t)) return 'CA';
  return /U\.S\.C\.|\bCFR\b/.test(t) ? '_federal' : '_misc';
}

export function build(root = ROOT) {
  for (const k of Object.keys(sets)) delete sets[k]; sets._federal = mk(); curDate = null;
  for (const f of LOGS) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    let state = null;      // current state section
    let inLegacy = false;  // "## California (CA)" style sections of the SEO log
    let entry = null;      // VERIFICATION_LOG.md entry being read
    let secDate = null;    // newest verified_on among a legacy section's source bullets
    const bulletDate = l => (/verified_on: (\d{4}-\d{2}-\d{2})\s*$/.exec(l) || [])[1] || null;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      let m;
      if ((m = /^## (.+?) \(([A-Z]{2})\)\s*$/.exec(ln))) { state = ABBR[m[2]] || null; inLegacy = !!state; curDate = null;
        secDate = null; for (let j = i + 1; j < lines.length && !/^## /.test(lines[j]); j++) { const d = bulletDate(lines[j]); if (d && (!secDate || d > secDate)) secDate = d; }
        continue; }
      if ((m = /^### (.+?) \(([A-Z]{2})\) —/.exec(ln))) { state = ABBR[m[2]] || null; inLegacy = false; continue; }
      if (/^## /.test(ln)) { inLegacy = false; if (!/Phase B/.test(ln)) state = null; continue; }
      if (/^### Literal forms/.test(ln)) { state = null; inLegacy = false; continue; }

      // VERIFICATION_LOG.md: "### date — citation" + "- **Subject:** XX ..." + "- **Verdict:** VERIFIED"
      if (f === 'VERIFICATION_LOG.md') {
        if ((m = /^### \d{4}-\d{2}-\d{2} — (.+)$/.exec(ln))) { entry = { cite: m[1], state: null, ok: false, date: ln.slice(4, 14) }; continue; }
        if (entry && (m = /^- \*\*Subject:\*\* (\S+)/.exec(ln))) { entry.state = ABBR[m[1]] || null; }
        if (entry && /^- \*\*Verdict:\*\* VERIFIED/.test(ln)) { entry.ok = true; curDate = entry.date; add(entry.state || (FEDERAL.test(entry.cite) ? '_federal' : '_misc'), entry.cite, entry.cite); entry = null; }
        continue;
      }

      // Phase B tables: | citation(s) | STATUS | what it says | source |
      if (/^\|/.test(ln) && !/^\|[-\s|]+\|?$/.test(ln) && !/^\| (Citation|Literal form)/.test(ln)) {
        const cells = ln.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length >= 3 && /^(VERIFIED|CORRECTED)/.test(cells[1])) {
          const st = state || stateFromText(cells[0]);
          curDate = DATE_RE.test(cells.at(-1)) ? cells.at(-1) : null;
          const parts = cells[0].split(/\s\/\s|;\s/).map(s => s.trim()).filter(Boolean);
          for (const part of parts) add(st, part, part, cells[0] + ' ' + cells[2]);
        }
        continue;
      }
      // Legacy state sections: bullet prose that carries the retrieved sources; skip lines that call a claim wrong.
      if (inLegacy && state && /^\s*-/.test(ln) && !BAD_PROSE.test(ln)) {
        curDate = bulletDate(ln) || (/^\s+- \[/.test(ln) ? null : (/^\s*- \*\*/.test(ln) ? secDate : curDate));
        add(state, ln, null);
        for (const mm of ln.matchAll(/((?:[A-Z][A-Za-z.&']*\.?\s+){0,3}(?:Code|Stat\.|Statutes|Laws|C\.S\.|G\.S\.|ILCS|CFR|U\.S\.C\.)\.?\s*)?§§?\s*\d[\w.\-–/()]*/g)) sets[state] && sets[state].display.add(mm[0].replace(/\s+/g, ' ').trim());
      }
    }
  }
  const out = { app: 'hoafight', states: {}, federal: null };
  const fin = s => ({ keys: [...s.keys].sort(), display: [...s.display].sort().slice(0, 120), subs: Object.fromEntries([...s.subs].filter(([, v]) => v.size).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, [...v].sort()])), nums: [...s.nums].sort(), dates: Object.fromEntries([...s.dates].sort(([a], [b]) => (a < b ? -1 : 1))), ndates: Object.fromEntries([...s.ndates].sort(([a], [b]) => (a < b ? -1 : 1))) });
  for (const st of Object.keys(sets).sort()) {
    if (st === '_federal') out.federal = fin(sets[st]);
    else out.states[st] = fin(sets[st]);
  }
  return out;
}

export function render(data) {
  const json = JSON.stringify(data, null, 2) + '\n';
  const js = '// GENERATED by scripts/build-verified-citations.mjs from VERIFICATION_LOG*.md. Do not edit.\nexport default ' + JSON.stringify(data) + ';\n';
  return { json, js };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // new/undated log entries get today's date (git-blame date when already committed) before the sets are built
  if (!process.argv.includes('--check')) { const n = stampFile(SEO_LOG); if (n) console.log('stamped verified_on on ' + n + ' new log entries'); }
  const { json, js } = render(build());
  if (process.argv.includes('--check')) {
    const stale = !fs.existsSync(OUT_JSON) || fs.readFileSync(OUT_JSON, 'utf8') !== json || !fs.existsSync(OUT_JS) || fs.readFileSync(OUT_JS, 'utf8') !== js;
    if (stale) { console.error('api/_verified-citations.* is stale — run: node scripts/build-verified-citations.mjs'); process.exit(1); }
    console.log('verified-citations up to date');
  } else {
    fs.writeFileSync(OUT_JSON, json); fs.writeFileSync(OUT_JS, js);
    const d = JSON.parse(json);
    console.log('verified-citations:', Object.entries(d.states).map(([s, v]) => `${s}=${v.keys.length}`).join(' '), `federal=${d.federal.keys.length}`);
  }
}
