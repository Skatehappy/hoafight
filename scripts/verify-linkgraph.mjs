#!/usr/bin/env node
// Gate 2.5 — Crawl link-graph verifier.
// Fetches the DEPLOYED site and asserts the on-page internal link graph is
// intact so no page is orphaned. Exits non-zero on any failure.
//
// Usage:  node scripts/verify-linkgraph.mjs [baseUrl]
//         BASE_URL=https://hoafight.com node scripts/verify-linkgraph.mjs
// Default base is https://<APP_CONFIG.domain>.

import { STATES } from './data/states.js';
import { DISPUTES } from './data/disputes.js';
import { APP_CONFIG } from './data/config.js';

const BASE = (process.argv[2] || process.env.BASE_URL || `https://${APP_CONFIG.domain}`).replace(/\/+$/, '');
const failures = [];
const notes = [];
function fail(msg) { failures.push(msg); }
function ok(msg) { notes.push(msg); }

// Fetch a URL as text. Follows redirects (the homepage / -> /landing.html).
async function get(path) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'hoafight-linkgraph-verifier' } });
  const body = await res.text();
  return { status: res.status, body, finalUrl: res.url };
}

// True if the HTML contains an anchor whose href is EXACTLY `href` (closing
// quote immediately after — so `/california` does not match `/california/x`).
function hasAnchor(html, href) {
  return new RegExp(`href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html);
}

function hostOf(u) { try { const x = new URL(u); return `${x.protocol}//${x.host}`; } catch { return null; } }

// Small concurrency pool so we don't fire 100+ requests at once.
async function pool(items, worker, size = 8) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await worker(items[idx], idx); }
  }));
  return out;
}

console.log(`Verifying link graph against ${BASE}\n`);

// --- Check 1: homepage links to all 10 state hubs -------------------------
{
  const { status, body } = await get('/');
  if (status >= 400) fail(`homepage / returned HTTP ${status}`);
  for (const s of STATES) {
    if (hasAnchor(body, `/${s.slug}`)) ok(`/ -> /${s.slug}`);
    else fail(`homepage / missing anchor to state hub /${s.slug}`);
  }
}

// --- Check 2: each state hub links to all its cells -----------------------
await pool(STATES, async (s) => {
  const { status, body } = await get(`/${s.slug}`);
  if (status >= 400) { fail(`state hub /${s.slug} returned HTTP ${status}`); return; }
  for (const d of DISPUTES) {
    if (hasAnchor(body, `/${s.slug}/${d.slug}`)) ok(`/${s.slug} -> /${s.slug}/${d.slug}`);
    else fail(`state hub /${s.slug} missing anchor to cell /${s.slug}/${d.slug}`);
  }
});

// --- Check 3: each cell links back to its state hub -----------------------
const cells = STATES.flatMap(s => DISPUTES.map(d => ({ s, d })));
await pool(cells, async ({ s, d }) => {
  const { status, body } = await get(`/${s.slug}/${d.slug}`);
  if (status >= 400) { fail(`cell /${s.slug}/${d.slug} returned HTTP ${status}`); return; }
  if (hasAnchor(body, `/${s.slug}`)) ok(`/${s.slug}/${d.slug} -> /${s.slug}`);
  else fail(`cell /${s.slug}/${d.slug} missing anchor back to state hub /${s.slug}`);
});

// --- Check 4: no /app URLs in sitemap.xml ---------------------------------
let sitemapBody = '';
{
  const { status, body } = await get('/sitemap.xml');
  sitemapBody = body;
  if (status >= 400) fail(`sitemap.xml returned HTTP ${status}`);
  const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const appLocs = locs.filter(u => { try { return new URL(u).pathname.replace(/\/+$/, '') === '/app' || new URL(u).pathname.startsWith('/app/'); } catch { return /\/app(\/|$)/.test(u); } });
  if (appLocs.length) fail(`sitemap contains ${appLocs.length} /app URL(s): ${appLocs.join(', ')}`);
  else ok(`sitemap has 0 /app URLs (${locs.length} URLs total)`);
}

// --- Check 5: sitemap host matches canonical host on a sampled page -------
{
  const firstLoc = (sitemapBody.match(/<loc>([^<]+)<\/loc>/) || [])[1];
  const sitemapHost = firstLoc ? hostOf(firstLoc) : null;
  const sample = STATES[0].slug;
  const { body } = await get(`/${sample}`);
  const canon = (body.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    || body.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) || [])[1];
  const canonHost = canon ? hostOf(canon) : null;
  if (!sitemapHost) fail('could not extract host from sitemap first <loc>');
  else if (!canonHost) fail(`could not extract canonical from sampled page /${sample}`);
  else if (sitemapHost !== canonHost) fail(`host mismatch: sitemap=${sitemapHost} canonical(/${sample})=${canonHost}`);
  else ok(`host match: sitemap=${sitemapHost} == canonical=${canonHost}`);
}

// --- Report ---------------------------------------------------------------
console.log(`PASSED assertions: ${notes.length}`);
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`\nRESULT: FAIL`);
  process.exit(1);
} else {
  console.log(`\nRESULT: PASS — link graph intact, sitemap clean, hosts aligned.`);
  process.exit(0);
}
