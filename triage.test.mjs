import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_COST, LIMB_COST, sha256, canon } from './cascade.mjs';
import {
  TRIAGE_FORMAT, CATEGORIES, CATEGORY_FIELD, URGENCIES,
  parseTriage, triageOutcome, triageReceipt, triageSignable, verifyTriageReceipt,
} from './triage.mjs';

test('CATEGORY_FIELD: every category maps to a real fallbrain state field, or honestly to none', () => {
  assert.deepEqual(CATEGORIES, ['cooling-cancellation', 'complaint', 'cdd-document', 'kyc-update', 'payment', 'document', 'general']);
  assert.equal(CATEGORY_FIELD['cooling-cancellation'], 'coolingExpired');
  assert.equal(CATEGORY_FIELD['complaint'], 'complaintsOpen');
  assert.equal(CATEGORY_FIELD['cdd-document'], 'cddPending');
  assert.equal(CATEGORY_FIELD['kyc-update'], 'reviewsDue');
  assert.equal(CATEGORY_FIELD['payment'], 'invoicesUnpaid');
  assert.equal(CATEGORY_FIELD['document'], 'docsAwaited');
  assert.equal(CATEGORY_FIELD['general'], null);
  assert.deepEqual(URGENCIES, ['standard', 'high']);
});

test('parseTriage: only a known category+urgency resolves; an unknown one is refused, not guessed', () => {
  assert.deepEqual(parseTriage('{"category":"complaint","urgency":"high"}'), { ok: true, category: 'complaint', urgency: 'high', field: 'complaintsOpen' });
  assert.equal(parseTriage('{"category":"general","urgency":"standard"}').field, null);
  assert.equal(parseTriage('Sure! {"category":"payment","urgency":"standard"} there you go').ok, true);   // wrapped is fine

  const badCat = parseTriage('{"category":"vibes","urgency":"high"}');
  assert.equal(badCat.ok, false);
  assert.match(badCat.why, /unrecognised category/);
  const badUrg = parseTriage('{"category":"payment","urgency":"asap"}');
  assert.equal(badUrg.ok, false);
  assert.match(badUrg.why, /unrecognised urgency/);

  assert.equal(parseTriage('no json here').ok, false);
  assert.equal(parseTriage('{"category":"payment"').ok, false);       // unbalanced
  assert.equal(parseTriage('{bad json}').ok, false);
  assert.equal(parseTriage(null).ok, false);
  assert.equal(parseTriage(42).ok, false);
  assert.equal(parseTriage('[1,2]').ok, false);
  assert.equal(parseTriage('{"urgency":"high"}').ok, false);          // missing category
  assert.match(parseTriage('{"urgency":"high"}').why, /category/);
});

test('triageOutcome: local when the small model holds the taxonomy; escalates and re-judges the limb otherwise', () => {
  const heldLocal = triageOutcome('{"category":"cdd-document","urgency":"standard"}', null);
  assert.equal(heldLocal.tier, 'local');
  assert.equal(heldLocal.cost, ASK_COST);
  assert.equal(heldLocal.resolved, true);
  assert.equal(heldLocal.field, 'cddPending');
  assert.equal(heldLocal.by, null);

  // local breaks JSON shape entirely -> escalates; no limb answer supplied -> honestly unresolved
  const noLimb = triageOutcome('not json at all', null);
  assert.equal(noLimb.tier, 'escalated');
  assert.equal(noLimb.cost, LIMB_COST);
  assert.equal(noLimb.resolved, false);
  assert.match(noLimb.why, /no limb answer was supplied/);

  // local breaks -> limb answers and holds -> resolved via the limb, labelled
  const limbHeld = triageOutcome('garbled', '{"category":"complaint","urgency":"high"}');
  assert.equal(limbHeld.tier, 'escalated');
  assert.equal(limbHeld.by, 'limb');
  assert.equal(limbHeld.resolved, true);
  assert.equal(limbHeld.category, 'complaint');
  assert.equal(limbHeld.field, 'complaintsOpen');

  // local breaks -> limb ALSO breaks -> honestly unresolved, not guessed
  const bothBroke = triageOutcome('garbled', 'also garbled');
  assert.equal(bothBroke.tier, 'escalated');
  assert.equal(bothBroke.resolved, false);
  assert.match(bothBroke.why, /the limb did not either/);

  // local holds JSON shape but names an unrecognised category — NOT an escalation (the format held,
  // shouldEscalate only checks required fields present, not their values) — honestly unresolved locally
  const knownShapeBadTaxonomy = triageOutcome('{"category":"vibes","urgency":"high"}', null);
  assert.equal(knownShapeBadTaxonomy.tier, 'local');
  assert.equal(knownShapeBadTaxonomy.resolved, false);

  assert.equal(triageOutcome(null, null).tier, 'escalated');   // no output at all still escalates honestly
});

