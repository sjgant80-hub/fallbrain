// fallbrain · brain.mjs — the company brain's LAW, gated so it can't drift.
//
// The estate already has the pieces: fallcore (the on-prem model), fallrouter (local⇄frontier),
// didy/fall-os (the conductor), fallcorp (the 90/10 company shape), and ~40 live organs (the tools
// that do the work). fallbrain is the ASSEMBLY: given a company spec it picks the organs, and given
// the organs' state it decides the next action — deterministically, so the deciding law is gateable.
// The LOCAL MODEL words drafts and reads free text; it never makes the call. This kernel makes the
// call, and every call speaks its reason.
//
// Three laws:
//   assemble(spec, organs)  — staff the company from the estate; REFUSE with named gaps, never
//                             silently under-staff (the empty-shelf defect class).
//   nextAction(state)       — the priority law: statutory clocks before money, money behind a door.
//   tick(state, grant)      — no action without a grant that covers it: capability × budget checked
//                             BEFORE the action (openkonomi doctrine — the 2.2M-leak made impossible).
//
// Pure and total: garbage in → { ok:false, why }, never a wrong action.

export const DOORS = Object.freeze(['money', 'legal', 'taste', 'client-trust']);
export const CAPABILITIES = Object.freeze([
  'intake', 'casework', 'documents', 'accounts', 'compliance',
  'sales', 'hiring', 'scheduling', 'invoicing', 'payments', 'forms',
]);

const str = (v) => (typeof v === 'string' ? v : '');
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const nat = (v) => Number.isInteger(v) && v >= 0;

/** A company spec: a name, a vertical the estate staffs, and the capabilities it needs. */
export function validSpec(spec) {
  const s = obj(spec);
  if (!s) return { ok: false, why: 'not a company spec' };
  if (!str(s.name).trim()) return { ok: false, why: 'a company needs a name' };
  if (!str(s.vertical).trim()) return { ok: false, why: 'a company needs a vertical (e.g. claims, legal, accountancy)' };
  if (!Array.isArray(s.needs) || s.needs.length === 0) return { ok: false, why: 'a company needs at least one capability (e.g. intake, casework)' };
  for (const n of s.needs) if (!CAPABILITIES.includes(n)) return { ok: false, why: `"${str(n)}" is not a capability the estate staffs (${CAPABILITIES.join(', ')})` };
  return { ok: true, why: 'ok' };
}

/**
 * Staff the company. Every needed capability must resolve to a LIVE organ; a need the estate cannot
 * staff is a NAMED refusal, never a silent gap. The four doors are always human — they are not
 * organs and cannot be assembled away.
 */
export function assemble(spec, organMap) {
  const v = validSpec(spec);
  if (!v.ok) return v;
  const m = obj(organMap);
  if (!m || !obj(m.verticals) || !Array.isArray(m.shared)) return { ok: false, why: 'organMap must carry { verticals, shared } (generated from the estate index)' };
  const vertical = m.verticals[spec.vertical];
  if (!Array.isArray(vertical)) {
    return { ok: false, why: `the estate has no "${spec.vertical}" vertical — it staffs: ${Object.keys(m.verticals).join(', ')}` };
  }
  const pool = vertical.concat(m.shared);
  const organs = [], missing = [];
  for (const need of spec.needs) {
    const found = pool.filter((o) => o && o.capability === need);
    if (found.length === 0) missing.push(need);
    else organs.push(...found);
  }
  if (missing.length) {
    return { ok: false, why: `cannot staff ${spec.name}: no live organ covers ${missing.join(', ')} — a company assembled with silent gaps is the empty-shelf defect, so this refuses instead` };
  }
  // dedupe by name, keep first capability assignment
  const seen = new Set();
  const staff = organs.filter((o) => (seen.has(o.name) ? false : (seen.add(o.name), true)));
  return {
    ok: true,
    company: spec.name,
    vertical: spec.vertical,
    organs: staff,
    doors: DOORS.map((d) => ({ door: d, holder: 'human' })),
    why: `${staff.length} organs staffed across ${spec.needs.length} capabilities · all four doors human`,
  };
}

