// fallbrain · triage.mjs — the missing first step: turn a REAL inbound message into the structured
// counts nextAction() already consumes (coolingExpired, complaintsOpen, cddPending, reviewsDue,
// invoicesUnpaid, docsAwaited). Today those counts are hand-typed into number inputs; this is the
// law that could derive them from an actual letter instead — a genuine structured-extraction task
// the company genuinely does, not the free-text letter-drafting loop force-fitted into a JSON gate.
//
// Composes cascade.mjs's cascade() for the pricing law (does NOT duplicate shouldEscalate) — this
// file adds the DOMAIN vocabulary only: which categories exist, and which state field each feeds.
// No I/O here: the two-round local-then-limb model call lives in the page (same separation as
// draft.mjs/localComplete already use) — this kernel only judges what came back. Pure and total:
// garbage in -> { ok:false, why }, never a throw.

import { cascade, ASK_COST, LIMB_COST, sha256, canon } from './cascade.mjs';

const isStr = (v) => typeof v === 'string';
const isObj = (v) => (v && typeof v === 'object' && !Array.isArray(v));
const HEX = /^[0-9a-f]+$/;
const isHash = (v) => isStr(v) && v.length === 64 && HEX.test(v);

export const TRIAGE_FORMAT = Object.freeze({ type: 'json', required: ['category', 'urgency'] });

// each category names the fallbrain state field it feeds when recognized. 'general' feeds nothing —
// not every inbound message is actionable, and inventing a bucket for it would be a silent miscount.
export const CATEGORY_FIELD = Object.freeze({
  'cooling-cancellation': 'coolingExpired',
  'complaint': 'complaintsOpen',
  'cdd-document': 'cddPending',
  'kyc-update': 'reviewsDue',
  'payment': 'invoicesUnpaid',
  'document': 'docsAwaited',
  'general': null,
});
export const CATEGORIES = Object.freeze(Object.keys(CATEGORY_FIELD));
export const URGENCIES = Object.freeze(['standard', 'high']);

/** parseTriage(output) — extract {category, urgency} from a model's JSON answer, validated against
 *  the known taxonomy. A shape that parses but names an unrecognised category is refused, never
 *  guessed past — an invented category would silently feed the wrong (or no) state field. */
export function parseTriage(output) {
  if (!isStr(output)) return { ok: false, why: 'no output to parse' };
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1) return { ok: false, why: 'no JSON object in the answer' };
  if (end === -1) return { ok: false, why: 'no JSON object in the answer' };
  if (end < start) return { ok: false, why: 'no JSON object in the answer' };
  let obj;
  try { obj = JSON.parse(output.slice(start, end + 1)); } catch (e) { return { ok: false, why: 'the answer’s JSON does not parse' }; }
  if (!isObj(obj)) return { ok: false, why: 'the answer’s JSON is not an object' };
  if (!isStr(obj.category)) return { ok: false, why: 'the answer has no category' };
  if (!CATEGORIES.includes(obj.category)) return { ok: false, why: 'unrecognised category: ' + obj.category };
  if (!isStr(obj.urgency)) return { ok: false, why: 'the answer has no urgency' };
  if (!URGENCIES.includes(obj.urgency)) return { ok: false, why: 'unrecognised urgency: ' + obj.urgency };
  return { ok: true, category: obj.category, urgency: obj.urgency, field: CATEGORY_FIELD[obj.category] };
}

/** triageOutcome(localOutput, escalatedOutput) — the whole judged pipeline for one message: which
 *  tier answered (via cascade.mjs's real pricing law) and, for whichever answer actually held
 *  format, what it means for the company's state. An escalation with no limb answer supplied, or a
 *  limb answer that ALSO doesn't hold format, is named honestly — never guessed past. */
export function triageOutcome(localOutput, escalatedOutput) {
  const decision = { action: 'triage-correspondence' };
  const local = cascade(decision, localOutput, TRIAGE_FORMAT);
  if (!local.ok) return local;
  if (local.tier === 'local') {
    const p = parseTriage(localOutput);
    return {
      ok: true, tier: 'local', cost: ASK_COST, by: null, resolved: p.ok,
      category: p.ok ? p.category : null, urgency: p.ok ? p.urgency : null, field: p.ok ? p.field : null,
      why: p.ok ? ('recognised as ' + p.category + (p.field ? ' — feeds ' + p.field : ' — informational, no state field')) : ('local model held JSON shape but not the taxonomy: ' + p.why),
    };
  }
  // escalated: the page should have made a SECOND real call and handed us that answer to judge
  if (!isStr(escalatedOutput)) {
    return { ok: true, tier: 'escalated', cost: LIMB_COST, by: null, resolved: false, category: null, urgency: null, field: null, why: 'local model did not hold format (' + local.why + ') and no limb answer was supplied to judge' };
  }
  const p2 = parseTriage(escalatedOutput);
  return {
    ok: true, tier: 'escalated', cost: LIMB_COST, by: 'limb', resolved: p2.ok,
    category: p2.ok ? p2.category : null, urgency: p2.ok ? p2.urgency : null, field: p2.ok ? p2.field : null,
    why: p2.ok ? ('local model did not hold format — the limb answered: recognised as ' + p2.category + (p2.field ? ' — feeds ' + p2.field : ' — informational, no state field')) : ('local model did not hold format, and the limb did not either: ' + p2.why),
  };
}