test('triageReceipt: seals a judged outcome, binds a taskHash to the real text+outputs, refuses only on malformed input', () => {
  const r = triageReceipt({ text: 'Please cancel my claim, I am within the cooling off period.', localOutput: '{"category":"cooling-cancellation","urgency":"standard"}', escalatedOutput: null, holder: 'ada', createdAt: '2026-09-19T00:00:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.receipt.kind, 'fallbrain-triage');
  assert.equal(r.receipt.tier, 'local');
  assert.equal(r.receipt.resolved, true);
  assert.equal(r.receipt.category, 'cooling-cancellation');
  assert.equal(r.receipt.field, 'coolingExpired');
  assert.equal(r.receipt.hash.length, 64);
  assert.equal(verifyTriageReceipt(r.receipt).valid, true);

  // the same text+outputs bind to the same taskHash; a different text binds to a different one
  const r2 = triageReceipt({ text: 'Please cancel my claim, I am within the cooling off period.', localOutput: '{"category":"cooling-cancellation","urgency":"standard"}', escalatedOutput: null, holder: 'bob', createdAt: 't2' });
  assert.equal(r2.receipt.taskHash, r.receipt.taskHash);
  const r3 = triageReceipt({ text: 'a different message entirely', localOutput: '{"category":"cooling-cancellation","urgency":"standard"}', escalatedOutput: null, holder: 'ada', createdAt: 't' });
  assert.notEqual(r3.receipt.taskHash, r.receipt.taskHash);

  // refusals
  assert.equal(triageReceipt('nope').ok, false);
  assert.equal(triageReceipt({ text: '', localOutput: 'x', holder: 'ada', createdAt: 't' }).ok, false);       // empty text
  assert.equal(triageReceipt({ text: 'x', localOutput: 'x', holder: '', createdAt: 't' }).ok, false);          // empty holder
  assert.equal(triageReceipt({ text: 'x', localOutput: 'x', holder: 'ada', createdAt: '' }).ok, false);        // empty createdAt
  assert.equal(triageReceipt({ text: 'x', localOutput: 'x', holder: 'ada' }).ok, false);                       // no createdAt

  const s = triageSignable(r.receipt);
  assert.equal(s.payload.includes('"signature"'), false);
  assert.equal(s.payload.includes(r.receipt.hash), true);
  assert.equal(triageSignable({ ...r.receipt, signature: { alg: 'Ed25519' } }).payload, s.payload);
  assert.equal(triageSignable({ kind: 'other' }).ok, false);
  assert.equal(triageSignable({ kind: 'fallbrain-triage' }).ok, false);   // no hash

  // HOSTILE SHAPES — a function or array CARRYING the right-looking props is not an object (kills
  // the isObj && -> || collapse on both its guards; a plain malformed input like a bare string or
  // array is already refused by a LATER field-specific guard either way, which is exactly why that
  // isn't enough to prove isObj's own guard fires — these are loaded so nothing else masks it)
  const evilFn = () => {};
  Object.assign(evilFn, { text: 'msg', localOutput: '{"category":"payment","urgency":"standard"}', holder: 'ada', createdAt: 't' });
  assert.equal(triageReceipt(evilFn).ok, false);
  const evilArr = ['x'];
  Object.assign(evilArr, { text: 'msg', localOutput: '{"category":"payment","urgency":"standard"}', holder: 'ada', createdAt: 't' });
  assert.equal(triageReceipt(evilArr).ok, false);
});

test('verifyTriageReceipt: catches tamper, a resolved receipt with no category, and a field/category mismatch', () => {
  const resolved = triageReceipt({ text: 'msg', localOutput: '{"category":"payment","urgency":"standard"}', escalatedOutput: null, holder: 'ada', createdAt: 't' }).receipt;
  const unresolved = triageReceipt({ text: 'msg2', localOutput: 'garbled', escalatedOutput: null, holder: 'ada', createdAt: 't' }).receipt;
  assert.equal(verifyTriageReceipt(resolved).valid, true);
  assert.equal(verifyTriageReceipt(unresolved).valid, true);
  assert.equal(verifyTriageReceipt({ ...resolved, holder: 'mallory' }).valid, false);   // tamper -> hash mismatch

  // forge: claim resolved:true but with category:null, re-hash consistently
  const b1 = { ...resolved }; delete b1.hash; delete b1.signature;
  b1.category = null;
  const forgedNoCategory = { ...b1, hash: sha256(canon(b1)).hash };
  const v1 = verifyTriageReceipt(forgedNoCategory);
  assert.equal(v1.valid, false);
  assert.match(v1.why, /must name a category/);

  // forge: claim resolved:false but sneak a category in anyway
  const b2 = { ...unresolved }; delete b2.hash; delete b2.signature;
  b2.category = 'payment';
  const forgedSneakCategory = { ...b2, hash: sha256(canon(b2)).hash };
  assert.equal(verifyTriageReceipt(forgedSneakCategory).valid, false);

  // forge: category stays real but field is swapped to a DIFFERENT real field
  const b3 = { ...resolved }; delete b3.hash; delete b3.signature;
  b3.field = 'complaintsOpen';   // payment's real field is invoicesUnpaid
  const forgedField = { ...b3, hash: sha256(canon(b3)).hash };
  const v3 = verifyTriageReceipt(forgedField);
  assert.equal(v3.valid, false);
  assert.match(v3.why, /field does not match/);

  assert.equal(verifyTriageReceipt({ kind: 'other', hash: 'x' }).ok, false);
  assert.equal(verifyTriageReceipt({ kind: 'fallbrain-triage' }).ok, false);   // no hash
  // a hash that's a non-empty STRING but the wrong shape (kills the isHash && -> || collapse)
  assert.equal(verifyTriageReceipt({ kind: 'fallbrain-triage', hash: 'short' }).ok, false);
  assert.equal(verifyTriageReceipt({ kind: 'fallbrain-triage', hash: 'X'.repeat(64) }).ok, false);   // 64 chars, non-hex
  const b4 = { ...resolved }; delete b4.hash; delete b4.signature;
  const noResolvedFlag = { ...b4, resolved: 'yes' }; noResolvedFlag.hash = sha256(canon(noResolvedFlag)).hash;
  assert.equal(verifyTriageReceipt(noResolvedFlag).valid, false);
});
