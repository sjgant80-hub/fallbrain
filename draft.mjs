// fallbrain · draft.mjs — the drafting law: the local model WORDS drafts, this kernel governs them.
//
// Two halves, both deterministic so witness can gate them:
//   draftBrief(decision, ctx) — the exact instruction the model receives, per action. The brief is
//     LAW, not vibes: facts come only from ctx, missing facts become [PLACEHOLDERS], the model is
//     told it decides nothing. An unknown action is refused, not improvised.
//   acceptDraft(text) — the guard on what comes back: chat-template tokens (the tell a raw local
//     model leaks), model self-identification, aggressive tone (calm-and-firm gets outcomes;
//     aggression gets requests bounced — the redress-engine rule), and empty/thin output are all
//     REFUSED with the reason. No scrubber pass, no draft — the fallscrub doctrine at draft scale.
//
// The human at the door reviews every draft; this kernel just guarantees what reaches them is
// worded from the given facts and clean of machine tells.

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const str = (v) => (typeof v === 'string' ? v : '');

export const DRAFT_SYSTEM =
  'You word drafts for a human to review. You never make decisions, never invent facts, figures or law, ' +
  'never promise outcomes. Use ONLY the facts given; where a fact is missing write a placeholder like [DATE]. ' +
  'Calm, firm, plain British English. Output the draft only — no preamble, no commentary.';

// per-action briefs — facts drawn from ctx only; every brief states its constraints in the prompt
const BRIEFS = {
  'process-cooling-cancellation': (c) =>
    `Word a cancellation-processing letter for a UK claims firm${f(c, 'firm')}. A claimant${f(c, 'client')} cancelled within or after the 14-day cooling-off period which has now been processed. Confirm the cancellation is actioned, state that no further steps will be taken on the claim, invite them to keep the reference${f(c, 'ref')}, under 140 words.`,
  'draft-complaint-response': (c) =>
    `Word a first-response letter to a complainant${f(c, 'complainant')} for a UK claims firm${f(c, 'firm')}. Nature of complaint: ${c.nature ? q(c.nature) : '[NATURE OF COMPLAINT]'}. Acknowledge it, state who is handling it, state the next step and the eight-week timescale for a final response, no promises of outcome, under 160 words.`,
  'draft-cdd-verification': (c) =>
    `Word a client-due-diligence request letter to a claimant${f(c, 'client')} for a UK claims firm${f(c, 'firm')}. Ask for photo ID and proof of address to complete identity verification, explain the firm cannot progress the claim until verification completes, list acceptable documents as [ACCEPTED DOCUMENTS], under 150 words.`,
  'draft-kyc-review': (c) =>
    `Word a periodic-review letter to a claimant${f(c, 'client')} for a UK claims firm${f(c, 'firm')}. Explain the firm periodically reviews client details, ask them to confirm their contact details and circumstances are unchanged or reply with updates, under 120 words.`,
  'draft-payment-chaser': (c) =>
    `Word a polite payment-reminder letter${f(c, 'firm')} for invoice [INVOICE NUMBER] of [AMOUNT], due [DUE DATE]. Firm but courteous, note payment may already have crossed in the post, state how to pay as [PAYMENT DETAILS], under 120 words.`,
  'generate-documents': (c) =>
    `Word a short cover note${f(c, 'firm')} to accompany enclosed documents for a claimant${f(c, 'client')}: list the enclosures as [ENCLOSURES], say what the claimant should do with them and by when as [ACTION AND DATE], under 100 words.`,
};
function f(c, k) {
  if (k === 'firm') return c.firm ? ` (${q(c.firm)})` : '';
  if (k === 'client') return c.client ? ` (${q(c.client)})` : '';
  if (k === 'complainant') return c.complainant ? ` (${q(c.complainant)})` : '';
  if (k === 'ref') return c.ref ? ` (reference ${q(c.ref)})` : ' [REFERENCE]';
  return '';
}
const q = (s) => str(s).replace(/[\r\n]+/g, ' ').slice(0, 120);

/** Build the model's instruction for a decided action. Unknown actions are refused, not improvised. */
export function draftBrief(decision, ctx) {
  const d = obj(decision);
  if (!d || !str(d.action)) return { ok: false, why: 'draftBrief needs the decision the loop made ({ action, … })' };
  if (d.action === 'summarise-day') return { ok: false, why: 'summarise-day is the brain writing its own memory — there is no client-facing draft to word' };
  const b = BRIEFS[d.action];
  if (!b) return { ok: false, why: `no drafting brief exists for "${d.action}" — refusing to improvise an instruction` };
  const c = obj(ctx) || {};
  return { ok: true, action: d.action, system: DRAFT_SYSTEM, prompt: b(c) };
}

// the tells a raw local model leaks — any one of them means the draft is not clean
const CHAT_TOKENS = ['<|im_start|>', '<|im_end|>', '<|assistant|>', '<|user|>', '<|system|>', '[INST]', '[/INST]', '<<SYS>>', '<start_of_turn>', '<end_of_turn>', '<|eot_id|>'];
const SELF_ID = /\b(as an ai\b|as a language model|i am an ai\b|i'?m an ai\b)/i;
const AGGRESSION = /\b(sue you|or else\b|immediately or\b|final warning|we will not hesitate)\b|!{2,}/i;

/** The guard on the model's output. Refuses machine tells, self-ID, aggression, thin output. */
export function acceptDraft(text) {
  const t = str(text).trim();
  if (t.length < 40) return { ok: false, why: 'draft too thin to review — the model returned ' + (t.length === 0 ? 'nothing' : 'under 40 characters') };
  for (const tok of CHAT_TOKENS) if (t.includes(tok)) return { ok: false, why: `draft carries a chat-template token (${tok}) — a raw model tell; re-run the draft` };
  if (SELF_ID.test(t)) return { ok: false, why: 'draft identifies itself as an AI — a letter from the firm must not; re-run the draft' };
  const m = t.match(AGGRESSION);
  if (m) return { ok: false, why: `draft tone is aggressive ("${m[0]}") — calm and firm gets outcomes; aggression gets requests bounced` };
  return { ok: true, text: t, why: 'guard passed: no machine tells, no self-ID, tone reads calm' };
}

export default draftBrief;
