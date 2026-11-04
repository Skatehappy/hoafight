// A21: marketing-claims gate. Fails if any public page, page template, JSON-LD, content source or src marketing string
// claims or implies the product is attorney/lawyer quality or gives legal advice, and requires the
// not-legal-advice disclaimer on every public HTML page, every page template and the app.
//   node scripts/check-marketing-claims.mjs          (scan the repo)
// Exports scanText()/scanRepo() for tests/marketing-claims.test.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANNED = [
  /attorney[\s\-‐-―]*quality/i, /lawyer[\s\-‐-―]*quality/i,
  /attorney[\s\-‐-―]*grade/i, /lawyer[\s\-‐-―]*grade/i,
  /attorney[\s\-‐-―]*written/i, /lawyer[\s\-‐-―]*written/i,
  /attorney[\s\-‐-―]*drafted/i, /lawyer[\s\-‐-―]*drafted/i,
  /real\s+lawyer/i, /cost\s+of\s+an?\s+(attorney|lawyer)/i,
];
const NEGATION = /\b(not|no|never|cannot|can't|isn't|aren't|doesn't|does\s+not|do\s+not|don't|without)\b|n't\b/i;
const DISCLAIMER = /(not|does not (provide|constitute|offer)|doesn't (provide|constitute)|no)\s+(a\s+substitute\s+for\s+)?legal advice/i;

// Sentence containing index i (split on . ! ? newline and tag/quote boundaries).
function sentenceAt(t, i, len) {
  const L = t.slice(0, i).split(/[.!?\n<>"]/).pop();
  const R = t.slice(i + len).split(/[.!?\n<>"]/)[0];
  return L + t.slice(i, i + len) + R;
}
export function scanText(raw, { html = false } = {}) {
  let t = String(raw).replace(/&nbsp;|&#160;/g, ' ').replace(/&#0?39;|&apos;|&rsquo;|’/g, "'");
  // Tags/attributes are deliberately NOT stripped: meta, og/twitter and JSON-LD text live in attributes and script bodies.
  const hits = [];
  for (const re of BANNED) { const m = t.match(re); if (m) hits.push(m[0]); }
  for (const m of t.matchAll(/legal\s+advice/gi)) {
    const s = sentenceAt(t, m.index, m[0].length);
    if (NEGATION.test(s)) continue;
    if (/executive\s+session/i.test(s)) continue;          // quoted statute text about board meetings, not a product claim
    hits.push('legal advice (not in a disclaimer): ' + s.trim().slice(0, 80));
  }
  return hits;
}
export const hasDisclaimer = (raw, html = true) => DISCLAIMER.test(String(raw).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/&#0?39;|&apos;/g, "'"));

function walk(dir, re, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, re, out); else if (re.test(e.name)) out.push(p);
  }
  return out;
}
export function scanRepo(root = ROOT) {
  const problems = [];
  const rel = f => path.relative(root, f).split(path.sep).join('/');
  const pub = path.join(root, 'public');
  const pages = fs.existsSync(pub) ? walk(pub, /\.html$/) : [];
  const tplDir = path.join(root, 'scripts', 'templates');
  const tpls = fs.existsSync(tplDir) ? walk(tplDir, /\.js$/) : [];
  const others = ['src/App.jsx', 'index.html', 'landing.html', 'scripts/data/config.js', 'scripts/data/disputes.js', 'scripts/data/states.js', 'scripts/data/state-data.json', 'scripts/generate-content.js']
    .map(f => path.join(root, f)).filter(fs.existsSync);
  const gen = path.join(root, 'scripts', 'data', 'generated');
  const genFiles = fs.existsSync(gen) ? walk(gen, /\.json$/) : [];
  for (const f of [...pages, ...tpls, ...others, ...genFiles]) {
    const txt = fs.readFileSync(f, 'utf8');
    for (const h of scanText(txt, { html: f.endsWith('.html') })) problems.push(rel(f) + ': ' + h);
  }
  // Disclaimer presence: every public HTML page (redirect stubs excepted), every page template, and the app.
  for (const f of pages) { const t = fs.readFileSync(f, 'utf8'); if (!/http-equiv=["']refresh|<meta[^>]+url=/i.test(t) && !hasDisclaimer(t)) problems.push(rel(f) + ': missing not-legal-advice disclaimer'); }
  for (const f of tpls.filter(f => /(hub|deep-page)-template\.js$/.test(f))) if (!hasDisclaimer(fs.readFileSync(f, 'utf8'))) problems.push(rel(f) + ': template missing not-legal-advice disclaimer');
  const app = path.join(root, 'src/App.jsx');
  if (fs.existsSync(app)) {
    const a = fs.readFileSync(app, 'utf8');
    if ((a.match(/not a law firm[^<]*legal advice|does not constitute legal advice/gi) || []).length < 2) problems.push('src/App.jsx: disclaimer must appear on both the unlock and letter screens');
  }
  return problems;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const p = scanRepo();
  if (p.length) { console.error('A21 FAIL - marketing claims / disclaimer (' + p.length + '):\n  ' + p.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log('A21 OK - no banned marketing phrases; disclaimer present on all pages, templates and app');
}