/**
 * The priority law. Given the organs' observed state (counts, all non-negative integers), decide the
 * ONE next action. Order is argued, not arbitrary:
 *   1 expired cooling-off  — a statutory cancellation right is live NOW            → legal door
 *   2 open complaints      — the DISP clock is running; silence compounds it       → client-trust door
 *   3 pending CDD          — AML: the firm must not act for an unverified client   → legal door
 *   4 reviews due          — periodic KYC review, drafted automatically            → auto
 *   5 unpaid invoices      — draft the chaser (auto); MOVING money is a door       → auto (draft only)
 *   6 documents awaited    — generate via the paper organ                          → auto
 *   7 idle                 — summarise the day into memory (the brain learns)      → auto
 * Every decision carries its reason; a decision that cannot speak is not a decision.
 */
export function nextAction(state) {
  const s = obj(state);
  if (!s) return { ok: false, why: 'not an observed state' };
  const fields = ['coolingExpired', 'complaintsOpen', 'cddPending', 'reviewsDue', 'invoicesUnpaid', 'docsAwaited'];
  for (const f of fields) {
    if (s[f] !== undefined && !nat(s[f])) return { ok: false, why: `${f} must be a non-negative integer count` };
  }
  const n = (f) => (s[f] === undefined ? 0 : s[f]);
  if (n('coolingExpired') > 0) return { ok: true, organ: 'intake', action: 'process-cooling-cancellation', count: n('coolingExpired'), door: 'legal', why: `${n('coolingExpired')} cooling-off period(s) expired — statutory cancellation processing queued at the legal door` };
  if (n('complaintsOpen') > 0) return { ok: true, organ: 'intake', action: 'draft-complaint-response', count: n('complaintsOpen'), door: 'client-trust', why: `${n('complaintsOpen')} open complaint(s) — DISP clock running; response drafted, queued at the client-trust door` };
  if (n('cddPending') > 0) return { ok: true, organ: 'intake', action: 'draft-cdd-verification', count: n('cddPending'), door: 'legal', why: `${n('cddPending')} claimant(s) awaiting CDD — AML bars acting for unverified clients; verification queued at the legal door` };
  if (n('reviewsDue') > 0) return { ok: true, organ: 'intake', action: 'draft-kyc-review', count: n('reviewsDue'), door: null, why: `${n('reviewsDue')} periodic KYC review(s) due — drafts prepared automatically` };
  if (n('invoicesUnpaid') > 0) return { ok: true, organ: 'invoicing', action: 'draft-payment-chaser', count: n('invoicesUnpaid'), door: null, why: `${n('invoicesUnpaid')} unpaid invoice(s) — chasers drafted; any actual money movement would queue at the money door` };
  if (n('docsAwaited') > 0) return { ok: true, organ: 'documents', action: 'generate-documents', count: n('docsAwaited'), door: null, why: `${n('docsAwaited')} document(s) awaited — generated via the paper organ` };
  return { ok: true, organ: 'memory', action: 'summarise-day', count: 0, door: null, why: 'nothing urgent — summarising the day into memory so tomorrow starts smarter' };
}

/**
 * One governed tick. The action nextAction chose runs ONLY if the grant covers it: the organ's
 * capability must be granted and the action budget must not be exhausted — checked BEFORE the act.
 * Door actions never auto-run: they queue for the human key regardless of grant. Pure: returns the
 * decision + the new budget, mutates nothing.
 */
export function tick(state, grant) {
  const g = obj(grant);
  if (!g || !Array.isArray(g.capabilities) || !nat(g.budget)) {
    return { ok: false, why: 'a tick needs a grant: { capabilities: [...], budget: n } — no grant, no action (the wallet rule)' };
  }
  const d = nextAction(state);
  if (!d.ok) return d;
  const capNeeded = d.organ === 'memory' ? null : d.organ;
  if (capNeeded && !g.capabilities.includes(capNeeded)) {
    return { ok: true, acted: false, decision: d, budget: g.budget, why: `REFUSED: the grant does not cover "${capNeeded}" — the brain cannot exceed its grant, so the action is dropped, not smuggled` };
  }
  if (g.budget === 0) {
    return { ok: true, acted: false, decision: d, budget: 0, why: 'REFUSED: action budget exhausted — the loop stops here until a human renews the grant' };
  }
  if (d.door) {
    return { ok: true, acted: false, queued: d.door, decision: d, budget: g.budget, why: `queued at the ${d.door} door — ${d.why}. A human turns this key; the brain never does` };
  }
  return { ok: true, acted: true, decision: d, budget: g.budget - 1, why: d.why };
}

export default assemble;
