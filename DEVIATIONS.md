# Deviations from MASTER_SPEC.md

Logged per user instruction to record any out-of-spec changes rather than make them silently.

## 1. `scripts/generate-content.js` — dotenv loading

**Spec section 7** specifies `import 'dotenv/config';`.

**Deviation:** Replaced with:
```js
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
```

**Reason:** The default `dotenv/config` import reads `.env` only. Spec section 14 mandates the API key live in `.env.local`. With the literal spec import, the Anthropic SDK fails with "Could not resolve authentication method" on every call. The replacement loads `.env.local` first then falls back to `.env`.

## 2. `.gitignore` — broader contents than spec

**Spec section 14** lists these additions only:
```
.env.local
scripts/data/generated/_failures.log
```

**Deviation:** Created a full `.gitignore` (no prior file existed) including standard Vite/Node ignores in addition to the spec's lines:
```
node_modules/
dist/
.env
.env.local
.env.*.local
.vercel
.DS_Store
*.log
scripts/data/generated/_failures.log
```

**Reason:** Repo had no existing `.gitignore`. Without `node_modules/` ignored, `npm install` would stage 100+ MB of dependencies. The spec's two lines alone would not produce a working gitignore from scratch.

## 3. App.jsx URL-param dispute mappings

**Packet section 3** provides example slug→dispute-type mappings (e.g., `'hoa-fine-dispute-letter' → 'HOA Fine Dispute'`).

**Deviation:** Used the existing form's actual `disputeType` select options instead of the packet's example values. The form has only 5 options ("Wrongful Fine", "Architectural Denial", "Inconsistent Enforcement", "Records Denied", "Other") so several SEO-page slugs collapse to "Other":

| slug | mapped to |
|---|---|
| hoa-fine-dispute-letter | Wrongful Fine |
| selective-enforcement-challenge | Inconsistent Enforcement |
| architectural-approval-denial | Architectural Denial |
| hoa-records-request-letter | Records Denied |
| hoa-special-assessment-challenge | Other |
| hoa-board-harassment-letter | Other |
| hoa-lien-threat-response | Other |
| hoa-ccr-violation-dispute | Inconsistent Enforcement |
| hoa-election-challenge | Other |
| hoa-discrimination-letter | Other |

**Reason:** The packet itself states "the URL params must map to strings the existing form actually accepts" — this is per-packet instruction, not a freelance change. Logged here for traceability since the resulting strings differ from the packet's example block. URL-param prefill picks the nearest match and the user can refine in the dropdown.

## 4. Repo path mismatch

**Packet section header** states: `Repo: C:\Projects\fightmyhoa\fightmyhoa (GitHub: Skatehappy/fightmyhoa — verify exact path)`.

**Actual:** Repo lives at `C:\Projects\hoafight\hoafight`, GitHub remote is `Skatehappy/hoafight`.

**Reason:** Per packet's own instruction to verify exact path. No code change — just used the actual location.

## 5. Content-Enrichment directive assumed 50 states; generator has 10

**Directive (CC-DIRECTIVE-All-Letter-Apps-Content-Enrichment.md STEP 1)** says "a per-state object for ALL states" and repeatedly references "50 states," batching in groups of 10, and spot-checking Montana/Vermont.

**Actual:** `scripts/data/states.js` defines exactly **10 states** (CA, TX, FL, NY, IL, PA, OH, GA, NC, AZ). 10 states × 10 disputes + 10 state hubs + 1 hub = 111 pages — matching the directive's own "must match original count (111)." Montana/Vermont are not in the generator.

**Reason:** STEP 0 explicitly asks to identify whether the states array is "all 50 or a subset." It is a subset of 10 (all major, heavily-regulated HOA states). Enriching those 10 keeps the page count at 111 and honors "do NOT delete or rename existing URLs." Building 40 new states would have added 400 pages and changed every count. Spot-checked across the regulation spectrum available (FL/CA heavy caps; TX/NY/PA no cap; AZ administrative forum) instead of MT/VT.

## 6. Perplexity MCP unavailable → WebSearch used as the verified-source layer

**Directive** mandates "Perplexity MCP … for all regulatory values."

**Actual:** The Perplexity MCP server was not connected in this session (no `mcp__perplexity__*` tools available). Substituted the built-in **WebSearch** tool as the live-source retrieval layer.

**Reason:** The directive's real requirement is "do NOT rely on training data alone" — every value must trace to a live source. WebSearch satisfies that: every statutory citation, fine cap, records deadline, and regulatory body in `state-data.json` is backed by a source URL with a 2026-07-22 retrieval date in `VERIFICATION_LOG-SEO-CONTENT.md` (46 sources across 10 states). Rob can re-run against Perplexity specifically if desired; the citations are official-source-backed (state legislature sites, justia, findlaw, .gov agencies) and cross-checked against the pre-existing VERIFICATION_LOG.md.

## 7. Filenames follow the umbrella (all-apps) directive

The single-app hoafight directive named the data file `scripts/state-hoa-data.json` and log `VERIFICATION_LOG-HOA-STATE-DATA.md`; the later all-apps umbrella directive names them `scripts/state-data.json` and `VERIFICATION_LOG-SEO-CONTENT.md`. Used the **umbrella names** (`scripts/data/state-data.json`, `VERIFICATION_LOG-SEO-CONTENT.md`) so the generator pattern ports cleanly across all 5 apps. Placed the data file under `scripts/data/` alongside the other data modules (states.js, disputes.js).
