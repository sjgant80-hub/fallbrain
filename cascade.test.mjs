import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_COST, LIMB_COST, sha256, canon,
  shouldEscalate, cascade, cascadeReceipt, cascadeSignable, verifyCascadeReceipt,
} from './cascade.mjs';

test('shouldEscalate: ported from fallnode verbatim — a held format stands, every failure mode escalates', () => {
  const F = { type: 'json', required: ['category', 'urgency'] };
  const E = (out) => shouldEscalate(out, F);
  assert.equal(E('{"category":"refund","urgency":"high"}').escalate, false);
  assert.equal(E('Sure! {"category":"refund","urgency":"low","extra":1} done').escalate, false);   // wrapped is fine
  assert.equal(E('{"category":"refund"}').escalate, true);              // missing required field
  assert.match(E('{"category":"refund"}').why, /urgency/);              // names the missing field
  assert.equal(E('no json here').escalate, true);
  assert.equal(E('{"category": "refund"').escalate, true);              // unbalanced
  assert.equal(E('{bad json}').escalate, true);
  assert.equal(E(12).escalate, true);                                   // no output
  assert.equal(E('[1,2]').escalate, true);                              // no object
  assert.equal(shouldEscalate('anything at all', { type: 'any' }).escalate, false);
  assert.equal(shouldEscalate('x', { type: 'vibes' }).ok, false);       // unknown format refuses
  assert.equal(shouldEscalate('x', { type: 'json' }).ok, false);        // json without required refuses
  assert.equal(shouldEscalate('x', { type: 'json', required: ['a', ''] }).ok, false);
  assert.equal(shouldEscalate('x', { type: 'json', required: ['a', 7] }).ok, false);
  assert.equal(shouldEscalate('x', null).ok, false);
  assert.equal(ASK_COST, 1);
  assert.equal(LIMB_COST, 5);
});

const F = { type: 'json', required: ['category', 'urgency'] };
const decision = { organ: 'intake', action: 'process-cooling-cancellation' };

test('cascade: local when the format holds, escalated (and priced higher) when it does not', () => {
  const held = cascade(decision, '{"category":"refund","urgency":"high"}', F);
  assert.equal(held.ok, true);
  assert.equal(held.tier, 'local');
  assert.equal(held.cost, ASK_COST);
  assert.equal(held.action, 'process-cooling-cancellation');

  const broke = cascade(decision, '{"category":"refund"}', F);
  assert.equal(broke.ok, true);
  assert.equal(broke.tier, 'escalated');
  assert.equal(broke.cost, LIMB_COST);
  assert.ok(broke.why.includes('urgency'), 'names the actual failure, got: ' + broke.why);

  // free-form actions never escalate
  assert.equal(cascade(decision, 'anything', { type: 'any' }).tier, 'local');

  // refusals
  assert.equal(cascade(null, 'x', F).ok, false);
  assert.equal(cascade({}, 'x', F).ok, false);            // no action
  assert.equal(cascade(decision, 'x', { type: 'vibes' }).ok, false);   // propagates shouldEscalate's own refusal
});

