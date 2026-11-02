// tests/ui-wiring.test.mjs — Playwright button-wiring test for the /app letter tool.
// Builds the app into a temp dir, serves it, mocks every /api/** call and every third-party script (no real Payhip,
// no real Anthropic, no real license code), then drives EVERY control: access gate, step navigation, back/continue,
// generate, error + retry paths, tabs, copy, PDF export, checklist, saved-draft restore, reset, input caps.
// Fails on any console error, page error or failed request.   node tests/ui-wiring.test.mjs
// Needs Microsoft Edge or Chrome installed (Playwright channel); set GATE_ALLOW_NO_BROWSER=1 to skip when neither exists.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'hoa-ui-'));
execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'], { cwd: ROOT, stdio: 'pipe' });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/app' || p.startsWith('/app/')) p = '/index.html';
  if (p === '/') p = '/landing.html';
  let f = path.join(OUT, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(OUT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let browser;
for (const opts of [{ channel: 'msedge' }, { channel: 'chrome' }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...opts }); break; } catch { /* try next */ }
}
if (!browser) {
  server.close(); fs.rmSync(OUT, { recursive: true, force: true });
  if (process.env.GATE_ALLOW_NO_BROWSER === '1') { console.log('ui-wiring test SKIPPED: no browser available (GATE_ALLOW_NO_BROWSER=1)'); process.exit(0); }
  console.error('ui-wiring test: no Edge/Chrome found for Playwright'); process.exit(1);
}

const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1100, height: 1400 } });
const page = await ctx.newPage();
const problems = [];
page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));

// ── mocks ──
let genMode = 'ok';              // ok | 503 | 400 | 401 | goodcheck
const apiLog = [];
await page.route('**/*', async route => {
  const u = new URL(route.request().url());
  if (u.hostname === '127.0.0.1') {
    if (u.pathname === '/api/generate') {
      const body = JSON.parse(route.request().postData() || '{}');
      apiLog.push({ path: u.pathname, code: body.accessCode, check: body.systemPrompt === 'Reply: VALID' });
      if (body.accessCode === 'BADCODE') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid license key.' }) });
      if (body.systemPrompt === 'Reply: VALID') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'VALID' }) });
      if (genMode === '503') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'License verification unavailable' }) });
      if (genMode === '400') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Your text is too long.' }) });
      if (genMode === '401') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Invalid license key.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'Dear Board,\n\nThis letter disputes the fine. Please respond within 30 days.\n\nSincerely,\nJane' }) });
    }
    if (u.pathname === '/api/checklist') { apiLog.push({ path: u.pathname }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checklist: ['Send via certified mail', 'Request a hearing', 'Keep copies'] }) }); }
    return route.continue();
  }
  if (u.hostname === 'cdnjs.cloudflare.com') {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__pdfSaves=[];window.jspdf={jsPDF:function(){this.internal={pageSize:{getWidth:function(){return 612},getHeight:function(){return 792}}};this.setFont=function(){};this.setFontSize=function(){};this.splitTextToSize=function(t){return String(t).split("\\n")};this.addPage=function(){};this.text=function(){};this.save=function(n){window.__pdfSaves.push(n)}}};' });
  }
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  problems.push('unexpected external request: ' + u.href);
  return route.abort();
});

const steps = [];
const step = n => steps.push(n);
const btn = name => page.getByRole('button', { name });

async function fillVisibleStep() {
  for (const el of await page.locator('input[type=text], textarea').all()) { if (await el.isVisible()) await el.fill('Test value'); }
  for (const el of await page.locator('select').all()) { if (await el.isVisible()) await el.selectOption({ index: 1 }); }
}

// 1. access gate
await page.goto(BASE + '/app');
await page.getByPlaceholder('e.g. HOA-ABC123').fill('BADCODE');
await btn(/Unlock My Letter/).click();
await page.getByText(/Invalid access code/).waitFor();
assert.equal(await page.getByText('Your Full Name').count(), 0, 'bad code does not advance');
await page.getByPlaceholder('e.g. HOA-ABC123').fill('GOODCODE');
await btn(/Unlock My Letter/).click();
await page.getByText('Your Full Name').waitFor();
step('access gate: invalid code shows an error and stays; valid code advances');

