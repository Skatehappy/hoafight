// scripts/templates/enrichment.js
// ── SEO Content Enrichment (Phase 2) ──────────────────────────────────────────
// Injects verified, state-specific regulatory sections BELOW the existing page
// content. All prose is assembled from scripts/data/state-data.json so that the
// sentences a reader sees are driven by each state's ACTUAL regulatory structure
// (a state with a $100 fine cap reads differently from one with no cap) — never
// the same paragraph with the state name swapped.
//
// PORTABLE ACROSS ALL 5 LETTER APPS: the section scaffold, FAQ-schema merge, and
// state-link cluster are domain-agnostic. Only TOPIC_EMPHASIS (which data fields
// a given dispute slug leans on) and the field-specific prose helpers change per
// app domain. See CONTENT-ENRICHMENT-LOG.md.

function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function has(v) {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'n/a';
}
function yesNo(v) { return v === true ? 'yes' : v === false ? 'no' : null; }
function article(word) { return /^[aeiou]/i.test(String(word).trim()) ? 'an' : 'a'; }

// Which data fields each dispute topic should foreground in "Your Rights".
// Falls back to the general set for any slug not listed.
const TOPIC_EMPHASIS = {
  'hoa-fine-dispute-letter':          ['fine_limits', 'dispute_resolution'],
  'selective-enforcement-challenge':  ['unique_protections', 'fine_limits'],
  'architectural-approval-denial':    ['meeting_requirements', 'unique_protections'],
  'hoa-records-request-letter':       ['records_access', 'meeting_requirements'],
  'hoa-special-assessment-challenge': ['meeting_requirements', 'dispute_resolution'],
  'hoa-board-harassment-letter':      ['dispute_resolution', 'unique_protections'],
  'hoa-lien-threat-response':         ['dispute_resolution', 'unique_protections'],
  'hoa-ccr-violation-dispute':        ['fine_limits', 'unique_protections'],
  'hoa-election-challenge':           ['meeting_requirements', 'dispute_resolution'],
  'hoa-discrimination-letter':        ['dispute_resolution', 'records_access'],
};
const ALL_RIGHTS = ['fine_limits', 'records_access', 'meeting_requirements', 'dispute_resolution'];

// ── Prose builders (each returns plain text, escaped later) ────────────────────
// Data values are already well-formed sentences, so we mostly frame them with a
// short lead and let the authoritative text carry (kept verbatim for accuracy).

function fineProse(state, d) {
  const f = d.fine_limits || {};
  const bits = [];
  if (has(f.max_per_violation) || has(f.max_aggregate)) {
    bits.push(`${state} statutorily caps HOA fines.`);
    if (has(f.max_per_violation)) bits.push(sent(f.max_per_violation));
    if (has(f.max_aggregate)) bits.push(`Aggregate limit: ${sent(f.max_aggregate)}`);
  } else {
    bits.push(`${state} sets no statutory dollar cap on HOA fines — any limit comes from your recorded CC&Rs, and a court still tests whether a fine is reasonable and evenly enforced.`);
  }
  if (has(f.hearing_details)) bits.push(sent(f.hearing_details));
  else if (f.hearing_required === true) bits.push('A fine is not enforceable unless the association first gives written notice and a genuine opportunity to be heard.');
  return bits.join(' ');
}

function recordsProse(state, d) {
  const r = d.records_access || {};
  const bits = [];
  if (r.right_to_inspect === false) {
    bits.push(`${state} does not grant a general statutory right to inspect HOA records; access depends on your governing documents.`);
  } else {
    bits.push(`As ${article(state)} ${state} homeowner you have a statutory right to inspect and copy association records.`);
    if (has(r.response_deadline)) bits.push(`Response window: ${sent(r.response_deadline)}`);
  }
  if (has(r.penalty_for_noncompliance)) bits.push(sent(r.penalty_for_noncompliance));
  return bits.join(' ');
}

function meetingProse(state, d) {
  const m = d.meeting_requirements || {};
  const bits = [];
  if (has(m.notice_period)) bits.push(`Meeting notice in ${state}: ${sent(m.notice_period)}`);
  else bits.push(`${state} sets meeting-notice rules largely through each association's bylaws.`);
  if (m.open_to_members === true) bits.push('Board and member meetings are generally open to owners.');
  if (has(m.executive_session_allowed)) {
    const ex = stripYes(m.executive_session_allowed);
    if (ex) bits.push(cap(sent(ex)));
  }
  return bits.join(' ');
}

