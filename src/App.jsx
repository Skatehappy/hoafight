import { useState, useEffect } from "react";
import emailjs from "@emailjs/browser";

const EMAILJS_SERVICE_ID  = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY  = "YOUR_EMAILJS_PUBLIC_KEY";

const APP = {
  name: "FightMyHOA",
  tagline: "HOA Appeal Letter Writer",
  icon: "⚔️",
  color: "#1a3d6b",
  colorLight: "#2a5da0",
  payhip: "https://payhip.com/b/8TWrB",
  support: "support@hoafight.com",
  price: "$39",
  font: "'Source Serif 4', Georgia, serif",
  displayFont: "'Playfair Display', serif",
};

const STEPS = ["Intro", "Owner", "HOA", "Dispute", "Demand", "Generate", "Letter"];
const FORM_STEPS = ["Owner", "HOA", "Dispute", "Demand"];

const colors = {
  paper: "#f8faf8",
  paperWarm: "#f0f5f0",
  paperDark: "#e0ece0",
  white: "#ffffff",
  ink: "#0f1a0f",
  inkLight: "#2a3d2a",
  inkMuted: "#5a7a5a",
  inkFaint: "#8aaa8a",
  gold: APP.color,
  goldLight: APP.colorLight,
  border: "#b0ccb0",
  borderLight: "#d0e8d0",
  green: "#1a5c2a",
  red: "#8b1a1a",
  errorBg: "#fff0f0",
  errorBorder: "#ffcccc",
  errorText: "#cc2222",
};

const stepFields = {
  Owner: [
    { key: "ownerName",    label: "Your Full Name",     type: "text",   required: true,  placeholder: "Jane Smith" },
    { key: "ownerAddress", label: "Your Address",        type: "text",   required: true,  placeholder: "123 Oak Lane, Unit 4B" },
    { key: "ownerEmail",   label: "Your Email",          type: "text",   required: false, placeholder: "jane@email.com" },
    { key: "state",        label: "Your State",          type: "text",   required: true,  placeholder: "Florida" },
  ],
  HOA: [
    { key: "hoaName",      label: "HOA / Association Name", type: "text",   required: true,  placeholder: "e.g. Sunset Ridge Homeowners Association" },
    { key: "hoaAddress",   label: "HOA Mailing Address",    type: "text",   required: false, placeholder: "e.g. 456 Main St, Suite 200" },
    { key: "fineAmount",   label: "Fine Amount",            type: "text",   required: false, placeholder: "e.g. $150" },
    { key: "noticeDate",   label: "Date of Notice / Violation Letter", type: "text", required: false, placeholder: "e.g. March 15, 2026" },
  ],
  Dispute: [
    { key: "disputeType",  label: "Type of Dispute",        type: "select", required: true,
      options: ["Wrongful Fine", "Architectural Denial", "Inconsistent Enforcement", "Records Denied", "Special Assessment Dispute", "Election Irregularity", "Failure to Maintain Common Areas", "Board Harassment / Targeted Enforcement", "HOA Fee / Dues Dispute", "Other"] },
    { key: "ccrSection",   label: "CC&R / Bylaw Section Referenced", type: "text", required: false, placeholder: "e.g. Article IV, Section 3.2" },
    { key: "disputeDetails", label: "Describe the Dispute",  type: "textarea", required: true,
      placeholder: "e.g. I received a $150 fine for my trash can being visible from the street on March 10. However, I had placed it out for scheduled pickup and it was removed within 2 hours. Multiple neighbors leave cans out longer without penalty." },
    { key: "evidence",     label: "Evidence You Have",       type: "textarea", required: false,
      placeholder: "e.g. Photos with timestamps, neighbor statements, prior board communications, meeting minutes showing selective enforcement" },
  ],
  Demand: [
    { key: "demand",         label: "What You Want",          type: "select", required: true,
      options: ["Fine rescinded in full", "Formal hearing before the board", "Architectural request approved", "Access to HOA records", "Written explanation of enforcement criteria", "Fine reduced and policy clarified"] },
    { key: "deadline",       label: "Response Deadline You're Setting", type: "text", required: false, placeholder: "e.g. 30 days from receipt of this letter" },
    { key: "nextSteps",      label: "What You'll Do If Ignored", type: "select", required: false,
      options: ["File complaint with state HOA regulator", "Request mediation or arbitration", "Consult an attorney", "File complaint and consult attorney", "All available remedies"] },
    { key: "additionalInfo", label: "Anything Else to Include", type: "textarea", required: false, placeholder: "Any other relevant details..." },
  ],
};

const requiredFields = {
  Owner: ["ownerName", "ownerAddress", "state"],
  HOA: ["hoaName"],
  Dispute: ["disputeType", "disputeDetails"],
  Demand: ["demand"],
};

