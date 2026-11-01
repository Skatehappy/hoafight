// api/_citelint.js
// Citation lock for generated letters (Section 7). Pure functions, no I/O, safe for the edge runtime
// and for Node (the build script and the mock test import this file too).
//
// extractCitations(text)  -> [{ key, text, index }]   statute / regulation / case citations found in text
// findUnverified(text, allowed:Set<string>) -> [{ key, text, index }]
// stripSentences(text, bad) -> text with every sentence that contains a bad citation removed
// rangeKeys(key)           -> expands "S:5600-5615" into each section so a cited sub-section of a verified range passes

const CASE_SKIP = new Set(['in', 'under', 'yes', 'see', 'the', 'inc', 'llc', 'co', 'corp', 'if', 'and', 'when', 'as', 'per', 'cf', 'also', 'after', 'because', 'following', 'landmark', 'court', 'case', 'courts', 'decision', 'ruling', 'holding']);

const core = x => (x.match(/\d[\d.\-–/:]*[A-Za-z]?(?:[.\-]\d+)*/) || [''])[0].replace(/[–]/g, '-').replace(/[.\-/:]+$/, '');

function canon(k) {
  if (!k || !k.startsWith('S:')) return k;
  let v = k.slice(2).replace(/^(PA|FED)\d+-(?=\d)/, '');
  if (/^\d+\.\d+[A-Za-z]?-\d+\.\d+/.test(v)) v = v.split('-')[0];
  return 'S:' + v;
}

// Same patterns as scripts/data/pending.js (the build-time hold-back), so the page lock and the letter lock agree.
const PATTERNS = [
  [/§§?\s*(\d[\w.\-–:/]*)/g, m => 'S:' + core(m[1])],
  [/\b(\d+)\s*ILCS\s*([\d/.\-]+)/g, m => 'S:' + m[1] + 'ILCS' + core(m[2])],
  [/\b(\d+)\s*(?:Pa\.\s*C\.\s*S\.|P\.\s*S\.)\s*(?:§+\s*)?(\d[\d.\-]*)?/g, m => 'S:PA' + m[1] + (m[2] ? '-' + core(m[2]) : '')],
  [/\b(?:R\.\s*C\.|ORC)\s*(?:§\s*)?(\d{3,4}\.\d+)/g, m => 'S:' + m[1]],
  [/\b(?:Fla\.\s*Stat\.|Tex\.\s*[A-Z][a-z]+\.?\s*Code|Insurance Law|Ins\.\s*Law|Code)\s+(?:§+\s*)?(\d[\d.\-]*\d)/g, m => 'S:' + core(m[1])],
  [/\bSection\s+(\d[\d.\-]*\d[A-Za-z]?)/g, m => 'S:' + core(m[1])],
  [/\b(?:Chapter|Ch\.)\s+(\d+[A-Z]?)\b/g, m => 'CH:' + m[1]],
  [/\b(?:Article|Art\.)\s+(\d+[A-Z-]*)\b/g, m => 'ART:' + m[1]],
  [/\b(?:Title)\s+(\d+[A-Z]?)\b/g, m => 'TITLE:' + m[1]],
  [/\b(\d+)\s*(?:U\.\s*S\.\s*C\.|USC|C\.\s*F\.\s*R\.|CFR)\s*(?:§+\s*)?(\d[\d.\-]*)?/g, m => 'S:FED' + m[1] + '-' + core(m[2] || '')],
  [/\b((?:[A-Z][A-Za-z'&.\-]*\s+){0,3}[A-Z][A-Za-z'&\-]*)\.?\s+v\.\s+([A-Z][A-Za-z'&\-]+)/g, m => {
    const pl = m[1].split(/\s+/).map(w => w.replace(/[.,]/g, '')).filter(w => w && !CASE_SKIP.has(w.toLowerCase()));
    const name = (pl[0] || m[2]).toLowerCase();
    return name.length > 2 ? 'C:' + name : null;
  }],
];

// "Section 3.2 of the CC&Rs" / "Article IV, Section 3" are the owner's governing documents, not law.
const GOVDOC_AFTER = /^[^.;\n]{0,50}\b(CC&R|CCR|Declaration|Bylaw|By-law|Covenant|Governing Document|Rules and Regulation|Articles of)/i;
const GOVDOC_BEFORE = /(Article|Art\.)\s+[IVXLC\d]+[,.]?\s*$/i;

export function extractCitations(text) {
  const out = [];
  const src = String(text || '');
  for (const [re, fn] of PATTERNS) {
    re.lastIndex = 0;
    for (const m of src.matchAll(re)) {
      if (/^\\bSection/.test(re.source)) {
        if (GOVDOC_AFTER.test(src.slice(m.index + m[0].length, m.index + m[0].length + 80))) continue;
        if (GOVDOC_BEFORE.test(src.slice(Math.max(0, m.index - 30), m.index))) continue;
      }
      const k = canon(fn(m));
      if (k && !/^S:$|^S:FED\d+-$/.test(k) && k.length > 3) out.push({ key: k, text: m[0].trim().slice(0, 80), index: m.index });
    }
  }
  return out;
}

// "S:5600-5615" -> every section in the range (cap 80) so § 5605 passes when §§ 5600-5615 is verified.
export function rangeKeys(key) {
  const m = /^S:(\d+)-(\d+)$/.exec(key);
  if (!m) return [key];
  const a = +m[1], b = +m[2];
  if (b < a || b - a > 80) return [key];
  const out = [key];
  for (let i = a; i <= b; i++) out.push('S:' + i);
  return out;
}

export function findUnverified(text, allowed) {
  const seen = new Set();
  const bad = [];
  for (const c of extractCitations(text)) {
    if (allowed.has(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    bad.push(c);
  }
  return bad;
}

function splitSentences(s) {
  const out = []; let start = 0;
  const re = /[.!?]["')\]]?\s+(?=[A-Z"(§\[])/g; let m;
  while ((m = re.exec(s))) {
    const word = s.slice(start, m.index + 1).split(/[\s—–/(]+/).pop();
    if (/\..*\.$/.test(word) || /^\(?([A-Z][a-z]{0,4}|[a-z]{1,3}|[A-Z](\.[A-Z])*|§+|\d+[A-Za-z]?)\.$/.test(word)) continue;
    out.push(s.slice(start, m.index + m[0].length)); start = m.index + m[0].length;
  }
  out.push(s.slice(start));
  return out;
}

// Remove every sentence that carries one of the bad citations; paragraph breaks are preserved.
export function stripSentences(text, bad) {
  const keys = new Set(bad.map(b => b.key));
  return String(text).split(/(\n{2,})/).map(part => {
    if (/^\n{2,}$/.test(part)) return part;
    return splitSentences(part).filter(sen => !extractCitations(sen).some(c => keys.has(c.key))).join('');
  }).join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}

// Citation strings only; never letter text, names, or addresses.
export function logHit(app, info) {
  try {
    console.log(JSON.stringify({ evt: 'citelint', app, ...info }));
  } catch { /* logging must never break generation */ }
}
