// Test for scripts/check-marketing-claims.mjs (A21): banned phrases fail, disclaimers pass, repo is clean.
import assert from 'node:assert/strict';
import { scanText, scanRepo, hasDisclaimer } from '../scripts/check-marketing-claims.mjs';
const bad = ['Attorney-quality letters', 'attorney quality letter', 'LAWYER-QUALITY', 'lawyer quality', 'attorney-grade', 'Lawyer-Grade', 'attorney-written', 'attorney-drafted',
  'Talk to a real lawyer', 'Get legal advice in minutes', 'the cost of an attorney exceeds', 'We give you legal advice', 'Attorney‑quality'];
for (const b of bad) assert.ok(scanText(b).length > 0, 'should flag: ' + b);
assert.ok(scanText('<meta name="description" content="AI-written, attorney-quality">', { html: true }).length, 'meta flagged');
assert.ok(scanText('<script type="application/ld+json">{"description":"attorney-quality"}</script>', { html: true }).length, 'JSON-LD flagged');
const ok = ['This is not legal advice.', 'FightMyHOA does not provide legal advice.', "It isn't legal advice", 'No legal advice is given here.', 'Letters are not legal advice. Consult a licensed attorney.',
  'The board may meet in executive session for specified matters (legal advice, pending litigation).', 'Consult a licensed attorney.'];
for (const g of ok) assert.deepEqual(scanText(g), [], 'should pass: ' + g);
assert.ok(hasDisclaimer('<p>Legal Disclaimer: this is not legal advice.</p>'));
assert.ok(hasDisclaimer('FightMyHOA is not a law firm and does not provide legal advice.'));
assert.ok(!hasDisclaimer('<p>Nothing here.</p>'));
const repo = scanRepo();
assert.deepEqual(repo, [], 'repo must be clean: ' + repo.slice(0, 5).join(' | '));
console.log('marketing-claims test passed');