const conditionalFields = {
  "Special Assessment Dispute": [
    { key: "assessmentAmount",        label: "Assessment Amount",                  type: "text",   placeholder: "e.g. $2,400 per unit" },
    { key: "assessmentNoticeReceived",label: "Notice Received?",                    type: "select", options: ["Yes — adequate notice","No notice at all","Insufficient notice period","Notice but missing required disclosures"] },
    { key: "assessmentVoteHeld",      label: "Member Vote Held?",                   type: "select", options: ["Yes","No vote held","Not sure","Vote held but improper procedure"] },
    { key: "assessmentPurpose",       label: "Stated Purpose of the Assessment",    type: "textarea", placeholder: "e.g. 'Roof replacement for clubhouse'" },
  ],
  "Records Denied": [
    { key: "recordsRequested",        label: "Records You Requested",               type: "textarea", placeholder: "e.g. Monthly financial statements for 2025; board meeting minutes Jan-Mar 2026; most recent reserve study; vendor contracts over $5,000" },
    { key: "recordsRequestDate",      label: "Date of Your Written Request",         type: "text",     placeholder: "e.g. February 10, 2026" },
    { key: "recordsHoaResponse",      label: "HOA Response to Date",                 type: "textarea", placeholder: "e.g. No response; or 'We don't have to show those'; or partial production on [date]" },
  ],
  "Election Irregularity": [
    { key: "electionViolation",       label: "Specific Procedural Violation",       type: "textarea", placeholder: "e.g. Inspector of elections not appointed; ballots counted in private; candidate excluded without stated grounds" },
    { key: "electionDate",            label: "Election Date",                        type: "text",     placeholder: "e.g. March 15, 2026" },
    { key: "electionOutcome",         label: "Outcome You Are Contesting",           type: "textarea", placeholder: "e.g. Board seats 1, 3, 5 were certified for incumbents despite apparent quorum failure" },
  ],
  "Failure to Maintain Common Areas": [
    { key: "commonAreaAtIssue",       label: "Common Area at Issue",                 type: "select",   options: ["Pool","Walkways / sidewalks","Landscaping","Roofs on common buildings","Parking lots","Clubhouse / gym","Fencing / gates","Lighting","Other"] },
    { key: "commonAreaCondition",     label: "Condition Described",                  type: "textarea", placeholder: "e.g. Pool has been closed since November 2025; tiles cracked and pump broken. Pool deck concrete is spalling and creates trip hazards." },
    { key: "commonAreaSafetyHazard",  label: "Creates a Safety Hazard?",             type: "select",   options: ["Yes","No","Unclear"] },
    { key: "commonAreaPriorRequests", label: "Prior Requests Made",                  type: "textarea", placeholder: "e.g. Emailed board 11/15/25 and 12/20/25; raised at annual meeting 1/18/26; no action taken" },
  ],
  "Board Harassment / Targeted Enforcement": [
    { key: "harassmentIncidents",     label: "Incidents Described with Dates",      type: "textarea", placeholder: "e.g. 12/3/25 — inspection and $150 fine for trash can visible; 12/10/25 — fine for 'lawn height' when grass was 3 inches; 12/18/25 — threatening letter from board president" },
    { key: "harassmentComparators",   label: "Other Homeowners with Same Condition Not Fined?", type: "select", options: ["Yes — same condition, not fined","No — everyone is cited","Not sure"] },
    { key: "harassmentProtectedClass",label: "Protected Class Involved?",            type: "select",   options: ["No","Yes — race or national origin","Yes — disability","Yes — familial status","Yes — religion","Yes — other"] },
  ],
  "Inconsistent Enforcement": [
    { key: "harassmentIncidents",     label: "Incidents Described with Dates",      type: "textarea", placeholder: "e.g. Cited and fined for condition X on [dates]" },
    { key: "harassmentComparators",   label: "Other Homeowners with Same Condition Not Fined?", type: "select", options: ["Yes — same condition, not fined","No — everyone is cited","Not sure"] },
    { key: "harassmentProtectedClass",label: "Protected Class Involved?",            type: "select",   options: ["No","Yes — race or national origin","Yes — disability","Yes — familial status","Yes — religion","Yes — other"] },
  ],
  "Architectural Denial": [
    { key: "modificationRequested",   label: "Modification Requested",              type: "select",   options: ["Solar panels","Satellite dish / antenna","EV charger","Accessibility modification (ramp, grab bars, etc.)","Fence","Flag / flagpole","Paint / exterior color","Landscaping","Shed or outbuilding","Other"] },
    { key: "modificationDenialReason",label: "Denial Reason HOA Gave",               type: "textarea", placeholder: "e.g. 'Does not match neighborhood aesthetic'" },
    { key: "modificationProtection",  label: "Applicable Federal or State Protection", type: "select", options: ["Federal OTARD rule (satellite dish / antenna)","State solar rights / solar access law","ADA or Fair Housing accessibility modification","State EV charger protection statute","Federal flag display law","None / not sure"] },
  ],
  "HOA Fee / Dues Dispute": [
    { key: "feesDisputed",            label: "Fees You Dispute",                     type: "textarea", placeholder: "e.g. $75 'administrative fee' not in CC&Rs; $200 late fee on $180 assessment; double-charging of trash fee for three months" },
    { key: "feesAmount",              label: "Total Amount at Issue",                type: "text",     placeholder: "e.g. $875" },
    { key: "feesCcrsCitation",        label: "CC&Rs Provisions the HOA Cites (if any)", type: "textarea", placeholder: "e.g. Board claims 'Article VI §4' authorizes it; that section only authorizes regular assessments, not administrative fees" },
  ],
};

function buildDisputeFields(baseFields, disputeType) {
  const cond = conditionalFields[disputeType];
  if (!cond) return baseFields;
  const idx = baseFields.findIndex(f => f.key === "disputeType");
  if (idx === -1) return [...baseFields, ...cond];
  return [...baseFields.slice(0, idx + 1), ...cond, ...baseFields.slice(idx + 1)];
}