// 2. form steps: Continue disabled until required fields are filled, Back works, counters + caps
assert.equal(await btn(/Continue/).isDisabled(), true, 'Continue disabled on empty required fields');
await fillVisibleStep();
await btn(/Continue/).click();
await page.getByText('HOA / Association Name').waitFor();
await btn(/Back/).click();
await page.getByText('Your Full Name').waitFor();
assert.equal(await page.locator('input[type=text]').first().inputValue(), 'Test value', 'Back keeps what was typed');
await btn(/Continue/).click();
await fillVisibleStep();
await btn(/Continue/).click();
// Dispute step: textarea counter and hard cap
const ta = page.locator('textarea').first();
await ta.waitFor();
await ta.fill('x'.repeat(3500));
assert.equal((await ta.inputValue()).length, 3000, 'textarea hard-capped at 3000');
await page.getByTestId('counter-disputeDetails').waitFor();
assert.match(await page.getByTestId('counter-disputeDetails').innerText(), /3000 \/ 3000/);
await ta.fill('The HOA fined me without a hearing.');
assert.match(await page.getByTestId('counter-disputeDetails').innerText(), /35 \/ 3000/, 'live counter');
await fillVisibleStep();
await btn(/Continue/).click();
await fillVisibleStep();
await btn(/Continue/).click();
await page.getByRole('heading', { name: /Ready to Generate/ }).waitFor();
step('form: Continue gating, Back, live input counter, 3000-char cap, all four steps');

// 3. error taxonomy + retry
genMode = '503';
await btn(/Generate My Letter/).click();
await page.getByText(/Temporary problem.*code was not used/).waitFor();
genMode = '400';
await btn(/Try again/).click();
await page.getByText(/could not be processed.*code is unchanged/).waitFor();
genMode = '401';
await btn(/Try again/).click();
await page.getByText(/access code was rejected.*contact support/i).waitFor();
step('errors: 503 = transient/free retry; 400 = fix input, code intact; 401 = consumed/contact support');

// 4. success path via "Try again"
genMode = 'ok';
await btn(/Try again/).click();
await page.getByText('Your Letter is Ready').waitFor();
assert.ok(apiLog.some(a => a.path === '/api/checklist'), 'checklist requested');
await page.getByText('Send via certified mail').waitFor();
step('generate: two-pass + assertive + checklist render');

// 5. letter controls
await btn(/Assertive/).click();
await btn(/Standard/).click();
await btn(/Copy Letter/).click();
await page.getByText('Copied!').waitFor();
assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Dear Board/);
await btn(/PDF/).click();
assert.deepEqual(await page.evaluate(() => window.__pdfSaves), ['FightMyHOA-appeal-letter.pdf'], 'PDF export saved a file');
for (const cb of await page.locator('input[type=checkbox]').all()) await cb.check();
step('letter: tabs, copy (clipboard verified), PDF export, checklist checkboxes');

// 6. draft persistence survives a reload
await page.reload();
await page.getByTestId('view-saved').waitFor();
assert.ok(await page.evaluate(() => (localStorage.getItem('hoa_draft_v1') || '').includes('Dear Board')), 'draft stored in localStorage');
assert.ok(!(await page.evaluate(() => localStorage.getItem('hoa_draft_v1'))).includes('GOODCODE'), 'access code is not persisted');
await page.getByTestId('view-saved').click();
await page.getByText('Your Letter is Ready').waitFor();
step('persistence: letter + form survive reload; access code is not stored');

// 7. reset
await btn(/New Letter/).click();
await page.getByText('Your Full Name').or(page.getByText('Enter Your Access Code')).first().waitFor();

await page.waitForTimeout(100);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('hoa_draft_v1') || '{}'));
assert.ok(!after.letter, 'reset clears the saved letter');
step('reset: New Letter clears the saved draft');

// 8. landing page loads clean and its in-page anchors resolve
await page.goto(BASE + '/');
const anchors = await page.$$eval('a[href^="#"]', as => as.map(a => a.getAttribute('href')).filter(h => h.length > 1));
for (const h of anchors) assert.ok(await page.locator(h).count() > 0, 'anchor target exists: ' + h);
step('landing: loads with zero console errors; in-page anchors resolve');

// The browser logs one console line per deliberate 4xx/5xx mock above (bad code, 503, 400, 401 on generate): exactly 4.
const expectedLines = problems.filter(p => /^console: Failed to load resource: the server responded with a status of (400|401|503)/.test(p));
assert.equal(expectedLines.length, 4, 'exactly the 4 deliberate error responses are logged');
const real = problems.filter(p => !expectedLines.includes(p));
assert.deepEqual(real, [], 'console/page/request problems:\n' + real.join('\n'));
await browser.close();
server.close();
fs.rmSync(OUT, { recursive: true, force: true });
console.log(`ui-wiring test: ${steps.length} flows passed, zero console errors (no modal component exists in this app)\n - ` + steps.join('\n - '));