test('cascadeReceipt: seals a decision, binds a taskHash, refuses only on malformed input', () => {
  const r = cascadeReceipt({ decision, output: '{"category":"refund","urgency":"high"}', format: F, holder: 'ada', createdAt: '2026-09-19T00:00:00Z' });
  assert.equal(r.ok, true);
  assert.equal(r.receipt.kind, 'fallbrain-cascade');
  assert.equal(r.receipt.tier, 'local');
  assert.equal(r.receipt.cost, ASK_COST);
  assert.equal(r.receipt.holder, 'ada');
  assert.equal(r.receipt.taskHash.length, 64);
  assert.equal(r.receipt.hash.length, 64);
  assert.equal(verifyCascadeReceipt(r.receipt).valid, true);

  // the SAME decision+output always binds to the SAME taskHash (reproducible, not random)
  const r2 = cascadeReceipt({ decision, output: '{"category":"refund","urgency":"high"}', format: F, holder: 'bob', createdAt: 't2' });
  assert.equal(r2.receipt.taskHash, r.receipt.taskHash);
  // a DIFFERENT output binds to a different taskHash
  const r3 = cascadeReceipt({ decision, output: '{"category":"refund"}', format: F, holder: 'ada', createdAt: 't' });
  assert.notEqual(r3.receipt.taskHash, r.receipt.taskHash);
  assert.equal(r3.receipt.tier, 'escalated');
  assert.equal(r3.receipt.cost, LIMB_COST);

  // refusals
  assert.equal(cascadeReceipt('nope').ok, false);
  assert.equal(cascadeReceipt({ decision, output: 'x', format: F, holder: '', createdAt: 't' }).ok, false);   // empty holder
  assert.equal(cascadeReceipt({ decision, output: 'x', format: F, holder: 'ada', createdAt: '' }).ok, false); // empty createdAt
  assert.equal(cascadeReceipt({ decision, output: 'x', format: F, holder: 'ada' }).ok, false);                // no createdAt
  assert.equal(cascadeReceipt({ decision: null, output: 'x', format: F, holder: 'ada', createdAt: 't' }).ok, false); // propagates cascade's refusal

  const s = cascadeSignable(r.receipt);
  assert.equal(s.payload.includes('"signature"'), false);
  assert.equal(s.payload.includes(r.receipt.hash), true);
  assert.equal(cascadeSignable({ ...r.receipt, signature: { alg: 'Ed25519' } }).payload, s.payload);
  assert.equal(cascadeSignable({ kind: 'other' }).ok, false);
  assert.equal(cascadeSignable({ kind: 'fallbrain-cascade' }).ok, false);   // no hash
});

test('verifyCascadeReceipt: catches tamper AND a cost that does not match its own tier', () => {
  const local = cascadeReceipt({ decision, output: '{"category":"refund","urgency":"high"}', format: F, holder: 'ada', createdAt: 't' }).receipt;
  const escalated = cascadeReceipt({ decision, output: '{"category":"refund"}', format: F, holder: 'ada', createdAt: 't' }).receipt;
  assert.equal(verifyCascadeReceipt(local).valid, true);
  assert.equal(verifyCascadeReceipt(escalated).valid, true);
  assert.equal(verifyCascadeReceipt({ ...local, holder: 'mallory' }).valid, false);   // tamper -> hash mismatch

  // forge: claim tier local but keep the escalated (higher) cost, re-hash consistently
  const b1 = { ...escalated }; delete b1.hash; delete b1.signature;
  b1.tier = 'local';
  const forgedTier = { ...b1, hash: sha256(canon(b1)).hash };
  const v1 = verifyCascadeReceipt(forgedTier);
  assert.equal(v1.valid, false);
  assert.ok(v1.why.includes('cost'), 'the mismatch is named, got: ' + v1.why);

  // forge: keep tier local but claim the escalated cost
  const b2 = { ...local }; delete b2.hash; delete b2.signature;
  b2.cost = LIMB_COST;
  const forgedCost = { ...b2, hash: sha256(canon(b2)).hash };
  assert.equal(verifyCascadeReceipt(forgedCost).valid, false);

  // an invalid tier string entirely
  const b3 = { ...local }; delete b3.hash; delete b3.signature;
  b3.tier = 'frontier-always';
  const forgedTierName = { ...b3, hash: sha256(canon(b3)).hash };
  assert.equal(verifyCascadeReceipt(forgedTierName).valid, false);

  assert.equal(verifyCascadeReceipt({ kind: 'other', hash: 'x' }).ok, false);
  assert.equal(verifyCascadeReceipt({ kind: 'fallbrain-cascade' }).ok, false);   // no hash
  // a hash that's a non-empty STRING but the wrong shape (kills the isHash && -> || collapse: a
  // bare isStr check alone must not be enough to pass the guard)
  assert.equal(verifyCascadeReceipt({ kind: 'fallbrain-cascade', hash: 'short' }).ok, false);
  assert.equal(verifyCascadeReceipt({ kind: 'fallbrain-cascade', hash: 'X'.repeat(64) }).ok, false);   // 64 chars, non-hex
});

test('sha256 + canon: the vendored pair still holds (FIPS-pinned, order-blind)', () => {
  assert.equal(sha256('abc').hash, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(7).ok, false);
  assert.equal(canon({ b: 1, a: 2 }), canon({ a: 2, b: 1 }));
  assert.equal(canon(5), '5');
  assert.equal(canon(true), 'true');
  assert.equal(canon(false), 'false');
  assert.equal(canon(null), 'null');
  assert.equal(canon('x'), '"x"');
});
