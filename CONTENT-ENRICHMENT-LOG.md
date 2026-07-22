# FightMyHOA — Content Enrichment Log (SEO Phase 2)

Started: 2026-07-22
Directive: CC-DIRECTIVE-All-Letter-Apps-Content-Enrichment.md (app 1 of 5, P0)
Standard: SSSCo/BuyAppsOnce v7 — build only, no deploy.

---

## STEP 0 — INVENTORY

**Generator:** `scripts/build-pages.js` reads AI-generated per-page JSON from
`scripts/data/generated/{state}/{dispute}.json` (produced by
`scripts/generate-content.js` via the Anthropic API) and renders HTML with the
templates in `scripts/templates/`. Output: `public/{state}/{dispute}/index.html`.

**States array (`scripts/data/states.js`):** 10 states — California, Texas,
Florida, New York, Illinois, Pennsylvania, Ohio, Georgia, North Carolina,
Arizona. **NOT 50.** (See DEVIATIONS.md #5.)

**Topics array (`scripts/data/disputes.js`):** 10 dispute types — fine dispute,
selective enforcement, architectural denial, records request, special
assessment, board harassment, lien/foreclosure threat, CC&R violation, election
challenge, discrimination/fair-housing.

**Page count:** 10 states × 10 disputes = 100 deep pages + 10 state hubs + 1
`/letters` hub = **111 pages**. Confirmed: `find public -name '*.html'` = 112
(111 + `public/letters/index.html` counted once; the 111 canonical URLs).

**Templates:** `deep-page-template.js` (per state×dispute page),
`state-hub-template.js` (per-state index), `hub-template.js` (`/letters`).

### STEP 0.4 — Indexed vs. non-indexed content difference (honest finding)

The directive's premise was that non-indexed pages are "thin, state-name-swapped"
templates and that thin-regulation states (WY/VT/ND) produce the weak pages.
**That premise does not match this repo:**

1. **There are no thin-regulation states in the generator.** All 10 states are
   major, heavily-regulated HOA states (CA Davis-Stirling, FL Ch. 720, TX Prop.
   Code 209, etc.). None of WY/VT/ND/MT exist here.
2. **Pages are already substantial.** Each already carries 1,100–1,200 words of
   AI-generated, state-specific content (intro, law explanation, letter
   strategy, procedural notes, 5 FAQs) plus `LegalService` + `FAQPage` JSON-LD
   and cross-links. Sampled `hoa-fine-dispute-letter` across FL/CA/TX/OH/GA/NY —
   each cites a *different* statute (Fla. Stat. §720.305 vs. Cal. Civ. Code
   §§5850-5865 vs. Tex. Prop. Code §§209.006-209.007, etc.) with different
   deadlines and penalties. So pages are already differentiated on the
   letter-specific axis.

**Real likely cause of the low index rate:** *structural* sameness, not word
count. Every state's page for a given topic uses the identical section skeleton
(same H2s: "…Law in [State]", "How a Demand Letter Works in [State]",
"Procedural Notes for [State]"), identical schema block shape, and prose of the
same shape. Google's helpful-content system can read 10 near-isomorphic pages
per topic as templated. The enrichment fix — injecting verified, structurally
distinct regulatory sections driven by a per-state data file (regulatory body,
fine committee rules, records deadlines, meeting notice, dispute-resolution
pathways, unique statutory protections, recent reforms) — adds genuinely
different *substance and structure* per state, which is the on-point remedy.

### STEP 0.5 — Technical SEO (fixed 2026-07-22)

- **Canonical tags:** already present and correct in all three templates —
  bare `https://hoafight.com/...` (no www, https, no trailing slash). No change
  needed.
- **Sitemap:** already bare-domain, no-www, no-trailing-slash. No change needed.
- **`vercel.json` homepage redirect (root cause of hoafight's GSC "Page with
  redirect" ×3 + "Alternate page with proper canonical" ×1):** the config had
  BOTH a rewrite `/` → `/landing.html` AND a 301 redirect `/` → `/landing.html`.
  Vercel processes redirects first, so the sitemap's priority-1.0 homepage
  (`https://hoafight.com/`) 301-redirected to `/landing.html`, while
  `landing.html`'s canonical points back to `/` — producing both flagged
  issues. **Fix:** removed the `/` redirect (the rewrite already serves the
  landing page at `/` with a 200 and matching canonical) and added a 301
  `/landing.html` → `/` so the `.html` alternate consolidates to the canonical
  root. No redirect chain/loop (redirects run before rewrites).
- **www → bare / http → https single-hop:** these are Vercel *domain-level*
  settings (project → Domains → redirect to production domain), not expressible
  cleanly in `vercel.json` here. Flagged for Rob to confirm in the Vercel
  dashboard. No in-repo change made.

---

## STEP 1 — STATE DATA FILE

- `scripts/data/state-data.json` — 10 states (CA, TX, FL, NY, IL, PA, OH, GA, NC,
  AZ), keyed by abbreviation, each with primary_hoa_statute (+ key_sections),
  condo_statute, regulatory_body, complaint_process, fine_limits, records_access,
  meeting_requirements, dispute_resolution, unique_protections, common_issues,
  last_major_reform.
- Research via **WebSearch** (Perplexity MCP not connected — DEVIATIONS.md #6),
  3 parallel research agents. Every value sourced in
  `VERIFICATION_LOG-SEO-CONTENT.md` — **46 sources**, URL + 2026-07-22 date.
- Genuine differentiation confirmed: CA/FL/NC have statutory fine caps ($100),
  TX/NY/IL/PA/OH/GA/AZ do not; records deadlines range 5-day (NY) → 10-business-day
  (CA/FL/TX/AZ) → 30-day (IL); forums range none/courts (NY/TX/OH/CA) →
  ombudsperson (IL) → AG Bureau of Consumer Protection (PA) → ADRE/OAH admin
  hearings (AZ). Recent reforms captured (CA AB 130 2025, FL HB 1203 2024,
  GA SB 406 2026, NC HB 444 2025, PA Act 115 2022, TX SB 711 2025).

## STEP 2 — GENERATOR CHANGES (portable to all 5 apps)

- New module `scripts/templates/enrichment.js` — assembles four verified sections
  from `state-data.json`, prose driven by each state's actual values (a $100-cap
  state reads differently from a no-cap state; an admin-forum state differently
  from a courts-only state). Exports `renderEnrichmentSections`, `dataFaqs`,
  `stateTeaser`, `stateLawSnapshot`. TOPIC_EMPHASIS maps each dispute slug to the
  data fields it foregrounds (fine dispute → fine_limits; records → records_access;
  election → meeting_requirements; enforcement → unique_protections; etc.).
- `deep-page-template.js` — injects the four `<section>`s (HOA Law Overview /
  Your Rights / How to File a Complaint / Common HOA Disputes) + a "Homeowner
  Protections Worth Knowing" list BELOW the existing content (after Procedural
  Notes, before the CTA). Existing content untouched. 2–3 data-derived Q&As merged
  into the visible FAQ AND the `FAQPage` JSON-LD (now 8 Qs/page).
- `state-hub-template.js` — adds a data-driven law snapshot paragraph.
- `hub-template.js` (`/letters`) — adds a per-state law teaser under each heading.
- `build-pages.js` — loads `state-data.json`, passes per-state data to the
  templates. Missing key ⇒ page renders without enrichment (fail-safe, never error).

## STEP 3 — REGENERATE + VERIFY

- `node scripts/build-pages.js` → 10 state hubs + 100 deep pages + 1 hub = **111
  pages** (unchanged; URLs identical; sitemap unchanged).
- Spot-checked FL, TX, NY, CA, GA, AZ: enrichment present, every JSON-LD block
  parses, FAQPage = 8 Qs, existing H2s intact, prose is state-specific and factually
  matches `VERIFICATION_LOG-SEO-CONTENT.md` (FL $100/$1,000 + independent fining
  committee + mandatory pre-suit mediation; NY no-statute/NPCL/business-judgment;
  AZ ADRE-OAH forum + $500 records penalty; each distinct).
- `node scripts/verify-gate.mjs` → GATE GREEN (A1 files; A9 citation-log parity,
  30/30). No broken HTML; article agreement fixed ("an Arizona").

## STEP 4 — CROSS-LINKS

- Deep pages already carry state-level "Other {State} Disputes" + "Same Dispute,
  Other States" clusters (prior v2 work) — retained. `/letters` hub now carries a
  law teaser per state (content-rich, not a bare link list). State hub carries a
  law snapshot.

## STEP 5 — TECHNICAL SEO (STEP 0.5) + COMMITS

- `vercel.json`: removed the redundant `/`→`/landing.html` 301 (the rewrite
  already serves the landing page at `/`); added `/landing.html`→`/` 301 so the
  `.html` alternate consolidates. Fixes hoafight's GSC "Page with redirect" ×3 +
  "Alternate page with proper canonical" ×1. Canonicals/sitemap already clean.
- Committed in two commits (technical SEO; content enrichment). NOT deployed —
  Rob deploys via GitHub→Vercel and resubmits the sitemap in GSC.

**Status: hoafight (app 1 of 5) COMPLETE.** Remaining per umbrella directive:
zoningfight, tenantfight, claimfighter, taxfightletter — port `enrichment.js` +
build each domain's `state-data.json`.
