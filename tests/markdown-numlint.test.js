// stripMarkdown + spelled-out figure lint (pure functions, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripMarkdown } from '../api/_markdown.js';
import { numericClaims, findUnverifiedFigures } from '../api/_citelint.js';
import { lintText, stripText, allowedFigures } from '../api/_lock.js';

// ---- markdown ---------------------------------------------------------------------------------------------------------
test('stripMarkdown: headings, bold, italics, bullets, tables, code fences, links', () => {
  const src = '# Formal Appeal\n\n## Facts\n\n**VIA CERTIFIED MAIL** and __bold__ and *italic* and _also_.\n\n* one\n- two\n+ three\n\n| Item | Amount |\n|---|---|\n| Fine | $150 |\n\n```\ncode line\n```\n\nSee [the rules](https://x.y) and `inline`.\n\n---\n\n> quoted\n\nSincerely,\n\n________________\nAlex';
  const out = stripMarkdown(src);
  assert.ok(!/[#*|`>]|__bold|\]\(|---/.test(out.replace(/_{4,}/g, '')), out);
  assert.ok(out.includes('Formal Appeal') && out.includes('VIA CERTIFIED MAIL and bold and italic and also.'));
  assert.ok(out.includes('- one\n- two\n- three'));
  assert.ok(out.includes('Item, Amount') && out.includes('Fine, $150'));
  assert.ok(out.includes('code line') && !out.includes('```'));
  assert.ok(out.includes('See the rules and inline.'));
  assert.ok(out.includes('________________'), 'signature line kept');
});

test('stripMarkdown: plain letters, math-like asterisks, snake_case and CRLF survive', () => {
  const plain = 'Dear Board,\n\nI paid 5 * 3 and 2*3*4 and snake_case_name.\n\n1. First point.\n2. Second point.\n\nSincerely,\nAlex';
  assert.equal(stripMarkdown(plain), plain);
  assert.equal(stripMarkdown('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
  assert.equal(stripMarkdown(null), ''); assert.equal(stripMarkdown(undefined), '');
});

test('stripMarkdown: output is stable (idempotent)', () => {
  const src = '**Re: Fine**\n\n* a *b* c\n\n| x | y |\n|---|---|';
  assert.equal(stripMarkdown(stripMarkdown(src)), stripMarkdown(src));
});

// ---- spelled-out figures ------------------------------------------------------------------------------------------------------
const keys = t => numericClaims(t).map(c => c.key);
test('numericClaims reads spelled-out figures into the same keys as the digit forms', () => {
  assert.deepEqual(keys('within thirty (30) days'), ['day:30']);
  assert.deepEqual(keys('within thirty days'), ['day:30']);
  assert.deepEqual(keys('thirty-five days'), ['day:35']);
  assert.deepEqual(keys('sixty-five (65) days'), ['day:65']);
  assert.deepEqual(keys('one hundred twenty days'), ['day:120']);
  assert.deepEqual(keys('a ninety-day notice'), ['day:90']);
  assert.deepEqual(keys('ten percent'), ['pct:10']);
  assert.deepEqual(keys('ten (10) percent'), ['pct:10']);
  assert.deepEqual(keys('five hundred dollars'), ['usd:500']);
  assert.deepEqual(keys('five hundred (500) dollars'), ['usd:500']);
  assert.deepEqual(keys('two thousand five hundred dollars'), ['usd:2500']);
  assert.deepEqual(keys('150 dollars'), ['usd:150']);
  assert.deepEqual(keys('ten to fifteen days').sort(), ['day:10', 'day:15']);
  assert.deepEqual(keys('six months'), ['month:6']);
  assert.deepEqual(keys('two years'), ['year:2']);
  assert.deepEqual(keys('within 30 days'), ['day:30']);
  assert.deepEqual(keys('thirty (45) days').sort(), ['day:30', 'day:45'], 'a mismatched parenthetical is checked too');
});

test('spelled-out unverified figures are caught (FL), and the sentence is stripped', () => {
  const own = 'I received a $150 fine on March 15, 2026. Fine rescinded in full.';
  for (const bad of ['You must respond within seventy-seven (77) days.', 'You must respond within seventy-seven days.', 'A late fee of nine hundred ninety-nine dollars applies.', 'The board may add a twelve percent penalty.', 'Notice is required within forty-three (43) days.', 'The limit is three years.'] ) {
    const p = lintText(bad, 'FL', own);
    assert.ok(p.figs.length > 0, 'not caught: ' + bad);
    const out = stripText('Dear Board, I dispute the fine.\n\n' + bad + ' Please rescind it.', 'FL', own);
    assert.ok(!out.includes(bad), 'not stripped: ' + bad);
    assert.ok(out.includes('Dear Board'));
  }
});

test('verified and user-supplied figures are never flagged, in digits or spelled out', () => {
  // FL verified set holds day:10, usd:100, pct:80, year:1 (api/_verified-citations.json)
  const verifiedForms = ['within ten (10) days', 'within ten days', 'a fine of one hundred dollars', 'a fine of $100', 'eighty percent', 'one year', 'one (1) year'];
  for (const t of verifiedForms) assert.equal(lintText(t, 'FL', '').figs.length, 0, t);
  // owner's own facts: $150 fine, 30 days deadline, 2 hours
  const own = 'FINE AMOUNT: $150\nRESPONSE DEADLINE: 30 days\nI removed it within 2 hours.';
  for (const t of ['a fine of one hundred fifty dollars', 'a $150 fine', 'within thirty (30) days', 'within thirty days', 'a thirty-day response period', 'after two hours']) assert.equal(lintText(t, 'FL', own).figs.length, 0, t);
  // owner wrote it spelled out, model uses digits
  assert.equal(lintText('within 45 days', 'FL', 'Please reply within forty-five days.').figs.length, 0);
  // figures the lint does not look at
  for (const t of ['within a year', 'a few days', 'March 15, 2026', 'Unit 4B', 'the 2026 budget', 'page 3 of 5']) assert.equal(lintText(t, 'FL', '').figs.length, 0, t);
});

test('findUnverifiedFigures: allowed set is exact', () => {
  const allowed = allowedFigures('FL', 'owner paid $150');
  assert.equal(findUnverifiedFigures('thirty days', allowed).length, 1);
  assert.equal(findUnverifiedFigures('one hundred fifty dollars', allowed).length, 0);
});