const inputStyle = (focused) => ({
  width: "100%",
  padding: "13px 16px",
  background: colors.white,
  border: `1px solid ${focused ? colors.goldLight : colors.border}`,
  borderRadius: "8px",
  color: colors.ink,
  fontSize: "15px",
  fontFamily: APP.font,
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
});

const btnStyle = (active) => ({
  background: active ? `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})` : colors.paperDark,
  border: "none",
  color: active ? "#fff" : colors.inkFaint,
  padding: "13px 28px",
  borderRadius: "6px",
  cursor: active ? "pointer" : "default",
  fontSize: "15px",
  fontWeight: active ? "700" : "400",
  fontFamily: APP.font,
  transition: "all 0.2s",
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  boxShadow: active ? `0 2px 12px ${colors.goldLight}55` : "none",
});

function Field({ field, value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: "4px" }}>
      <label style={{ display: "block", marginBottom: "7px", fontSize: "13px", color: colors.inkMuted }}>
        {field.label}
        {field.required && <span style={{ color: colors.goldLight, marginLeft: "4px" }}>*</span>}
      </label>
      {field.type === "select" ? (
        <select
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...inputStyle(focused), cursor: "pointer" }}
        >
          <option value="">Select...</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ ...inputStyle(focused), resize: "vertical", lineHeight: "1.7", minHeight: "112px" }}
        />
      ) : (
        <input
          type="text"
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={inputStyle(focused)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      width: "16px", height: "16px",
      border: "2px solid rgba(255,255,255,0.3)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      display: "inline-block",
      animation: "spin 0.8s linear infinite"
    }} />
  );
}

export default function App() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [accessCode, setAccessCode] = useState("");
  const [codeValid, setCodeValid] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [letter, setLetter] = useState("");
  const [altLetter, setAltLetter] = useState("");
  const [activeTab, setActiveTab] = useState("standard");
  const [checklist, setChecklist] = useState([]);
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setAccessCode(code.toUpperCase());
      verifyCode(code.toUpperCase(), true);
    }
  }, []);

  useEffect(() => {
    try { const s = sessionStorage.getItem("hoa_form"); if (s) setFormData(JSON.parse(s)); } catch {}
    const params = new URLSearchParams(window.location.search);
    const stateParam = params.get("state");
    const disputeParam = params.get("dispute");
    const slugToStateName = {
      "california": "California", "texas": "Texas", "florida": "Florida",
      "new-york": "New York", "illinois": "Illinois", "pennsylvania": "Pennsylvania",
      "ohio": "Ohio", "georgia": "Georgia", "north-carolina": "North Carolina", "arizona": "Arizona"
    };
    const slugToDisputeType = {
      "hoa-fine-dispute-letter": "Wrongful Fine",
      "selective-enforcement-challenge": "Inconsistent Enforcement",
      "architectural-approval-denial": "Architectural Denial",
      "hoa-records-request-letter": "Records Denied",
      "hoa-special-assessment-challenge": "Other",
      "hoa-board-harassment-letter": "Other",
      "hoa-lien-threat-response": "Other",
      "hoa-ccr-violation-dispute": "Inconsistent Enforcement",
      "hoa-election-challenge": "Other",
      "hoa-discrimination-letter": "Other"
    };
    const updates = {};
    if (stateParam && slugToStateName[stateParam]) updates.state = slugToStateName[stateParam];
    if (disputeParam && slugToDisputeType[disputeParam]) updates.disputeType = slugToDisputeType[disputeParam];
    if (Object.keys(updates).length) setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem("hoa_form", JSON.stringify(formData)); } catch {}
  }, [formData]);

  const handleChange = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const isStepValid = (stepName) => {
    return (requiredFields[stepName] || []).every(k => formData[k] && formData[k].trim());
  };

  const verifyCode = async (code, silent = false) => {
    if (!code || !code.trim()) { setCodeError("Please enter your access code."); return; }
    setCodeError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code, systemPrompt: "Reply: VALID", userPrompt: "check" }),
      });
      if (res.status === 401) {
        if (!silent) setCodeError("Invalid access code. Check your Payhip receipt email.");
        setCodeValid(false);
      } else {
        setCodeValid(true);
        if (!silent) setStep(1);
      }
    } catch {
      if (!silent) setCodeError("Could not verify. Check your connection.");
    }
  };

  const callAPI = async (systemPrompt, userPrompt, reviewMode, draftLetter) => {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessCode, systemPrompt, userPrompt, reviewMode: !!reviewMode, draftLetter: draftLetter || "" }),
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Generation failed"); }
    return (await res.json()).text;
  };

  const systemPrompt = "You are an expert HOA and community association attorney. Write compelling appeal letters citing your state HOA statute, invoking due process and hearing rights, and challenging procedural defects. 500-700 words. Format: formal appeal letter with [DATE] placeholder, via certified mail. Output ONLY the letter.";

  const specialAssessmentPrompt = `You are an expert HOA and community association attorney specializing in special assessment disputes. Write firm, legally precise appeal letters.

Rules:
- Open with clear statement: the HOA levied a special assessment on a specific date in a specific amount; the assessment is improper for specified procedural or substantive reasons
- Cite the state's HOA statute by name (e.g., California Davis-Stirling Common Interest Development Act at Civil Code §§5600-5615; Florida Chapter 720; Texas Property Code Chapter 209; North Carolina Chapter 47F)
- Cite the notice and vote requirements the state imposes — most states require 30-60 days written notice and a member vote for special assessments exceeding stated budget thresholds (often 5% of budgeted gross expenses)
- Cite the governing documents (CC&Rs, Declaration, Bylaws) provisions on assessment authority and required procedures
- Identify the specific defects: insufficient notice, no member vote when required, exceeds statutory cap, funds directed to ineligible purposes, or inadequate financial justification
- Demand: production of the financial justification and itemized budget for the assessment; proof of proper notice and proper member vote (if required); suspension of the assessment pending compliance; refund of any amounts already paid if the assessment is void
- Warn of remedies: complaint to the state's HOA regulator or attorney general, suit for declaratory and injunctive relief, breach-of-fiduciary-duty claims against individual board members, and attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const recordsRequestPrompt = `You are an expert HOA and community association attorney specializing in member records-inspection rights. Write firm, legally precise demand letters.

