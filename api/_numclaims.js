// api/_numclaims.js - numeric claims (dollar, percent, time figures) found in a text. Pure, Edge/Node-safe.
// Re-exported by api/_citelint.js.
//
// Spelled-out figures are read with a small grammar (one..nineteen, twenty..ninety with an optional hyphenated unit,
// "N hundred [and] M", "N thousand [M]") so "thirty (30) days", "thirty-five days", "ten percent" and "five hundred dollars"
// produce the SAME keys as the digit forms ("day:30", "pct:10", "usd:500"). That is what keeps verified content safe: a verified
// "30 days" in a log entry also verifies "thirty days", and the owner's own "30 days" also allows "thirty (30) days".
// Units checked: dollars, percent, days, hours, weeks, months and years. Months and years are included because the verified sets
// already hold them under identical keys (the digit forms were always checked), so spelling them out cannot drop verified content.
// Not checked: "a year", "a week", "half" and similar non-numeric quantities.

const ONES = 'one|two|three|four|five|six|seven|eight|nine';
const TEENS = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const SUB100 = '(?:(?:' + TENS + ')(?:[-\\s](?:' + ONES + '))?|' + TEENS + '|' + ONES + ')';
const SUB1000 = '(?:(?:' + ONES + ')\\s+hundred(?:\\s+(?:and\\s+)?' + SUB100 + ')?|hundred|' + SUB100 + ')';
const WORDS = SUB1000 + '(?:\\s+thousand(?:\\s+' + SUB1000 + ')?)?';
const WORDVAL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const UNIT = '(?:(calendar|business|working|consecutive)[-\\s]+)?(day|hour|week|month|year)s?\\b';

export function wordsToNumber(x) {
  let total = 0, cur = 0;
  for (const t of String(x).toLowerCase().replace(/-/g, ' ').split(/\s+/)) {
    if (t === 'and' || !t) continue;
    if (t in WORDVAL) cur += WORDVAL[t];
    else if (t === 'hundred') cur = (cur || 1) * 100;
    else if (t === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
  }
  return total + cur;
}
const numOf = x => { const k = String(x).toLowerCase().replace(/,/g, ''); return /^[\d.]+$/.test(k) ? parseFloat(k) : wordsToNumber(k); };
const unitKey = (kind, unit, n) => (kind && /business|working/i.test(kind) ? 'b' : '') + unit.toLowerCase() + ':' + n;

export function numericClaims(text) {
  const out = [];
  let src = String(text || '');
  const push = (key, m) => out.push({ key, text: m.trim().slice(0, 60) });
  const A = '(\\d+(?:,\\d{3})*(?:\\.\\d+)?|' + WORDS + ')';
  const PAREN = '(?:\\s*\\(\\s*(\\d+(?:,\\d{3})*)\\s*\\))?';
  // A spelled-out figure followed by its own digits in parentheses: both are checked, so a mismatch ("thirty (45) days") is caught.
  const pushBoth = (key, n, p, m) => { push(key(numOf(n)), m); if (p && numOf(p) !== numOf(n)) push(key(numOf(p)), m); };
  // hyphenated compounds ("thirty-five") are one number, not a range: join them before the range pattern runs
  src = src.replace(new RegExp('\\b(' + TENS + ')-(' + ONES + ')\\b', 'gi'), '$1 $2');
  src = src.replace(/\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s*(million|thousand))?/gi, (m, n, mag) => {
    push('usd:' + parseFloat(n.replace(/,/g, '')) * (/million/i.test(mag || '') ? 1e6 : /thousand/i.test(mag || '') ? 1e3 : 1), m); return ' ';
  });
  src = src.replace(new RegExp('\\b' + A + PAREN + '\\s?(?:dollars?|USD)\\b', 'gi'), (m, n, p) => { pushBoth(v => 'usd:' + v, n, p, m); return ' '; });
  src = src.replace(new RegExp('\\b' + A + PAREN + '\\s?(?:%|per\\s?cent\\b)', 'gi'), (m, n, p) => { pushBoth(v => 'pct:' + v, n, p, m); return ' '; });
  src = src.replace(new RegExp('\\b' + A + '\\s*(?:-|–|to|or)\\s*' + A + '[-\\s]+' + UNIT, 'gi'), (m, a, b, kind, unit) => {
    push(unitKey(kind, unit, numOf(a)), m); push(unitKey(kind, unit, numOf(b)), m); return ' ';
  });
  src = src.replace(/\b(\d+)(?:st|nd|rd|th)\s+(?:(business|calendar|working)\s+)?day\b/gi, (m, n, kind) => { push(unitKey(kind, 'day', n), m); return ' '; });
  src.replace(new RegExp('(?:\\b' + A + PAREN + '|\\((\\d+)\\))[-\\s]+' + UNIT, 'gi'), (m, n, p, p2, kind, unit) => {
    if (p2) push(unitKey(kind, unit, numOf(p2)), m); else pushBoth(v => unitKey(kind, unit, v), n, p, m);
    return ' ';
  });
  return out;
}
