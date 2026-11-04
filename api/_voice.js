// api/_voice.js - the letter is written and signed by the homeowner in their own name, never by an attorney or firm.
// Pure (edge/Node/browser safe). Shared by src/App.jsx (prompts), api/generate.js and api/checklist.js (lint).
export const VOICE_RULE = 'The letter is written and signed by the homeowner in their own name ([Your Name]). Never describe the writer as an attorney, counsel, law firm or representative and never sign for a client.';

// Each pattern is a signature / self-description of a lawyer writing for a client. Narrow on purpose: "you may wish to consult an
// attorney", "attorney's fees", "counsel for the HOA" and "consult counsel for advice" must NOT match.
const ROLE = '(?:attorney|counsel)';
const CLIENTISH = String.raw`(?:the\s+)?(?:home\s?owners?|owners?|residents?|members?|undersigned|clients?|petitioners?|complainants?|\[)`;
const PATTERNS = [
  ['Esq.', /\besq\b/],
  ['Esquire', /\besquire\b/],
  ['Attorney for', new RegExp(String.raw`\b` + ROLE + String.raw`\s+for\s+` + CLIENTISH)],
  ['Attorney for', new RegExp(String.raw`\bas\s+(?:the\s+|your\s+)?` + ROLE + String.raw`\s+for\b`)],
  ['Attorney for', new RegExp(String.raw`^[ \t]*` + ROLE + String.raw`\s+for\b(?!\s+(?:the\s+)?(?:hoa|association|board|community|management|developer|declarant|company|corporation|city|county|state)\b)[^.!?\n]{0,60}$`, 'm')],
  ['on behalf of my client', /\bon\s+behalf\s+of\s+(?:my|our)\s+clients?\b/],
  ['my client', /\b(?:my|our)\s+clients?\b/],
  ['this firm represents', /\b(?:this|our)\s+(?:law\s+)?firm\s+(?:represents|has\s+been\s+retained)\b/],
  ['attorney at law', /\battorneys?\s+(?:and\s+counsel(?:or|lor)?\s+)?at\s+law\b/],
  ['law office of', /\blaw\s+offices?\s+of\b/],
];

const norm = s => String(s || '')
  .replace(/[‘’‛′]/g, "'").replace(/[“”‟]/g, '"')
  .replace(/[  -​ ⁠﻿]/g, ' ')
  .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n')
  .toLowerCase().replace(/\be ?s ?q ?\./g, 'esq.');

// Returns the banned phrases (labels) found, [] when clean.
export function findAttorneyVoice(text) {
  const t = norm(text), hits = [];
  for (const [label, re] of PATTERNS) if (re.test(t) && !hits.includes(label)) hits.push(label);
  return hits;
}