Rules:
- Open with clear statement: on a specific date you submitted a written request for enumerated records; the HOA has failed to comply within the statutory deadline
- Cite the state's HOA records-inspection statute by name (e.g., California Davis-Stirling at Civil Code §§5200-5240; Florida §720.303(5); Texas Property Code §209.005; North Carolina §47F-3-118) — most states require production within 10-30 days of a written request
- Cite the CC&Rs and Bylaws provisions on member inspection rights
- List the specific records requested — financial records, meeting minutes, budgets, reserve studies, vendor contracts, ballots, or other records the member is legally entitled to inspect
- Rebut any "confidentiality" or "burden" excuse — statutory inspection rights are not defeated by member-information redactions that the statute itself already requires
- Demand: production of each enumerated record within a short follow-up deadline (typically 10-15 days); if the HOA intends to charge a reasonable copying fee, production of the fee schedule first; and a written statement of which records are withheld and on what specific statutory basis
- Warn of remedies: statutory penalties where provided (some states impose per-day penalties for non-compliance), attorney's fees, small-claims or declaratory-relief actions, and complaint to the state HOA regulator
- Set a firm 15-day response deadline
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const electionIrregularityPrompt = `You are an expert HOA and community association attorney specializing in HOA election disputes. Write firm, legally precise demand letters.

Rules:
- Open with clear statement: the board election held on a specific date was conducted improperly; specify each particular procedural violation
- Cite the state's HOA election statute by name (e.g., California Davis-Stirling at Civil Code §§5100-5145 — election procedures and secret ballots; Florida §720.306; Texas Property Code §209.00593)
- Cite the CC&Rs and Bylaws provisions on election procedures, quorum, inspector of elections, and candidate eligibility
- Identify specific defects: ballots not counted per statute, proxies mishandled, candidates improperly excluded, quorum not met, inspector of elections not appointed, inadequate notice of election, or failure to preserve ballots per statutory retention period
- Demand: independent investigation of the election; production of all ballot records (sealed ballots, proxies, voter list, inspector of elections' report); and re-run of the election under proper procedures if defects cannot be cured
- Warn of remedies: member action to set aside the election, court-ordered reelection, complaint to the state HOA regulator, and attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const commonAreaPrompt = `You are an expert HOA and community association attorney specializing in HOA maintenance and fiduciary duty claims. Write firm, legally precise demand letters.

Rules:
- Open with clear statement of the common area(s) at issue, the condition, how long it has gone unaddressed, and any safety hazards created
- Cite the CC&Rs and Declaration provisions that assign maintenance responsibility for the common areas to the HOA
- Cite the state's HOA statute confirming the association's duty to maintain common areas (e.g., California Davis-Stirling at Civil Code §4775; Florida §720.303; Texas Property Code Chapter 209)
- Cite the board's fiduciary duty to the membership — the business judgment rule does not protect inaction or gross neglect of core maintenance obligations
- Reference prior requests to the HOA and the inadequate response
- Demand: a specific repair plan with timeline; documentation of the HOA's contracted maintenance obligations; and interim safety measures where a hazard exists
- Warn of remedies: member action for breach of the governing documents and breach of fiduciary duty; injunctive relief to compel maintenance; damages for diminution in property value; complaint to the state HOA regulator; and attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline (shorter for documented safety hazards)
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const boardHarassmentPrompt = `You are an expert HOA and community association attorney specializing in selective enforcement, board harassment, and fair housing claims. Write firm, legally precise demand letters.

Rules:
- Open with clear statement: the HOA board or management company has engaged in targeted enforcement against the homeowner, with specific incidents and dates
- Identify the pattern: repeated inspections, excessive fines, threatening communications, or selective enforcement of rules not applied to similarly situated homeowners
- Cite the state's HOA uniform-enforcement and fiduciary-duty statutes (e.g., California Davis-Stirling at Civil Code §5975 and related uniform-enforcement requirements; Florida §720.305; Texas Property Code Chapter 209)
- Cite the board's fiduciary duty and the uniform-enforcement doctrine — selective enforcement of covenants is itself a defense and an affirmative claim
- If a protected class is implicated: cite the federal Fair Housing Act (42 U.S.C. §§3601-3619) and any applicable state fair housing statute, noting that disparate treatment or disparate-impact targeting is actionable
- Name comparators where available — other homeowners with the same condition who were not fined, inspected, or harassed
- Demand: immediate cessation of targeted enforcement; written enforcement criteria and proof of uniform application; withdrawal of any fines imposed through selective enforcement; and a written commitment to follow uniform enforcement procedures going forward
- Warn of remedies: civil action for breach of fiduciary duty, declaratory and injunctive relief, HUD complaint if fair housing laws are implicated, and attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline
- Professional but firm tone — document the record
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const architecturalPrompt = `You are an expert HOA and community association attorney specializing in architectural review and modification denials. Write firm, legally precise appeal letters.

