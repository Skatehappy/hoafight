# HOAFight Crawl Recovery — Diagnosis

Repo: `Skatehappy/hoafight` (Vercel). Working copy: `C:\NEWEST OF THE NEW\hoafight` @ origin/master.
Date: 2026-08-31. Directive: HOAFight Crawl Recovery.

---

## Gate 1 — Diagnose (before any change)

### 1. Canonical host check

| Source | Host observed |
|---|---|
| Production `sitemap.xml` — first 5 `<loc>` | `https://hoafight.com` (all 5) |
| Rendered `/california` `<link rel="canonical">` | `https://hoafight.com/california` |
| Rendered `/california/hoa-fine-dispute-letter` canonical | `https://hoafight.com/california/hoa-fine-dispute-letter` |
| Rendered `/texas/hoa-election-challenge` canonical | `https://hoafight.com/texas/hoa-election-challenge` |
| Rendered `/` (→ `/landing.html`) canonical | `https://hoafight.com` |

**Sitemap host = `https://hoafight.com`. Canonical host = `https://hoafight.com`.**
**Result: EXACT MATCH (scheme + host). ✅**

> Decision rule → hosts match → **proceed to Gate 2**. No host-mismatch remediation required.

The generator (`scripts/build-pages.js`) derives both the sitemap host and every page canonical from a single source, `APP_CONFIG.domain = "hoafight.com"` (`scripts/data/config.js`), so drift is structurally prevented.

### 2. Sitemap contents

Production `sitemap.xml`: **112 URLs total** (identical to committed `public/sitemap.xml`).

| Category | Count |
|---|---|
| Homepage `/` | 1 |
| `/letters` hub | 1 |
| State hubs `/{state}` (no 2nd segment) | 10 |
| Matrix cells `/{state}/{topic}` | 100 |
| **Total** | **112** |
| `/app` URLs | **0** |
| Query-string URLs | **0** |

Sitemap is already free of `/app` and query-string URLs. No sitemap URL removal needed.

### 3. Internal link graph

**Homepage → 10 state hubs (reachable by anchor from `/` within 1 hop):**

| State hub | Anchor on homepage? |
|---|---|
| arizona | ❌ NO |
| california | ❌ NO |
| florida | ❌ NO |
| georgia | ❌ NO |
| illinois | ❌ NO |
| new-york | ❌ NO |
| north-carolina | ❌ NO |
| ohio | ❌ NO |
| pennsylvania | ❌ NO |
| texas | ❌ NO |

**0 / 10 state hubs are linked from the homepage.** Confirmed on both the committed `public/landing.html` and the live production homepage (`curl -sL https://hoafight.com/`). The homepage footer links only to `/letters` and `/app`. **This is the crawl-recovery defect: all 10 state hubs (and transitively the 100 cells) are orphaned from `/` — reachable only via the sitemap, not the on-page link graph.**

**State hub → its 10 cells (sampled 5, then swept all 10 hubs):**
All 10 hubs render server-side anchors to all 10 of their cells (10/10 each). ✅ No fix needed.

**Matrix cell → siblings + parent (swept all 100 cells):**
Every cell renders 1 anchor back to `/{state}` and 9 anchors to its sibling topics (correctly excluding self). 0 / 100 cells fail the pattern. ✅ No fix needed.

### Diagnosis summary

- Canonical/sitemap host: **match** — no host work.
- Sitemap: **already clean** of `/app` + query strings.
- Hub→cell and cell→sibling/parent link graph: **already complete** (generator-produced).
- **Single real defect: the homepage does not link to any state hub** → orphaned state cluster.
- Secondary hardening per directive: `robots.txt` has no `Disallow: /app` (the `/app` SPA is crawlable but not in the sitemap).

---

## Gate 2 — Changes

1. **Homepage state-hub index (the fix).** Added a server-rendered `<section id="states">` to `public/landing.html` (a static, non-generated file) immediately before the bottom CTA, with plain `<a>` anchors to all 10 state hubs plus a link to `/letters`. Present in the initial HTML — no client JS. Verified in source and in the `vite build` output (`dist/landing.html`).
2. **`Disallow: /app`.** Added to `public/robots.txt` **and** to the robots string in `scripts/build-pages.js` (so a future regeneration keeps it). The `/app` SPA stays functional but is no longer offered to crawlers; it was never in the sitemap.
3. **Sitemap `/app` removal.** No-op — the generator never emitted `/app`/query-string URLs; production sitemap already had 0. Left as-is.
4. **Cell sibling links / hub→cell links.** No-op — the generator (`state-hub-template.js`, `deep-page-template.js`) already renders all hub→10-cell and cell→(parent + 9 siblings) anchors server-side. Swept all 10 hubs + all 100 cells: 0 failures. No change made.

Local `npm run build` (vite) succeeds; `dist/` contains all 10 homepage hub anchors, `robots.txt` with `Disallow: /app`, and all 100 cell pages.

## Gate 2.5 — Verification

Script: `scripts/verify-linkgraph.mjs` (imports `STATES`/`DISPUTES`/`APP_CONFIG`; fetches the deployed site; exits non-zero on any failure). Assertions: `/`→10 hubs, each hub→10 cells, each cell→its hub, 0 `/app` in sitemap, sitemap host == canonical host on a sampled page.

**Pre-deploy run against production (baseline — proves the script detects the defect):**
```
PASSED assertions: 202
FAILURES (10): homepage / missing anchor to state hub /california ... /arizona
RESULT: FAIL   (exit 1)
```
The 202 passing assertions confirm hub→cell (100), cell→hub (100), sitemap-clean (1), host-match (1) were already correct; only the 10 homepage→hub anchors were missing.

**Built-artifact verification (pre-deploy, filesystem-level against `dist/` — what Vercel serves):**
All five assertion groups run against the local `vite build` output:
```
home -> 10 state hubs .......... 10/10  ✅
each hub -> its 10 cells ...... 100/100 ✅
each cell -> its state hub .... 100/100 ✅
0 /app URLs in sitemap.xml ..... PASS   ✅
sitemap host == canonical host . PASS (https://hoafight.com == https://hoafight.com) ✅
TOTAL: PASS=212 FAIL=0
```
This proves the shipped artifact is correct. The homepage assertions that FAILED against live production (baseline above) now PASS in the build.

**Post-deploy run against production (`https://hoafight.com`, 2026-08-31):** ✅ **PASS**
Rob supplied a fresh Skatehappy classic PAT; commit `274b62f` was pushed to `Skatehappy/hoafight` master (`638345d..274b62f`), Vercel auto-deployed, and the deploy was confirmed live (homepage now links all 10 hubs; `robots.txt` serves `Disallow: /app`).
```
node scripts/verify-linkgraph.mjs
Verifying link graph against https://hoafight.com
PASSED assertions: 212
RESULT: PASS — link graph intact, sitemap clean, hosts aligned.   (exit 0)
```
212 assertions: home→10 hubs, each hub→10 cells, each cell→its hub, 0 `/app` in sitemap, sitemap host == canonical host. **Crawl recovery complete and verified in production.**

_(Note: the old classic PAT `ghp_8UakzJ…` had expired — 401 Bad credentials. Superseded by the fresh PAT Rob supplied this session.)_