function disputeProse(state, d) {
  const dr = d.dispute_resolution || {};
  const parts = [];
  if (dr.mandatory_mediation === true) parts.push('mediation is required before litigation');
  else if (dr.mandatory_mediation === false) parts.push('mediation is available but not mandatory');
  if (dr.mandatory_arbitration === true) parts.push('binding arbitration applies');
  if (dr.small_claims_available === true) parts.push('small-claims court is available for smaller money disputes');
  const bits = [];
  bits.push(parts.length ? `In ${state}, ${parts.join('; ')}.` : `${state} resolves HOA disputes primarily through the courts.`);
  if (has(dr.notes)) bits.push(sent(dr.notes));
  return bits.join(' ');
}

const RIGHTS_RENDER = {
  fine_limits:        { label: 'Fines &amp; penalties', fn: fineProse },
  records_access:     { label: 'Records access',        fn: recordsProse },
  meeting_requirements:{ label: 'Meetings &amp; notice', fn: meetingProse },
  dispute_resolution: { label: 'Resolving a dispute',   fn: disputeProse },
};

// Text helpers: keep authoritative data verbatim, control punctuation/casing.
function clean(str) { return String(str == null ? '' : str).trim().replace(/\s+/g, ' ').replace(/\.+$/, ''); }
function sent(str) { const t = clean(str); return t ? t + '.' : ''; }
function cap(str) { const t = String(str == null ? '' : str).trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
function stripYes(str) { return clean(str).replace(/^yes\b[\s,.:—-]*/i, ''); }

function overviewProse(state, d) {
  const st = d.primary_hoa_statute || {};
  const paras = [];
  // Para 1 — the governing statute (or its absence).
  const noStatute = /no comprehensive|no state|no single/i.test(st.name || '');
  if (noStatute) {
    const body = has(st.name) ? st.name.replace(/^No comprehensive[^.]*\.\s*/i, '').trim() : '';
    paras.push(`${state} has no single, comprehensive homeowners' association statute. ${body}${has(st.citation) ? ` The controlling framework is cited as ${st.citation}.` : ''} That patchwork means your rights come from a mix of general corporate and contract law and your own governing documents rather than one dedicated HOA code — so a demand letter has to cite the right provision for your situation.`);
  } else {
    paras.push(`HOAs in ${state} are governed primarily by the ${st.name}${has(st.citation) ? ` (${st.citation})` : ''}. It sets the baseline rules for fines, records, meetings, and assessments that every association in the state must follow, regardless of what an individual board prefers.`);
  }
  // Para 2 — regulator + how to complain. Data values are proper-noun-cased, so
  // they lead their own sentences (never lower-cased mid-clause).
  const rb = d.regulatory_body || '';
  if (/no state|no agency|none|no dedicated/i.test(rb)) {
    paras.push(`There is no state agency that adjudicates ${state} HOA disputes. ${has(d.complaint_process) ? sent(d.complaint_process) + ' ' : ''}Knowing the exact statute and deadline before you write is what gives a demand letter its leverage.`);
  } else if (has(rb)) {
    paras.push(`Unlike states that leave homeowners only the courthouse, ${state} offers an administrative path. ${sent(rb)}${has(d.complaint_process) ? ' ' + sent(d.complaint_process) : ''}`);
  }
  // Para 3 — recent reform, only if it is an actual change (skip "no/none").
  if (has(d.last_major_reform) && !/^(no|none)\b/i.test(d.last_major_reform)) {
    paras.push(`A recent change to watch: ${sent(d.last_major_reform)}`);
  }
  return paras;
}

// ── Section renderer ──────────────────────────────────────────────────────────
export function renderEnrichmentSections(state, dispute, d) {
  if (!d) return ''; // no data for this state → inject nothing (fail safe)
  const S = state.name;

  const overview = overviewProse(S, d).map(p => `      <p>${esc(p)}</p>`).join('\n');

  const emphasis = TOPIC_EMPHASIS[dispute.slug] || ALL_RIGHTS;
  const ordered = [...emphasis, ...ALL_RIGHTS.filter(k => !emphasis.includes(k))];
  const rights = ordered.map(k => {
    const r = RIGHTS_RENDER[k];
    if (!r) return '';
    const text = r.fn(S, d);
    if (!has(text)) return '';
    return `      <p><strong>${r.label}:</strong> ${esc(text)}</p>`;
  }).filter(Boolean).join('\n');

  // How to file a complaint / take action.
  const rb = d.regulatory_body || '';
  const complaintBody = has(d.complaint_process)
    ? esc(d.complaint_process)
    : (/no state|no agency|none/i.test(rb)
        ? `${esc(S)} has no state HOA regulator, so unresolved disputes are pursued through the courts — small-claims court for smaller money claims, or the trial court for injunctive relief. A well-cited demand letter is usually the necessary first step and often resolves the matter before filing.`
        : esc(rb));

  // Common disputes.
  const issues = Array.isArray(d.common_issues) ? d.common_issues.filter(has) : [];
  const issuesList = issues.length
    ? `      <ul>\n${issues.map(i => `        <li>${esc(i)}</li>`).join('\n')}\n      </ul>`
    : `      <p>The most common ${esc(S)} HOA disputes involve fines, records access, and covenant enforcement.</p>`;

  const protections = Array.isArray(d.unique_protections) ? d.unique_protections.filter(has) : [];
  const protectionsBlock = protections.length
    ? `    <section class="enrich-section report-avoid-break">
      <h2>${esc(S)} Homeowner Protections Worth Knowing</h2>
      <ul>\n${protections.slice(0, 5).map(p => `        <li>${esc(p)}</li>`).join('\n')}\n      </ul>
    </section>`
    : '';

  return `
  <div class="enrich">
    <section class="enrich-section report-avoid-break">
      <h2>${esc(S)} HOA Law Overview</h2>
${overview}
    </section>

    <section class="enrich-section report-avoid-break">
      <h2>Your Rights as ${article(S)} ${esc(S)} Homeowner</h2>
${rights}
    </section>

    <section class="enrich-section report-avoid-break">
      <h2>How to File an HOA Complaint in ${esc(S)}</h2>
      <p>${complaintBody}</p>
    </section>

    <section class="enrich-section report-avoid-break">
      <h2>Common HOA Disputes in ${esc(S)}</h2>
${issuesList}
    </section>
${protectionsBlock}
  </div>`;
}

// ── Data-derived FAQ Q&As (2–3) to merge into the existing FAQ + schema ────────
export function dataFaqs(state, d) {
  if (!d) return [];
  const S = state.name;
  const out = [];

  const f = d.fine_limits || {};
  if (has(f.max_per_violation) || has(f.max_aggregate)) {
    const bits = [`${S} statutorily caps HOA fines.`];
    if (has(f.max_per_violation)) bits.push(sent(f.max_per_violation));
    if (has(f.max_aggregate)) bits.push(`Aggregate limit: ${sent(f.max_aggregate)}`);
    if (f.hearing_required === true) bits.push('A fine is unenforceable unless the board first gave notice and an opportunity to be heard.');
    out.push({ q: `What are the HOA fine limits in ${S}?`, a: bits.join(' ') });
  } else {
    const bits = [`${S} does not set a statutory dollar cap on HOA fines; the limit comes from your recorded CC&Rs, and fines must be reasonable and consistently enforced.`];
    if (f.hearing_required === true) bits.push('The association must still give written notice and a hearing before the fine is enforceable.');
    out.push({ q: `Are there HOA fine limits in ${S}?`, a: bits.join(' ') });
  }

  const r = d.records_access || {};
  if (r.right_to_inspect !== false) {
    const bits = [`Yes — ${S} homeowners have a statutory right to inspect association records.`];
    if (has(r.response_deadline)) bits.push(`Response window: ${sent(r.response_deadline)}`);
    if (has(r.penalty_for_noncompliance)) bits.push(sent(r.penalty_for_noncompliance));
    out.push({ q: `How long does an HOA have to respond to a records request in ${S}?`, a: bits.join(' ') });
  }

  const rb = d.regulatory_body || '';
  if (/no state|no agency|none|no dedicated/i.test(rb)) {
    out.push({ q: `Is there a state agency that regulates HOAs in ${S}?`, a: `No. ${S} has no state agency that adjudicates HOA disputes; homeowners enforce their rights through the courts. A statute-cited demand letter is the practical first step.` });
  } else if (has(rb)) {
    out.push({ q: `Where do I file an HOA complaint in ${S}?`, a: `${sent(rb)}${has(d.complaint_process) ? ' ' + sent(d.complaint_process) : ''}` });
  }

  return out.slice(0, 3);
}

// One-paragraph state-law snapshot for the per-state hub page (plain text).
export function stateLawSnapshot(stateName, d) {
  if (!d) return '';
  return overviewProse(stateName, d)[0] || '';
}

// ── Small hub/teaser helper: a one-line state-law teaser for the /letters hub ──
export function stateTeaser(state, d) {
  if (!d) return '';
  const st = d.primary_hoa_statute || {};
  if (/no comprehensive|no state|no single/i.test(st.name || '')) {
    return `No single HOA statute — governed by ${has(st.citation) ? st.citation : 'general corporate law'} plus your CC&Rs`;
  }
  const f = d.fine_limits || {};
  const cap = has(f.max_per_violation) ? `, fines capped at ${f.max_per_violation}` : '';
  return `Governed by ${st.name}${has(st.citation) ? ` (${st.citation})` : ''}${cap}`;
}
