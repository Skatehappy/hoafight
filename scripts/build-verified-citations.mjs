// scripts/build-verified-citations.mjs
// Builds api/_verified-citations.json (+ the .js twin the edge function imports) from the verification logs.
// Only VERIFIED / CORRECTED rows count. Rows marked REMOVED, and prose that says a claim was WRONG, never enter the set.
//   node scripts/build-verified-citations.mjs          write both files
//   node scripts/build-verified-citations.mjs --check  exit 1 if the committed files are stale
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCitations, rangeKeys } from '../api/_citelint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = ['VERIFICATION_LOG.md', 'VERIFICATION_LOG-SEO-CONTENT.md'];
const OUT_JSON = path.join(ROOT, 'api', '_verified-citations.json');
const OUT_JS = path.join(ROOT, 'api', '_verified-citations.js');
const ABBR = { CA: 'CA', TX: 'TX', FL: 'FL', NY: 'NY', IL: 'IL', PA: 'PA', OH: 'OH', GA: 'GA', NC: 'NC', AZ: 'AZ' };
const NAME_TO_ABBR = { California: 'CA', Texas: 'TX', Florida: 'FL', 'New York': 'NY', Illinois: 'IL', Pennsylvania: 'PA', Ohio: 'OH', Georgia: 'GA', 'North Carolina': 'NC', Arizona: 'AZ' };
const FEDERAL = /U\.S\.C\.|\bCFR\b|C\.F\.R\.|FCC|OTARD/i;
const BAD_PROSE = /\b(WRONG|REMOVED|NOT FOUND|no basis|incorrect|unverified)\b/i;

const sets = { _federal: { keys: new Set(), display: new Set() } };
function bucket(st) { return (sets[st] ||= { keys: new Set(), display: new Set() }); }

function add(state, text, display) {
  for (const c of extractCitations(text)) {
    const target = /U\.S\.C\.|\bCFR\b|C\.F\.R\./.test(text) || /^S:FED/.test(c.key) ? sets._federal : bucket(state);
    for (const k of rangeKeys(c.key)) target.keys.add(k);
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

export function build() {
  for (const f of LOGS) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
    let state = null;      // current state section
    let inLegacy = false;  // "## California (CA)" style sections of the SEO log
    let entry = null;      // VERIFICATION_LOG.md entry being read
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      let m;
      if ((m = /^## (.+?) \(([A-Z]{2})\)\s*$/.exec(ln))) { state = ABBR[m[2]] || null; inLegacy = !!state; continue; }
      if ((m = /^### (.+?) \(([A-Z]{2})\) —/.exec(ln))) { state = ABBR[m[2]] || null; inLegacy = false; continue; }
      if (/^## /.test(ln)) { inLegacy = false; if (!/Phase B/.test(ln)) state = null; continue; }
      if (/^### Literal forms/.test(ln)) { state = null; inLegacy = false; continue; }

      // VERIFICATION_LOG.md: "### date — citation" + "- **Subject:** XX ..." + "- **Verdict:** VERIFIED"
      if (f === 'VERIFICATION_LOG.md') {
        if ((m = /^### \d{4}-\d{2}-\d{2} — (.+)$/.exec(ln))) { entry = { cite: m[1], state: null, ok: false }; continue; }
        if (entry && (m = /^- \*\*Subject:\*\* (\S+)/.exec(ln))) { entry.state = ABBR[m[1]] || null; }
        if (entry && /^- \*\*Verdict:\*\* VERIFIED/.test(ln)) { entry.ok = true; add(entry.state || (FEDERAL.test(entry.cite) ? '_federal' : '_misc'), entry.cite, entry.cite); entry = null; }
        continue;
      }

      // Phase B tables: | citation(s) | STATUS | what it says | source |
      if (/^\|/.test(ln) && !/^\|[-\s|]+\|?$/.test(ln) && !/^\| (Citation|Literal form)/.test(ln)) {
        const cells = ln.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length >= 3 && /^(VERIFIED|CORRECTED)/.test(cells[1])) {
          const st = state || stateFromText(cells[0]);
          const parts = cells[0].split(/\s\/\s|;\s/).map(s => s.trim()).filter(Boolean);
          for (const part of parts) add(st, part, part);
        }
        continue;
      }
      // Legacy state sections: bullet prose that carries the retrieved sources; skip lines that call a claim wrong.
      if (inLegacy && state && /^\s*-/.test(ln) && !BAD_PROSE.test(ln)) {
        add(state, ln, null);
        for (const mm of ln.matchAll(/((?:[A-Z][A-Za-z.&']*\.?\s+){0,3}(?:Code|Stat\.|Statutes|Laws|C\.S\.|G\.S\.|ILCS|CFR|U\.S\.C\.)\.?\s*)?§§?\s*\d[\w.\-–/()]*/g)) sets[state] && sets[state].display.add(mm[0].replace(/\s+/g, ' ').trim());
      }
    }
  }
  const out = { app: 'hoafight', states: {}, federal: null };
  const fin = s => ({ keys: [...s.keys].sort(), display: [...s.display].sort().slice(0, 120) });
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
