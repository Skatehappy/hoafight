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
      if (k && !/^S:$|^S:FED\d+-$/.test(k) && k.length > 3) {
        const entry = { key: k, text: m[0].trim().slice(0, 80), index: m.index };
        if (k.startsWith('S:')) {
          const sm = /^\s?((?:\([A-Za-z0-9]{1,4}\))+)/.exec(src.slice(m.index + m[0].length, m.index + m[0].length + 24));
          if (sm) { entry.sub = sm[1].toLowerCase(); entry.text = (entry.text + sm[1]).slice(0, 80); }
        }
        out.push(entry);
      }
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

// A cited subsection (the "(c)" in "§ 5855(c)") must be one the verified record for that section names.
// subs: { "S:5855": ["(a)", "(c)"] } (optional; when omitted only the section number is checked).
export function subsectionOk(cite, subs) {
  if (!cite.sub || !subs) return true;
  const have = new Set((subs[cite.key] || []).map(x => x.toLowerCase()));
  const parts = cite.sub.match(/\([A-Za-z0-9]{1,4}\)/g) || [];
  return parts.every(p => have.has(p.toLowerCase()));
}

export function findUnverified(text, allowed, subs) {
  const seen = new Set();
  const bad = [];
  for (const c of extractCitations(text)) {
    const id = c.key + (c.sub || '');
    if (seen.has(id)) continue;
    if (!allowed.has(c.key) || !subsectionOk(c, subs)) { seen.add(id); bad.push(c); }
  }
  return bad;
}

// Numeric claims: dollar, percent and time figures must come from verified state data, the owner's own facts or the
// request prompts. Anything else is regenerated once, then its sentence is stripped.
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, 'twenty-one': 21, 'twenty-five': 25, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90, 'one hundred': 100, hundred: 100 };
const WORDS = Object.keys(WORDNUM).sort((a, b) => b.length - a.length).join('|');
const UNIT = '(?:(calendar|business|working|consecutive)[-\\s]+)?(day|hour|week|month|year)s?\\b';
const numOf = x => { const k = String(x).toLowerCase().replace(/,/g, ''); return k in WORDNUM ? WORDNUM[k] : parseFloat(k); };
const unitKey = (kind, unit, n) => (kind && /business|working/i.test(kind) ? 'b' : '') + unit.toLowerCase() + ':' + n;

export function numericClaims(text) {
  const out = [];
  let src = String(text || '');
  const push = (key, m) => out.push({ key, text: m.trim().slice(0, 60) });
  src = src.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s*(million|thousand))?/gi, (m, n, mag) => {
    push('usd:' + parseFloat(n.replace(/,/g, '')) * (/million/i.test(mag || '') ? 1e6 : /thousand/i.test(mag || '') ? 1e3 : 1), m); return ' ';
  });
  src = src.replace(new RegExp('\\b(\\d+(?:\\.\\d+)?|' + WORDS + ')\\s?(?:%|percent\\b)', 'gi'), (m, n) => { push('pct:' + numOf(n), m); return ' '; });
  const A = '(\\d+|' + WORDS + ')';
  src = src.replace(new RegExp('\\b' + A + '\\s*(?:-|–|to|or)\\s*' + A + '[-\\s]+' + UNIT, 'gi'), (m, a, b, kind, unit) => {
    push(unitKey(kind, unit, numOf(a)), m); push(unitKey(kind, unit, numOf(b)), m); return ' ';
  });
  src = src.replace(/\b(\d+)(?:st|nd|rd|th)\s+(?:(business|calendar|working)\s+)?day\b/gi, (m, n, kind) => { push(unitKey(kind, 'day', n), m); return ' '; });
  src.replace(new RegExp('(?:\\b(\\d+|' + WORDS + ')(?:\\s*\\((\\d+)\\))?|\\((\\d+)\\))[-\\s]+' + UNIT, 'gi'), (m, n, p, p2, kind, unit) => {
    push(unitKey(kind, unit, numOf(p2 || p || n)), m); return ' ';
  });
  return out;
}

export function findUnverifiedFigures(text, allowedNums) {
  const seen = new Set();
  const bad = [];
  for (const c of numericClaims(text)) {
    if (allowedNums.has(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    bad.push(c);
  }
  return bad;
}

// Human-readable form of a figure key ("bday:10" -> "10 business days") for the model's allowed-figures list.
export function describeFigure(key) {
  const [k, v] = key.split(':');
  if (k === 'usd') return '$' + Number(v).toLocaleString('en-US');
  if (k === 'pct') return v + '%';
  const base = k.replace(/^b(?=day|hour|week|month|year)/, '');
  return v + ' ' + (base !== k ? 'business ' : '') + base + (v === '1' ? '' : 's');
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

// Remove every sentence for which pred(sentence) is true; paragraph breaks are preserved.
export function stripSentencesWhere(text, pred) {
  return String(text).split(/(\n{2,})/).map(part => {
    if (/^\n{2,}$/.test(part)) return part;
    return splitSentences(part).filter(sen => !pred(sen)).join('');
  }).join('').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
}

// Remove every sentence that carries one of the bad citations (a bad subsection removes only that subsection's cites).
export function stripSentences(text, bad) {
  const ids = new Set(bad.map(b => b.key + (b.sub || '')));
  return stripSentencesWhere(text, sen => extractCitations(sen).some(c => ids.has(c.key + (c.sub || ''))));
}

// Strip every sentence that still carries an unverified citation (section or subsection) or an unverified figure.
export function stripProblems(text, allowed, subs, allowedNums) {
  return stripSentencesWhere(text, sen => findUnverified(sen, allowed, subs).length > 0 || findUnverifiedFigures(sen, allowedNums).length > 0);
}

// Citation strings only; never letter text, names, or addresses.
export function logHit(app, info) {
  try {
    console.log(JSON.stringify({ evt: 'citelint', app, ...info }));
  } catch { /* logging must never break generation */ }
}