/** triageReceipt(input) — seals one triage outcome into a re-verifiable, provenance-bindable
 *  receipt. taskHash binds on the inbound text + both raw outputs, so the receipt is a claim about
 *  THIS exact message and THESE exact answers, not a description anyone could substitute later. */
export function triageReceipt(input) {
  if (!isObj(input)) return { ok: false, why: 'triageReceipt takes an object' };
  const { text, localOutput, escalatedOutput, holder, createdAt } = input;
  if (!isStr(text)) return { ok: false, why: 'the receipt needs the inbound text' };
  if (text.trim().length === 0) return { ok: false, why: 'the receipt needs non-empty inbound text' };
  if (!isStr(holder)) return { ok: false, why: 'the receipt needs a holder' };
  if (holder.trim().length === 0) return { ok: false, why: 'the receipt needs a non-empty holder' };
  if (!isStr(createdAt)) return { ok: false, why: 'the receipt needs a createdAt timestamp' };
  if (createdAt.length === 0) return { ok: false, why: 'the receipt needs a non-empty createdAt timestamp' };
  const o = triageOutcome(localOutput, escalatedOutput);
  if (!o.ok) return o;
  const th = sha256(canon({ text, localOutput: isStr(localOutput) ? localOutput : null, escalatedOutput: isStr(escalatedOutput) ? escalatedOutput : null }));
  if (!th.ok) return { ok: false, why: th.why };
  const body = {
    v: 1,
    kind: 'fallbrain-triage',
    tier: o.tier, cost: o.cost, by: o.by,
    resolved: o.resolved, category: o.category, urgency: o.urgency, field: o.field,
    why: o.why,
    holder: holder.trim(), taskHash: th.hash, createdAt,
    scope: 'One judged triage of one real inbound message: which tier answered, what it cost, and — only if some answer actually held the required shape — which company state field it feeds. Proves the escalation rule and the taxonomy were applied honestly to this message, not that the category is objectively correct or that anything was acted on.',
  };
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  return { ok: true, receipt: { ...body, hash: h.hash } };
}

/** triageSignable(receipt) — the exact canonical bytes an Ed25519 signature covers (minus signature). */
export function triageSignable(receipt) {
  if (!isObj(receipt)) return { ok: false, why: 'not a fallbrain triage receipt' };
  if (receipt.kind !== 'fallbrain-triage') return { ok: false, why: 'not a fallbrain triage receipt' };
  if (!isHash(receipt.hash)) return { ok: false, why: 'the receipt has no hash' };
  const body = { ...receipt };
  delete body.signature;
  return { ok: true, payload: canon(body) };
}

/** verifyTriageReceipt(r) — matches its own hash AND resolved/category/field are mutually
 *  consistent (a resolved receipt must name a category; an unresolved one must name none). */
export function verifyTriageReceipt(r) {
  if (!isObj(r)) return { ok: false, why: 'not a fallbrain triage receipt' };
  if (r.kind !== 'fallbrain-triage') return { ok: false, why: 'not a fallbrain triage receipt' };
  if (!isHash(r.hash)) return { ok: false, why: 'the receipt has no hash' };
  const body = { ...r };
  delete body.hash;
  delete body.signature;
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  if (h.hash !== r.hash) return { ok: true, valid: false, why: 'the receipt does not match its own fingerprint — it was changed after it was issued' };
  if (typeof r.resolved !== 'boolean') return { ok: true, valid: false, why: 'the receipt has no resolved flag' };
  if (r.resolved) {
    if (!isStr(r.category)) return { ok: true, valid: false, why: 'a resolved receipt must name a category' };
    if (!CATEGORIES.includes(r.category)) return { ok: true, valid: false, why: 'the receipt names an unrecognised category' };
    if (!isStr(r.urgency)) return { ok: true, valid: false, why: 'a resolved receipt must name an urgency' };
    if (CATEGORY_FIELD[r.category] !== r.field) return { ok: true, valid: false, why: 'the receipt’s field does not match its own category' };
  } else {
    if (r.category !== null) return { ok: true, valid: false, why: 'an unresolved receipt must not name a category' };
    if (r.field !== null) return { ok: true, valid: false, why: 'an unresolved receipt must not name a field' };
  }
  return { ok: true, valid: true, why: 'triage intact' };
}