Rules:
- Open with clear statement: the HOA denied a specific modification request; identify the modification, the date of denial, and the stated grounds
- Cite the CC&Rs and Architectural Guidelines provisions the HOA relied on, and rebut any pretextual or vague grounds — architectural review standards must be objective and applied uniformly
- If the modification is federally or state protected, cite the governing law by name:
  * Satellite dishes and over-the-air reception devices: FCC Over-the-Air Reception Devices Rule (OTARD) at 47 CFR §1.4000, which preempts restrictions on antennas up to one meter
  * Solar energy systems: state solar rights or solar access laws (e.g., California Civil Code §714; Florida §163.04; Arizona §33-1816; Texas Property Code §202.010)
  * Accessibility modifications: Fair Housing Act at 42 U.S.C. §3604(f)(3)(A) — reasonable modifications for disabled residents; ADA if common areas are implicated
  * Electric vehicle chargers: state EV charger protection statutes where applicable (e.g., California Civil Code §4745; Florida §718.113; Colorado §38-33.3-106.8)
  * Flags: federal Freedom to Display the American Flag Act (4 U.S.C. §5 Note)
- Demand: written denial citing specific CC&Rs provisions, not conclusions; reconsideration in light of the applicable federal or state protection; and, if denied on review, reasonable alternative modifications
- Warn of remedies: civil action for declaratory and injunctive relief; FCC complaint (OTARD); HUD complaint (accessibility); state utility-commission or regulator complaint (solar, EV); and attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const hoaFeesPrompt = `You are an expert HOA and community association attorney specializing in assessment, fee, and billing disputes. Write firm, legally precise demand letters.

Rules:
- Open with clear statement: the HOA has charged specified fees or dues that are not authorized by the CC&Rs, are incorrectly calculated, lack required itemization, or include improper late fees
- Cite the state's HOA assessment statute (e.g., California Davis-Stirling at Civil Code §§5600-5740; Florida §720.308; Texas Property Code §209.0063; North Carolina §47F-3-115) governing assessment authority, itemization, late fees, and collection procedures
- Cite the CC&Rs and Bylaws provisions on assessments and any required member-vote procedures for fee increases
- Rebut each disputed fee specifically: unauthorized by the governing documents, exceeds statutory caps on late fees, improper compounding, assessed without required notice, or assessed in violation of the statutory fee-collection sequence (most states require payment to be applied to current assessments before late fees and fines)
- Demand: itemized accounting of all fees charged and paid; the legal basis (statute or CC&Rs section) for each fee that is not clearly provided for in the governing documents; refund of any unauthorized amounts; and correction of any improper late fees
- Warn of remedies: dispute under the state's HOA collection statute; refusal to pay disputed amounts pending resolution without triggering lien remedies where state law protects disputed accounts; complaint to the state HOA regulator; and civil action with attorney's fees where statute or CC&Rs provide
- Set a firm 30-day response deadline
- Professional but firm tone
- 500-700 words
- Format: formal letter with [DATE] placeholder, via certified mail
- Output ONLY the letter, no preamble`;

  const pickSystemPrompt = (disputeType) => {
    if (!disputeType) return systemPrompt;
    if (disputeType === "Special Assessment Dispute") return specialAssessmentPrompt;
    if (disputeType === "Records Denied") return recordsRequestPrompt;
    if (disputeType === "Election Irregularity") return electionIrregularityPrompt;
    if (disputeType === "Failure to Maintain Common Areas") return commonAreaPrompt;
    if (disputeType === "Board Harassment / Targeted Enforcement") return boardHarassmentPrompt;
    if (disputeType === "Inconsistent Enforcement") return boardHarassmentPrompt;
    if (disputeType === "Architectural Denial") return architecturalPrompt;
    if (disputeType === "HOA Fee / Dues Dispute") return hoaFeesPrompt;
    return systemPrompt;
  };

  const buildPrompt = (tone) => {
    const base = `
HOMEOWNER: ${formData.ownerName}
ADDRESS: ${formData.ownerAddress}
STATE: ${formData.state}
HOA NAME: ${formData.hoaName}
HOA ADDRESS: ${formData.hoaAddress || "not provided"}
FINE AMOUNT: ${formData.fineAmount || "not specified"}
NOTICE DATE: ${formData.noticeDate || "not provided"}
DISPUTE TYPE: ${formData.disputeType}
CC&R SECTION: ${formData.ccrSection || "not specified"}
DISPUTE DETAILS: ${formData.disputeDetails}
EVIDENCE: ${formData.evidence || "none provided"}
DEMAND: ${formData.demand}
RESPONSE DEADLINE: ${formData.deadline || "30 days"}
NEXT STEPS IF IGNORED: ${formData.nextSteps || "all available remedies"}
ADDITIONAL INFO: ${formData.additionalInfo || "none"}`;

    const cond = (conditionalFields[formData.disputeType] || [])
      .filter(f => formData[f.key]?.toString().trim())
      .map(f => `${f.label.toUpperCase()}: ${formData[f.key]}`)
      .join("\n");
    const fullBase = cond ? `${base}\n\nTYPE-SPECIFIC DETAILS:\n${cond}` : base;

    if (tone === "assertive") {
      return `Write a MORE ASSERTIVE appeal letter. Stronger language, explicit due process violations, more forceful demands. Different wording from standard:\n${fullBase}`;
    }
    return `Write a STANDARD PROFESSIONAL appeal letter:\n${fullBase}`;
  };

  const generateLetter = async () => {
    setLoading(true);
    setError("");
    setLetter("");
    setAltLetter("");
    setChecklist([]);
    try {
      const effectivePrompt = pickSystemPrompt(formData.disputeType);
      setLoadingMsg("Drafting your appeal letter...");
      const draft = await callAPI(effectivePrompt, buildPrompt("standard"), false, "");
      setLoadingMsg("Running quality review...");
      const reviewed = await callAPI("", "", true, draft);
      setLetter(reviewed);
      setLoadingMsg("Generating assertive version...");
      const alt = await callAPI(effectivePrompt, buildPrompt("assertive"), false, "");
      setAltLetter(alt);
      setLoadingMsg("Building checklist...");
      try {
        const clRes = await fetch("/api/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessCode,
            address: formData.hoaName,
            state: formData.state,
            varianceType: "HOA appeal",
            letterExcerpt: reviewed.substring(0, 300),
          }),
        });
        if (clRes.ok) {
          const d = await clRes.json();
          setChecklist(d.checklist || []);
        }
      } catch {}
      setStep(STEPS.indexOf("Letter"));
      setRetryCount(0);
    } catch (e) {
      const n = retryCount + 1;
      setRetryCount(n);
      setError(`Generation failed: ${e.message}. Please try again.`);
    }
    setLoading(false);
    setLoadingMsg("");
  };

  const sendEmail = async () => {
    if (!email || !email.includes("@")) return;
    setEmailSending(true);
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: email,
        to_name: formData.ownerName,
        insurer: formData.hoaName,
        letter_standard: letter,
        letter_assertive: altLetter,
        from_name: APP.name,
        reply_to: APP.support,
      }, EMAILJS_PUBLIC_KEY);
      setEmailSent(true);
    } catch {
      setError("Email send failed. Please copy the letter manually.");
    }
    setEmailSending(false);
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const downloadPDF = (text) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 72;
    const usableWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const lineHeight = 14;
    doc.setFont("Times", "normal");
    doc.setFontSize(11);
    const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const fullText = text.replace(/\[DATE\]/g, today);
    const lines = doc.splitTextToSize(fullText, usableWidth);
    let y = margin;
    lines.forEach(line => {
      if (y + lineHeight > doc.internal.pageSize.getHeight() - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });
    doc.save("FightMyHOA-appeal-letter.pdf");
  };

  const reset = () => {
    setStep(codeValid ? 1 : 0);
    setFormData({});
    setLetter("");
    setAltLetter("");
    setError("");
    setEmailSent(false);
    setChecklist([]);
    setRetryCount(0);
    try { sessionStorage.removeItem("hoa_form"); } catch {}
  };

  const currentStep = STEPS[step];

  return (
    <div style={{ minHeight: "100vh", background: colors.paper, fontFamily: APP.font, color: colors.ink }}>

      {/* NAV */}
      <div style={{ background: colors.white, borderBottom: `1px solid ${colors.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 10px rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "34px", height: "34px", background: `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})`, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
            {APP.icon}
          </div>
          <div>
            <div style={{ fontSize: "18px", fontWeight: "700", fontFamily: APP.displayFont, color: colors.ink }}>{APP.name}</div>
            <div style={{ fontSize: "10px", color: colors.inkFaint, letterSpacing: "0.1em", textTransform: "uppercase" }}>{APP.tagline}</div>
          </div>
        </div>
        {letter && (
          <button onClick={reset} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.inkMuted, padding: "7px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontFamily: APP.font }}>
            ← New Letter
          </button>
        )}
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* INTRO / ACCESS GATE */}
        {currentStep === "Intro" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "13px", color: colors.goldLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px" }}>
              {APP.icon} {APP.name}
            </div>
            <h1 style={{ fontFamily: APP.displayFont, fontSize: "clamp(28px,5vw,44px)", color: colors.ink, marginBottom: "16px", fontWeight: "900" }}>
              Your HOA Isn't Always Right.
            </h1>
            <p style={{ fontSize: "17px", color: colors.inkMuted, maxWidth: "480px", margin: "0 auto 40px", lineHeight: "1.7" }}>
              AI-generated appeal letters for HOA fines, special assessments, records requests, election disputes, architectural denials, common-area maintenance failures, board harassment, and unauthorized fees. Attorney-quality. 5 minutes. {APP.price}.
            </p>
            <div style={{ maxWidth: "400px", margin: "0 auto", background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "32px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "14px", color: colors.inkLight, marginBottom: "16px", fontWeight: "600" }}>Enter Your Access Code</div>
              <input
                type="text"
                value={accessCode}
                onChange={e => { setAccessCode(e.target.value.toUpperCase()); setCodeError(""); }}
                placeholder="e.g. HOA-ABC123"
                style={{ ...inputStyle(false), textAlign: "center", fontSize: "18px", letterSpacing: "0.1em", marginBottom: "12px", fontWeight: "600" }}
              />
              {codeError && <div style={{ color: colors.errorText, fontSize: "13px", marginBottom: "12px" }}>{codeError}</div>}
              <button onClick={() => verifyCode(accessCode)} style={{ ...btnStyle(!!accessCode.trim()), width: "100%", justifyContent: "center", padding: "14px" }}>
                Unlock My Letter →
              </button>
              <div style={{ marginTop: "16px", fontSize: "12px", color: colors.inkFaint }}>
                Don't have a code?{" "}
                <a href={APP.payhip} style={{ color: colors.goldLight, textDecoration: "none" }}>Purchase for {APP.price} →</a>
              </div>
            </div>
          </div>
        )}

        {/* FORM STEPS */}
        {FORM_STEPS.includes(currentStep) && (
          <div>
            {/* Progress bar */}
            <div style={{ marginBottom: "36px" }}>
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                {FORM_STEPS.map((s, i) => {
                  const idx = FORM_STEPS.indexOf(currentStep);
                  return (
                    <div key={s} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i < idx ? colors.goldLight : i === idx ? colors.gold : colors.borderLight, transition: "background 0.3s" }} />
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                {FORM_STEPS.map((s, i) => {
                  const idx = FORM_STEPS.indexOf(currentStep);
                  return (
                    <div key={s} style={{ fontSize: "10px", color: i <= idx ? colors.goldLight : colors.borderLight, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                      {s}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step title */}
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ fontFamily: APP.displayFont, fontSize: "26px", color: colors.ink, marginBottom: "6px", fontWeight: "700" }}>
                {currentStep === "Owner" && "About You"}
                {currentStep === "HOA" && "Your HOA"}
                {currentStep === "Dispute" && "The Dispute"}
                {currentStep === "Demand" && "Your Demand"}
              </h2>
              <p style={{ fontSize: "14px", color: colors.inkMuted, lineHeight: "1.6" }}>
                {currentStep === "Owner" && "Your contact information and address."}
                {currentStep === "HOA" && "The HOA or community association involved."}
                {currentStep === "Dispute" && "What happened and why they're wrong."}
                {currentStep === "Demand" && "What you want and what you'll do next."}
              </p>
            </div>

            {/* Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {(currentStep === "Dispute" ? buildDisputeFields(stepFields.Dispute, formData.disputeType) : (stepFields[currentStep] || [])).map(f => (
                <Field key={f.key} field={f} value={formData[f.key]} onChange={v => handleChange(f.key, v)} />
              ))}
            </div>

            {/* Nav buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "36px" }}>
              <button onClick={() => setStep(s => s - 1)} style={{ ...btnStyle(true), background: "transparent", border: `1px solid ${colors.border}`, color: colors.inkMuted, boxShadow: "none" }}>
                ← Back
              </button>
              <button onClick={() => setStep(s => s + 1)} disabled={!isStepValid(currentStep)} style={btnStyle(isStepValid(currentStep))}>
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* GENERATE */}
        {currentStep === "Generate" && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ fontFamily: APP.displayFont, fontSize: "30px", color: colors.ink, marginBottom: "12px" }}>Ready to Generate</h2>
            <p style={{ fontSize: "16px", color: colors.inkMuted, maxWidth: "480px", margin: "0 auto 36px", lineHeight: "1.7" }}>
              Enter your email to receive a copy, then click Generate. Two-pass AI quality review — about 20-30 seconds.
            </p>
            <div style={{ maxWidth: "420px", margin: "0 auto" }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...inputStyle(false), textAlign: "center", marginBottom: "16px", fontSize: "15px" }}
              />
              <button onClick={generateLetter} disabled={loading} style={{ ...btnStyle(!loading), width: "100%", justifyContent: "center", padding: "16px", fontSize: "17px" }}>
                {loading ? <><Spinner /> {loadingMsg || "Generating..."}</> : "Generate My Letter ✦"}
              </button>
              {error && (
                <div style={{ marginTop: "16px", padding: "13px 16px", background: colors.errorBg, border: `1px solid ${colors.errorBorder}`, borderRadius: "8px", color: colors.errorText, fontSize: "13px" }}>
                  {error}
                  <button onClick={generateLetter} style={{ marginLeft: "12px", background: "transparent", border: "none", color: colors.goldLight, cursor: "pointer", fontSize: "13px" }}>Try again →</button>
                </div>
              )}
              <div style={{ marginTop: "14px", fontSize: "12px", color: colors.inkFaint }}>Two-pass AI review · Standard + Assertive versions · Checklist included</div>
            </div>
            <button onClick={() => setStep(s => s - 1)} style={{ marginTop: "28px", background: "transparent", border: "none", color: colors.inkFaint, cursor: "pointer", fontSize: "13px", fontFamily: APP.font }}>
              ← Edit my answers
            </button>
          </div>
        )}

        {/* LETTER OUTPUT */}
        {currentStep === "Letter" && letter && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
              <div>
                <div style={{ fontFamily: APP.displayFont, fontSize: "24px", color: colors.gold, marginBottom: "4px" }}>Your Letter is Ready</div>
                <div style={{ fontSize: "13px", color: colors.inkFaint }}>Two-pass AI reviewed · Two versions · Checklist included</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => copyText(activeTab === "standard" ? letter : altLetter)} style={btnStyle(true)}>
                  {copied ? "✓ Copied!" : "Copy Letter"}
                </button>
                <button onClick={() => downloadPDF(activeTab === "standard" ? letter : altLetter)} style={{ ...btnStyle(true), background: "transparent", border: `1px solid ${colors.goldLight}`, color: colors.goldLight }}>
                  ⬇ PDF
                </button>
              </div>
            </div>

            {altLetter && (
              <div style={{ display: "flex", gap: "2px", background: colors.paperDark, padding: "4px", borderRadius: "8px", marginBottom: "6px" }}>
                {[["standard", "Standard / Professional"], ["assertive", "Assertive / Detailed"]].map(([key, label]) => (
                  <button key={key} onClick={() => setActiveTab(key)} style={{ flex: 1, padding: "10px", borderRadius: "6px", border: "none", cursor: "pointer", fontFamily: APP.font, fontSize: "13px", transition: "all 0.2s", background: activeTab === key ? `linear-gradient(135deg, ${colors.goldLight}, ${colors.gold})` : "transparent", color: activeTab === key ? "#fff" : colors.inkMuted, fontWeight: activeTab === key ? "600" : "400" }}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ fontSize: "12px", color: colors.inkFaint, marginBottom: "16px" }}>
              {activeTab === "standard" ? "Measured, professional tone. Good for first appeal." : "Stronger framing. Better when initial request was ignored."}
            </div>

            <div style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "40px 48px", lineHeight: "1.9", fontSize: "14px", color: colors.inkLight, whiteSpace: "pre-wrap", fontFamily: APP.font, boxShadow: "0 4px 32px rgba(0,0,0,0.08)", marginBottom: "24px" }}>
              {activeTab === "standard" ? letter : altLetter}
            </div>

            {email && !emailSent && (
              <div style={{ background: colors.paperWarm, border: `1px solid ${colors.border}`, borderRadius: "8px", padding: "18px 22px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                <div style={{ fontSize: "14px", color: colors.inkLight }}>Send a copy to <strong>{email}</strong></div>
                <button onClick={sendEmail} disabled={emailSending} style={{ ...btnStyle(!emailSending), padding: "9px 20px", fontSize: "13px" }}>
                  {emailSending ? <><Spinner /> Sending...</> : "Send Copy →"}
                </button>
              </div>
            )}

            {emailSent && (
              <div style={{ background: "#e8f5e8", border: "1px solid #b0d8b0", borderRadius: "8px", padding: "14px 20px", marginBottom: "20px", fontSize: "14px", color: colors.green }}>
                ✓ Letter emailed to {email}
              </div>
            )}

            {checklist.length > 0 && (
              <div style={{ background: colors.white, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "24px 28px", marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", color: colors.goldLight, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "16px" }}>Next Steps Checklist</div>
                {checklist.map((item, i) => (
                  <label key={i} style={{ display: "flex", gap: "12px", marginBottom: "10px", cursor: "pointer", alignItems: "flex-start" }}>
                    <input type="checkbox" style={{ marginTop: "3px", accentColor: colors.goldLight }} />
                    <span style={{ fontSize: "14px", color: colors.inkLight, lineHeight: "1.5" }}>{item}</span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ background: "#fdf8ff", border: "1px solid #d8c8e8", borderRadius: "10px", padding: "20px 24px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "14px" }}>
                <span style={{ fontSize: "22px" }}>💡</span>
                <div>
                  <div style={{ fontSize: "13px", color: "#7050a0", fontWeight: "600", marginBottom: "6px" }}>Know your rights as a homeowner.</div>
                  <div style={{ fontSize: "12px", color: "#9070b0", lineHeight: "1.6" }}>
                    Most states require HOAs to follow specific procedures before fining homeowners. If they skipped a hearing or failed to provide proper notice, their fine may be unenforceable.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 18px", background: colors.paperWarm, borderRadius: "8px", border: `1px solid ${colors.borderLight}`, fontSize: "11px", color: colors.inkFaint, lineHeight: "1.7" }}>
              <strong>Legal Disclaimer:</strong> This letter is AI-generated and does not constitute legal advice. Review all content for accuracy before sending. For complex matters, consult a licensed attorney.
            </div>

            <div style={{ marginTop: "24px", textAlign: "center", padding: "20px", background: colors.white, borderRadius: "10px", border: `1px solid ${colors.borderLight}` }}>
              <div style={{ fontSize: "14px", color: colors.inkMuted, marginBottom: "6px" }}>Did your HOA back down?</div>
              <div style={{ fontSize: "12px", color: colors.inkFaint }}>Share your outcome → <span style={{ color: colors.goldLight }}>results@hoafight.com</span></div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        body { margin: 0; }
        @media print { button { display: none !important; } body { background: #fff; } }
      `}</style>

      <footer style={{ textAlign: "center", padding: "16px", fontSize: "0.72rem", color: "#888", borderTop: "1px solid #e5e0d6", marginTop: "40px" }}>
        FightMyHOA v1.3 · © 2026 The Super Simple Software Company · support@buyappsonce.com
      </footer>
    </div>
  );
}
