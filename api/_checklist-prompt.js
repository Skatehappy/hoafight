// api/_checklist-prompt.js - builds the checklist request (Edge-safe). Shared by api/checklist.js and the tests.
import { typeInfo } from './_checklist-fallbacks.js';
import { lockBlock } from './_lock.js';

export function buildChecklistPrompt(state, type, letterExcerpt, abbr, variant = {}) {
  const lock = variant.noLock ? '' : lockBlock(abbr);
  const excerpt = variant.noExcerpt ? '' : (letterExcerpt?.substring(0, 200) || '');
  const user = `Generate a practical checklist for a homeowner sending a letter to their HOA about ${typeInfo(type).focus}, as a JSON array of 8 to 10 strings. Every item is one plain action step of at most 25 words and fits this situation only. Always include sending the letter by certified mail with return receipt and keeping a copy. Return ONLY a valid JSON array, no other text.

State: ${state}
Situation: ${type || 'HOA dispute'}
Letter excerpt: ${excerpt}${lock}`;
  return { system: undefined, user };
}
