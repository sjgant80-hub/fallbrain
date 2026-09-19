import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escalationSignal, MIN_SAMPLE } from './signal.mjs';
import { appendReceipt, verifyLedgerChain } from './ledger.mjs';
import { triageReceipt } from './triage.mjs';
import { cascadeReceipt } from './cascade.mjs';

let seq = 0;
function localResolved(category, n = seq++) {
  const r = triageReceipt({
    text: 'message ' + n, holder: 'h', createdAt: '2026-09-19T00:00:' + (n % 60).toString().padStart(2, '0') + 'Z',
    localOutput: JSON.stringify({ category, urgency: 'standard' }), escalatedOutput: null,
  });
  assert.equal(r.ok, true, 'fixture must be genuinely valid: ' + JSON.stringify(r));
  return r.receipt;
}
function escalatedResolved(category, n = seq++) {
  const r = triageReceipt({
    text: 'message ' + n, holder: 'h', createdAt: '2026-09-19T00:01:' + (n % 60).toString().padStart(2, '0') + 'Z',
    localOutput: 'not json at all', escalatedOutput: JSON.stringify({ category, urgency: 'high' }),
  });
  assert.equal(r.ok, true, 'fixture must be genuinely valid: ' + JSON.stringify(r));
  assert.equal(r.receipt.tier, 'escalated');
  return r.receipt;
}
function unresolved(n = seq++) {
  const r = triageReceipt({
    text: 'message ' + n, holder: 'h', createdAt: '2026-09-19T00:02:' + (n % 60).toString().padStart(2, '0') + 'Z',
    localOutput: 'not json at all', escalatedOutput: null,
  });
  assert.equal(r.ok, true);
  assert.equal(r.receipt.resolved, false);
  return r.receipt;
}
function realCascade(n = seq++) {
  const r = cascadeReceipt({
    decision: { action: 'a' }, output: '{"category":"complaint","urgency":"standard"}',
    format: { type: 'json', required: ['category', 'urgency'] }, holder: 'h', createdAt: '2026-09-19T00:03:' + (n % 60).toString().padStart(2, '0') + 'Z',
  });
  assert.equal(r.ok, true);
  return r.receipt;
}

function chainOf(receipts) {
  let chain = [];
  for (const r of receipts) { const a = appendReceipt(chain, r); assert.equal(a.ok, true, a.why); chain = a.chain; }
  assert.equal(verifyLedgerChain(chain).valid, true);
  return chain;
}

// ---- empty / no-signal cases ----

test('escalationSignal on an empty ledger: honest zero, not an error', () => {
  const r = escalationSignal([]);
  assert.deepEqual(r, { ok: true, categories: [], unresolvedCount: 0, totalTriaged: 0, why: 'no triage receipts in the ledger yet — nothing to signal from' });
});

test('escalationSignal ignores cascade receipts entirely — only triage receipts carry a category', () => {
  const chain = chainOf([realCascade(), realCascade()]);
  const r = escalationSignal(chain);
  assert.equal(r.totalTriaged, 0);
  assert.deepEqual(r.categories, []);
});

// ---- real counting ----

test('escalationSignal counts local vs escalated correctly for a single category, below the sample floor', () => {
  const chain = chainOf([localResolved('complaint'), localResolved('complaint'), escalatedResolved('complaint')]);
  const r = escalationSignal(chain);
  assert.equal(r.totalTriaged, 3);
  assert.equal(r.categories.length, 1);
  const c = r.categories[0];
  assert.equal(c.category, 'complaint');
  assert.equal(c.total, 3);
  assert.equal(c.local, 2);
  assert.equal(c.escalated, 1);
  assert.equal(c.enoughSample, false);
  assert.match(c.flag, /below the 5-sample floor/);
});

test('escalationSignal flips enoughSample true exactly at MIN_SAMPLE, and reports a real percentage', () => {
  assert.equal(MIN_SAMPLE, 5);
  const receipts = [];
  for (let i = 0; i < 4; i++) receipts.push(localResolved('payment'));
  receipts.push(escalatedResolved('payment')); // 5th sample, 1 escalated
  const r = escalationSignal(chainOf(receipts));
  const c = r.categories.find((x) => x.category === 'payment');
  assert.equal(c.total, 5);
  assert.equal(c.enoughSample, true);
  assert.equal(c.escalationRate, 0.2);
  assert.match(c.flag, /20%/);
  assert.match(c.flag, /enough volume/);
});

test('escalationSignal separates unresolved receipts from every category — never folds them into a rate', () => {
  const chain = chainOf([localResolved('document'), unresolved(), unresolved()]);
  const r = escalationSignal(chain);
  assert.equal(r.unresolvedCount, 2);
  assert.equal(r.totalTriaged, 3);
  const c = r.categories.find((x) => x.category === 'document');
  assert.equal(c.total, 1); // unresolved receipts must not be counted into ANY category
});

test('escalationSignal: all-unresolved ledger names the taxonomy/prompt gap plainly, not a category problem', () => {
  const r = escalationSignal(chainOf([unresolved(), unresolved()]));
  assert.deepEqual(r.categories, []);
  assert.equal(r.unresolvedCount, 2);
  assert.match(r.why, /taxonomy or the prompt may be the gap/);
});

test('escalationSignal sorts categories by escalated count first, then total, descending', () => {
  const receipts = [
    ...Array(6).fill(0).map(() => localResolved('kyc-update')), // 6 total, 0 escalated
    ...Array(2).fill(0).map(() => localResolved('cdd-document')),
    escalatedResolved('cdd-document'), escalatedResolved('cdd-document'), escalatedResolved('cdd-document'), // 5 total, 3 escalated
  ];
  const r = escalationSignal(chainOf(receipts));
  assert.equal(r.categories[0].category, 'cdd-document'); // 3 escalated beats 0 escalated even with fewer total
  assert.equal(r.categories[1].category, 'kyc-update');
});

test('escalationSignal singularises "category" for exactly one recognised category (kills the ===1 boundary)', () => {
  const r = escalationSignal(chainOf([localResolved('complaint'), localResolved('complaint')]));
  assert.equal(r.categories.length, 1);
  assert.match(r.why, /across 1 recognised category,/);
  assert.doesNotMatch(r.why, /categories,/);
});

// ---- refuses to signal off broken data ----

test('escalationSignal refuses a ledger that does not verify — never signals off tampered history', () => {
  const chain = chainOf([localResolved('complaint')]);
  const tampered = [{ ...chain[0], entry: { ...chain[0].entry, category: 'payment' } }];
  const r = escalationSignal(tampered);
  assert.equal(r.ok, false);
  assert.match(r.why, /refused to signal off a ledger that does not verify/);
});

test('escalationSignal refuses malformed input without throwing', () => {
  assert.deepEqual(escalationSignal(null), { ok: false, why: 'the ledger is an array' });
  assert.deepEqual(escalationSignal('nope'), { ok: false, why: 'the ledger is an array' });
});
