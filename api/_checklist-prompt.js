// api/_checklist-prompt.js - builds the checklist request (Edge-safe). Shared by api/checklist.js and the tests.
//
// Why the wording matters (found by bisecting the live refusals, 2026-11): the model API's real-time safeguards returned
// stop_reason "refusal" (category "cyber") for prompts phrased as a checklist for a homeowner "sending a letter to their
// HOA ... as a JSON array" (reproducible, same input, 100%), and also for a system role / "has written a letter to their
// association" rewording; "responding to a fine from their homeowners association ... Output a JSON array of strings only"
// passed every time. So the request is a plain, neutral "document-organizing and record-keeping steps for responding to
// <situation>" ask, with no system role, no "sending a letter to their HOA", and the citation/figure lock block unchanged.
import { typeInfo } from './_checklist-fallbacks.js';
import { lockBlock } from './_lock.js';

export const NEUTRAL_FRAMING = 'practical document-organizing and record-keeping steps';

export function buildChecklistPrompt(state, type, letterExcerpt, abbr, variant = {}) {
  const lock = variant.noLock ? '' : lockBlock(abbr);
  const excerpt = variant.noExcerpt ? '' : (letterExcerpt?.substring(0, 200) || '');
  const user = `List 8 to 10 ${NEUTRAL_FRAMING} a homeowner can take when responding to ${typeInfo(type).focus}. Every item is one plain step of at most 25 words and fits this situation only. One item is mailing the response by certified mail with return receipt and keeping a copy. Output a JSON array of strings only, no other text.

State: ${state}
Situation: ${String(type || 'HOA dispute').replace('Board Harassment / ', '')}
Letter excerpt: ${excerpt}${lock}`;
  return { system: undefined, user };
}
