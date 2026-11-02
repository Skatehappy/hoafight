// api/_lock.js — shared citation + figure lock used by generate.js and checklist.js.
// Pure functions (edge- and Node-safe). The verified set is generated from VERIFICATION_LOG*.md by
// scripts/build-verified-citations.mjs.
import VERIFIED from './_verified-citations.js';
import { findUnverified, findUnverifiedFigures, numericClaims, describeFigure, stripProblems, logHit } from './_citelint.js';

export { logHit };

const STATE_ABBR = { california: 'CA', texas: 'TX', florida: 'FL', 'new york': 'NY', illinois: 'IL', pennsylvania: 'PA', ohio: 'OH', georgia: 'GA', 'north carolina': 'NC', arizona: 'AZ' };

export function resolveStateValue(raw) {
  raw = String(raw || '').trim();
  if (!raw) return null;
  const up = raw.toUpperCase();
  if (up.length === 2 && VERIFIED.states[up]) return up;
  return STATE_ABBR[raw.toLowerCase()] || null;
}

const stateKeys = () => Object.keys(VERIFIED.states).filter(s => !s.startsWith('_'));

export function allowedKeys(abbr) {
  const set = new Set(VERIFIED.federal.keys);
  if (abbr && VERIFIED.states[abbr]) VERIFIED.states[abbr].keys.forEach(k => set.add(k));
  else for (const s of stateKeys()) VERIFIED.states[s].keys.forEach(k => set.add(k));
  return set;
}

export function allowedSubs(abbr) {
  const out = {};
  const merge = src => { for (const [k, v] of Object.entries(src || {})) out[k] = [...new Set([...(out[k] || []), ...v])]; };
  merge(VERIFIED.federal.subs);
  if (abbr && VERIFIED.states[abbr]) merge(VERIFIED.states[abbr].subs);
  else for (const s of stateKeys()) merge(VERIFIED.states[s].subs);
  return out;
}

// Figures that may appear: verified state/federal figures, plus any figure the caller's own text already contains
// (the owner's facts and the request prompts).
export function allowedFigures(abbr, ...ownTexts) {
  const set = new Set(VERIFIED.federal.nums || []);
  if (abbr && VERIFIED.states[abbr]) (VERIFIED.states[abbr].nums || []).forEach(k => set.add(k));
  else for (const s of stateKeys()) (VERIFIED.states[s].nums || []).forEach(k => set.add(k));
  for (const t of ownTexts) for (const c of numericClaims(t)) set.add(c.key);
  return set;
}

export function lockBlock(abbr) {
  const shown = new Set(VERIFIED.federal.display);
  if (abbr && VERIFIED.states[abbr]) VERIFIED.states[abbr].display.forEach(d => shown.add(d));
  const list = [...shown].slice(0, 90).join('; ') || '(none verified for this state)';
  const figs = [...new Set([...(VERIFIED.federal.nums || []), ...((abbr && VERIFIED.states[abbr] && VERIFIED.states[abbr].nums) || [])])].map(describeFigure).slice(0, 60).join('; ') || '(none)';
  return `\n\nCITATION RULE (enforced by the server): cite ONLY these verified authorities${abbr ? ` for ${abbr}` : ''}: ${list}. Cite a subsection letter or number (such as "(c)") only if it is written in that list; otherwise cite the section alone. Cite nothing else: no other statute, regulation, rule, or court case, and no invented section numbers, even if you believe it exists. If a point needs authority that is not on the list, make the point without a citation.\n\nFIGURE RULE (enforced by the server): state a dollar amount, percentage, or number of days, hours, months or years ONLY if it appears in the owner's facts or in this verified list: ${figs}. Do not state any other statutory deadline, penalty or fee figure; describe it without a number instead.`;
}

// Lint one text. Returns { cites, figs }.
export function lintText(text, abbr, ...ownTexts) {
  const allowed = allowedKeys(abbr), subs = allowedSubs(abbr), figs = allowedFigures(abbr, ...ownTexts);
  return { cites: findUnverified(text, allowed, subs), figs: findUnverifiedFigures(text, figs) };
}

export function stripText(text, abbr, ...ownTexts) {
  return stripProblems(text, allowedKeys(abbr), allowedSubs(abbr), allowedFigures(abbr, ...ownTexts));
}

export function problemList(p) {
  return [...p.cites.map(c => c.text), ...p.figs.map(f => f.text)];
}
