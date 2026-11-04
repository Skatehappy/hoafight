// api/_checklist-fallbacks.js - per-dispute-type checklist content, shared by api/checklist.js (Edge-safe: no imports).
// `focus` steers the model; `steps` is the static fallback used when the model list is unusable (call failed,
// cut off twice, or too few items survived the citation/figure lock). Fallback items are plain action steps only:
// no statute, case, deadline, dollar amount, percentage or day count, so nothing here needs a VERIFICATION_LOG entry.

const COMMON_START = ['Send the letter by certified mail, return receipt requested, and keep the tracking number', 'Keep a complete copy of everything you send'];
const COMMON_END = ['Write down the date you sent the letter and the date any response arrives', 'If the problem is not resolved, consider a consult with an HOA attorney or a local homeowner advocacy group'];

export const TYPES = {
  'Wrongful Fine': {
    focus: 'a fine the HOA charged that the homeowner believes is wrongful',
    steps: ['Pull the exact CC&R or rule section the notice says you violated and read it closely', 'Photograph the property to document compliance or the condition cited, with dates visible', 'Request in writing a formal hearing before the board if the notice or your governing documents provide for one', 'Ask the board in writing for the evidence behind the fine and the written fine schedule it relied on'],
  },
  'Architectural Denial': {
    focus: 'an architectural or modification request that the HOA denied',
    steps: ['Keep a copy of your full application, plans and every attachment you submitted', 'Pull the architectural guidelines and the CC&R section the committee relied on', 'Ask the committee in writing for the specific reason for the denial and the criteria it applied', 'Collect photos of similar approved changes in the community, with addresses and dates', 'Ask in writing about the appeal or reconsideration process under your governing documents'],
  },
  'Inconsistent Enforcement': {
    focus: 'a rule the HOA enforces against the homeowner but not against others',
    steps: ['Photograph other homes with the same condition that were not cited, with dates and addresses noted', 'Write a dated list of each comparable property and what, if anything, the HOA did about it', 'Request the HOA enforcement records and violation history for the rule in question', 'Pull the CC&R section at issue and any board policy on how it is enforced', 'Request a formal hearing in writing if your governing documents provide for one'],
  },
  'Records Denied': {
    focus: 'an HOA refusing or ignoring a request for association records',
    steps: ['Keep a copy of your original records request and proof of how and when you sent it', 'List exactly which records you asked for, such as minutes, budgets, contracts or financial statements', "Check your state's HOA statute and your bylaws for the owner's right to inspect records", 'Note every reply, refusal or lack of reply from the board or management company, with dates', 'Offer a reasonable time and place to inspect or a way to receive copies, and put it in writing'],
  },
  'Special Assessment Dispute': {
    focus: 'a special assessment the homeowner disputes',
    steps: ['Request the board resolution or vote record that approved the assessment', 'Ask in writing for the budget, bids or reports that justify the assessment', 'Check your CC&Rs and bylaws for any owner vote or notice requirement for assessments', 'Request a written breakdown of how the amount was calculated and how it applies to your lot', 'Ask in writing about payment plan options while the dispute is open'],
  },
  'Election Irregularity': {
    focus: 'irregularities in an HOA board election or owner vote',
    steps: ['Write a dated account of each irregularity you saw, and who else witnessed it', 'Save the election notice, ballots, proxy forms and candidate materials you received', 'Check your bylaws for the notice, quorum, proxy and ballot rules that apply to elections', "Request the election records, including the ballot count and the inspector's report if there was one", 'Collect written statements from other owners who saw the same problem'],
  },
  'Failure to Maintain Common Areas': {
    focus: 'an HOA failing to maintain common areas or property it is responsible for',
    steps: ['Photograph and video each problem in the common area, with dates visible, and keep adding new dates', 'Keep a dated log of every request you made to the board or management company and each reply', 'Pull the CC&R section that makes the association responsible for maintaining the area', 'Note any safety risk or damage to your property and keep repair estimates or receipts', 'Ask the board in writing for a repair plan and a schedule'],
  },
  'Board Harassment / Targeted Enforcement': {
    focus: 'a board singling out the homeowner for harassment or targeted enforcement',
    steps: ['Build a dated timeline of each notice, fine, comment or action directed at you', 'Save every email, letter and notice, and keep photos of the conditions cited', 'Document comparable homes that were treated differently, with dates and addresses', 'Request the enforcement records and board minutes that mention your home', 'Keep all communication with the board in writing and polite'],
  },
  'HOA Fee / Dues Dispute': {
    focus: 'a dispute over HOA dues, fees or an account balance',
    steps: ['Request a full written ledger of charges, payments and late fees on your account', 'Gather your own payment records: bank statements, cancelled checks or receipts', 'Compare each charge with the fee schedule in your CC&Rs, bylaws or board resolutions', 'Mark each charge you dispute and say why, item by item', 'Ask in writing how payments were applied and about payment options while the dispute is open'],
  },
  'Other': {
    focus: 'an HOA dispute not covered by the other categories',
    steps: ['Write a short dated timeline of what happened and what you asked the HOA to do', 'Gather the notices, emails, photos and governing-document sections that relate to the dispute', 'Pull the CC&R or bylaw section that applies and read it closely', 'State clearly in your letter what resolution you want and the date you are asking for a reply'],
  },
};

const NEUTRAL = { focus: 'an HOA dispute', steps: TYPES['Other'].steps };
const norm = s => String(s || '').trim().toLowerCase();
export function typeInfo(disputeType) {
  const k = Object.keys(TYPES).find(t => norm(t) === norm(disputeType));
  return k ? TYPES[k] : NEUTRAL;
}
export function fallbackFor(disputeType) {
  return [...COMMON_START, ...typeInfo(disputeType).steps, ...COMMON_END];
}
