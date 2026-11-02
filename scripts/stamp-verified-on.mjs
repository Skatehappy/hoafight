// scripts/stamp-verified-on.mjs — give every undated log entry a verified_on date.
// Undated rows/bullets already committed get the author date of the commit that last changed the line (git blame);
// uncommitted/new ones get today's date (override with --today YYYY-MM-DD).
//   node scripts/stamp-verified-on.mjs [file]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stamp } from './verified-on.mjs';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SEO_LOG = path.join(ROOT, 'VERIFICATION_LOG-SEO-CONTENT.md');
export const todayISO = () => new Date().toLocaleDateString('en-CA'); // local calendar day, YYYY-MM-DD

function blameDates(file) {
  const m = new Map(); // final line number (1-based) -> date
  try {
    const out = execFileSync('git', ['blame', '-w', '--line-porcelain', 'HEAD', '--', path.basename(file)], { cwd: path.dirname(file), encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    let ln = 0, t = 0, tz = '+0000';
    for (const l of out.split('\n')) {
      let x;
      if ((x = /^[0-9a-f]{40} \d+ (\d+)/.exec(l))) ln = +x[1];
      else if (l.startsWith('author-time ')) t = +l.slice(12);
      else if (l.startsWith('author-tz ')) { tz = l.slice(10); const s = tz[0] === '-' ? -1 : 1; const off = s * (+tz.slice(1, 3) * 3600 + +tz.slice(3, 5) * 60); m.set(ln, new Date((t + off) * 1000).toISOString().slice(0, 10)); }
    }
  } catch { /* not in git yet: everything is new */ }
  return m;
}

export function stampFile(file = SEO_LOG, today = todayISO()) {
  const text = fs.readFileSync(file, 'utf8');
  const bl = blameDates(file);
  // blame line numbers are those of HEAD; only trust them if the working file has the same line count prefix (unchanged lines)
  const headLines = (() => { try { return execFileSync('git', ['show', 'HEAD:' + path.basename(file)], { cwd: path.dirname(file), encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/); } catch { return []; } })();
  const cur = text.split(/\r?\n/);
  const headIdx = new Map(headLines.map((l, i) => [l.replace(/\s+$/, ''), i + 1]));
  const dateFor = i => { const h = headIdx.get(cur[i].replace(/\s+$/, '')); return (h && bl.get(h)) || today; };
  const r = stamp(text, dateFor);
  if (r.text !== text) fs.writeFileSync(file, r.text);
  return r.stamped;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ti = process.argv.indexOf('--today');
  const file = process.argv.slice(2).find((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--today') || SEO_LOG;
  console.log('stamped ' + stampFile(file, ti > -1 ? process.argv[ti + 1] : todayISO()) + ' entries in ' + path.basename(file));
}
