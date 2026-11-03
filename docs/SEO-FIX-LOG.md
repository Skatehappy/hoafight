# FightMyHOA (hoafight.com) — SEO Crawl-Unstick Log (v2, CORRECT REPO)

Directive: `CC-DIRECTIVE-FightMyHOA-SEO-crawl-unstick-v2.md`
Date: 2026-06-27 · Mode: full-autonomy, log-and-continue · Standard: SSSCo/BuyAppsOnce v6.x
Repo: **`Skatehappy/hoafight`** (branch `master`) — cloned fresh to `C:\Users\jakld\hoafight-gh`.
(The v1 run used the stale local `C:\Users\jakld\hoafight`; this run is against the correct GitHub repo.)
Build only — **NOT deployed, NOT committed, NOT pushed.** Left as a working-tree diff for Rob to review.

---

## STEP 0–1 — Inventory (ground truth, correct repo)

- **Correct repo confirmed:** `public/` + `scripts/` present; commit log shows
  `5f41e68 "Programmatic SEO Phase 1: 10 states x 10 HOA dispute types"` and
  `d500d7b "Fix malformed empty url block in sitemap.xml"`.
- **Generator:** `scripts/build-pages.js`, data in `scripts/data/` (`states.js` = 10 states,
  `disputes.js` = 10 dispute types, `config.js`), templates in `scripts/templates/`
  (`state-hub-template.js`, `deep-page-template.js`). Content cache in `scripts/data/generated/`.
- **Pages:** **111** static HTML files in `public/` — 100 deep pages `public/{state}/{topic}/index.html`,
  10 state hubs `public/{state}/index.html`, plus `landing.html`. URL pattern `/{state}/{topic}`.
- **Static HTML confirmed:** letter content is in the raw HTML (server-served, Google-readable), not
  JS-injected. ✓
- **Sitemap:** valid XML, **111 `<loc>` entries** (1 home + 10 states + 100 deep), **0 malformed/empty
  url blocks** (the prior fix held).
- **Canonicals: CORRECT — self-referential** (`/{state}/{topic}` points to itself). The worst-case
  "all-canonical-to-homepage" bug that would collapse 111→1 is **NOT present**. (STEP 4.3, the
  highest-value check, came back clean.)
- **robots.txt:** present, `Allow: /`, references the sitemap. ✓
- **No stray `noindex`** on any page. ✓
- **Existing internal linking:** deep pages ALREADY cross-link **18 siblings each** (9 same-topic
  other-states + 9 other-topics same-state); state hubs link their 10 topics + other states. **STEP 3
  (cross-linking) was already implemented in the template and exceeds the 3–6 target.**

### ROOT CAUSE (confirmed)
**Orphan-from-homepage.** The programmatic cluster cross-links *itself* densely, but the **homepage
(`landing.html`, served at `/`) linked to NONE of it** — only to Payhip and the app. Google therefore
discovered the 97 `/{state}/{topic}` URLs via the sitemap **only** (the weakest crawl signal) and
deprioritized them → "Discovered – currently not indexed." It is exactly the internal-linking problem the
directive describes: nothing on the crawlable homepage pointed into the cluster with authority. Not a
canonical bug, not noindex, not dead sitemap URLs.

---

## STEP 2 — Link hub (the core fix)

- **New `scripts/templates/hub-template.js`** + generator wiring: `build-pages.js` now emits
  **`public/letters/index.html`** (served at **`/letters`** via the existing `/:state` Vercel rewrite).
- The hub lists **all 10 states** (`<h2>` linking each state hub) and **all 100 deep pages** as real,
  static `<a href>` with **descriptive anchor text** ("Arizona HOA Fine Dispute Letter", …), grouped by
  state. Verified: **100 deep-page links + 10 state-hub links**, all server-rendered in raw HTML.
- **Linked from the homepage:** added two crawlable `<a href="/letters">` links to `public/landing.html`
  — a hero button **"Browse Letters by State →"** and a footer link **"All HOA Dispute Letters by
  State."** Every deep page is now ≤2 clicks from `/` (home → `/letters` → page).

## STEP 3 — Cross-link siblings
- **Already present and sufficient** (18 static cross-links per deep page via `deep-page-template.js`).
  No change needed; verified on built pages. Selection rule already in place: same-topic-other-states +
  other-topics-same-state.

## STEP 4 — Sitemap + robots + canonicals
- **Sitemap regenerated** with `<lastmod>2026-06-27</lastmod>` on **every** entry (the legitimate
  re-crawl nudge) and the **new `/letters` hub** added (priority 0.9). Now **112 URLs**, valid XML, 0
  empty blocks. Priorities: `/` 1.0, `/letters` 0.9, states 0.8, deep pages 0.7.
- **robots.txt:** confirmed present + sitemap-referenced (generator re-emits it). ✓
- **Canonicals:** confirmed self-referential on a 3-page spot-check + the hub self-canonicals to
  `/letters`. ✓
- **noindex:** none. ✓

## STEP 5 — Build + verify (NOT deployed)
- `npm install` (fresh clone) then **`npm run generate:pages`** (reads cached content — no AI regen;
  10 hubs + 100 deep + hub + sitemap, **0 missing**) then **`npm run build`** (vite v5.4.21) →
  **succeeded**.
- **dist/ verified:** `dist/letters/index.html` present with 100 deep links; 111 page `index.html`s;
  `dist/sitemap.xml` = 112 URLs, lastmod 2026-06-27; `dist/landing.html` links `/letters` ×2.
- **Spot-check (3 deep pages):** each self-canonicals and carries 18 static cross-links. ✓
- **NOT deployed.**

---

## Diff for Rob to review (clean — content-only)
`git status` (working tree; `dist/` + `node_modules/` are gitignored):
- **M** `public/landing.html` — two `/letters` links (hero + footer).
- **M** `public/sitemap.xml` — lastmod=today on all + `/letters` entry (112 URLs).
- **M** `scripts/build-pages.js` — emit hub page; add lastmod + `/letters` to sitemap.
- **?? (new)** `scripts/templates/hub-template.js` — the hub template.
- **?? (new)** `public/letters/index.html` — the generated hub (will be committed as source).
- `landing.html.bak` (repo root) — safety backup of the landing page (untracked; not for commit).

Note: the 100 deep-page + 10 state-hub files were regenerated identically (content unchanged); the only
working-tree churn was CRLF/LF normalization, which I reverted so the diff stays clean. Their committed
versions already contain the 18-sibling cross-links.

**Rob: `git add scripts/templates/hub-template.js public/letters scripts/build-pages.js public/landing.html public/sitemap.xml`,
review the diff, commit, and push to `Skatehappy/hoafight` → Vercel deploys.**

---

## RELEASE GATE
- Rob reviews diff → pushes → Vercel production deploy.
- Rob requests indexing on **`https://hoafight.com/letters`** via GSC URL Inspection (crawling the hub
  surfaces all 100 deep links to Google in one fetch).
- Over 1–2 weeks the GSC "Discovered – currently not indexed: 97" count should fall.
- Success metric = the 97 dropping, not this report.

## Single most likely root cause (as required)
**Orphan-from-homepage / no authoritative internal links into the cluster** — confirmed, and now fixed by
the hub + homepage links. (Canonicals, noindex, robots, and sitemap validity were all checked and are
clean — none of the "worse" causes apply.)

## Out of scope / untouched (per directive)
`src/App.jsx`, `src/main.jsx`, app `index.html` (licensed shell); `api/generate.js`, `api/checklist.js`
(letter logic); page CONTENT (only links added, no content rewritten); app version (not bumped). Not
deployed.
