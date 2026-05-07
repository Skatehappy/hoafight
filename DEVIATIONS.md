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
