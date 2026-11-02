// scripts/verified-on.mjs — the verified_on contract for VERIFICATION_LOG-SEO-CONTENT.md.
//
// FORMAT (machine readable):
//   * Every table in the log carries a LAST column headed `verified_on`; every data row ends with a YYYY-MM-DD cell.
//   * Every source bullet ("  - [tag] https://... (retrieved ...)") ends with ` verified_on: YYYY-MM-DD`.
//   * VERIFICATION_LOG.md entries carry their date in the heading ("### YYYY-MM-DD — citation"); that date is their verified_on.
// A row/bullet is an ENTRY. Dates are the day the entry's current text was verified (git history of the log for backfill,
// today's date for new entries — `node scripts/stamp-verified-on.mjs` does both).
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BULLET = /^\s+- \[[^\]]+\] https?:\/\//;
const SEP = /^\|[\s:|-]+\|?\s*$/;
const cellsOf = ln => ln.replace(/\s+$/, '').split('|').slice(1, -1).map(c => c.trim());

// Returns [{ line (0-based), kind: 'row'|'bullet', date: string|null, label }]
export function parseEntries(text) {
  const lines = text.split(/\r?\n/), out = [];
  let tableHasCol = null; // null = not in a table
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\|/.test(ln)) {
      if (tableHasCol === null) {                       // header row of a new table
        const hc = cellsOf(ln);
        tableHasCol = hc.at(-1) === 'verified_on';
        continue;
      }
      if (SEP.test(ln)) continue;
      const c = cellsOf(ln);
      const last = c.at(-1);
      out.push({ line: i, kind: 'row', date: tableHasCol && DATE_RE.test(last) ? last : null, label: (c[0] || '').slice(0, 70) });
      continue;
    }
    tableHasCol = null;
    if (BULLET.test(ln)) {
      const m = /\bverified_on: (\d{4}-\d{2}-\d{2})\s*$/.exec(ln);
      out.push({ line: i, kind: 'bullet', date: m ? m[1] : null, label: ln.trim().slice(0, 70) });
    }
  }
  return out;
}

// Add the verified_on column/field wherever it is missing. dateFor(lineIndex) -> YYYY-MM-DD. Idempotent; CRLF preserved.
export function stamp(text, dateFor) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let inTable = null, hasCol = false, stamped = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (/^\|/.test(ln)) {
      if (inTable === null) {
        inTable = true; hasCol = cellsOf(ln).at(-1) === 'verified_on';
        if (!hasCol) lines[i] = ln.replace(/\s+$/, '') + ' verified_on |';
        continue;
      }
      if (SEP.test(ln)) { if (!hasCol) lines[i] = ln.replace(/\s+$/, '') + '---|'; continue; }
      if (!DATE_RE.test(cellsOf(ln).at(-1))) { lines[i] = ln.replace(/\s+$/, '') + ' ' + dateFor(i) + ' |'; stamped++; }
      continue;
    }
    inTable = null;
    if (BULLET.test(ln) && !/\bverified_on: \d{4}-\d{2}-\d{2}\s*$/.test(ln)) { lines[i] = ln.replace(/\s+$/, '') + ' verified_on: ' + dateFor(i); stamped++; }
  }
  return { text: lines.join(eol), stamped };
}

// ── staleness ───────────────────────────────────────────────────────────────
// Whole calendar months from ISO date `d` to ISO date `now` (partial month not counted).
export function monthsBetween(d, now) {
  const [y1, m1, d1] = d.split('-').map(Number), [y2, m2, d2] = now.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}
// Status of an ISO date against `now` (ISO). "More than N months before today": older than the same calendar day N months ago.
//   > 12 months -> 'fail';  > 10 months -> 'warn';  else 'ok'.
export function classify(d, now) {
  const ago = n => { const [y, mo, da] = now.split('-').map(Number); return new Date(Date.UTC(y, mo - 1 - n, da)).toISOString().slice(0, 10); };
  if (d < ago(12)) return 'fail';
  if (d < ago(10)) return 'warn';
  return 'ok';
}
