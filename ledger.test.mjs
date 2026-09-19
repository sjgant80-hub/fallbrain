import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendReceipt, verifyLedgerChain } from './ledger.mjs';
import { cascadeReceipt, sha256, canon } from './cascade.mjs';
import { triageReceipt } from './triage.mjs';

// ---- real, valid receipts built through the REAL sealing functions, not hand-shaped objects ----

function realCascadeReceipt(action = 'triage-correspondence', n = 0) {
  const r = cascadeReceipt({
    decision: { action },
    output: '{"category":"complaint","urgency":"standard"}',
    format: { type: 'json', required: ['category', 'urgency'] },
    holder: 'test-holder',
    createdAt: '2026-09-19T00:00:0' + n + 'Z',
  });
  assert.equal(r.ok, true, 'test fixture itself must be a genuinely valid receipt');
  return r.receipt;
}

function realTriageReceipt(n = 0) {
  const r = triageReceipt({
    text: 'please cancel my policy, message ' + n,
    localOutput: '{"category":"complaint","urgency":"standard"}',
    escalatedOutput: null,
    holder: 'test-holder',
    createdAt: '2026-09-19T00:00:1' + n + 'Z',
  });
  assert.equal(r.ok, true, 'test fixture itself must be a genuinely valid receipt');
  return r.receipt;
}

// ---- appendReceipt ----

test('appendReceipt accepts a genuine cascade receipt onto an empty ledger, GENESIS-rooted', () => {
  const r = appendReceipt([], realCascadeReceipt());
  assert.equal(r.ok, true);
  assert.equal(r.chain.length, 1);
  assert.equal(r.chain[0].seq, 0);
  assert.equal(r.chain[0].prevHash, 'GENESIS');
  assert.equal(r.chain[0].kind, 'fallbrain-cascade');
});

test('appendReceipt accepts a genuine triage receipt too — both real kinds are welcome', () => {
  const r = appendReceipt([], realTriageReceipt());
  assert.equal(r.ok, true);
  assert.equal(r.chain[0].kind, 'fallbrain-triage');
});

test('appendReceipt chains a second entry off the first entry\'s real hash, not a fresh GENESIS', () => {
  const r1 = appendReceipt([], realCascadeReceipt('a', 0));
  const r2 = appendReceipt(r1.chain, realTriageReceipt(1));
  assert.equal(r2.ok, true);
  assert.equal(r2.chain.length, 2);
  assert.equal(r2.chain[1].seq, 1);
  assert.equal(r2.chain[1].prevHash, r1.chain[0].hash);
  assert.notEqual(r2.chain[1].hash, r1.chain[0].hash);
});

test('appendReceipt refuses an unrecognised receipt kind, never guesses one in', () => {
  const r = appendReceipt([], { kind: 'some-other-thing', hash: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.why, /not a receipt kind this ledger accepts/);
});

test('appendReceipt refuses a receipt that fails its OWN verify — a forged field, not just a wrong kind', () => {
  const good = realCascadeReceipt();
  const forged = { ...good, cost: 999 }; // tampered after sealing; hash no longer matches
  const r = appendReceipt([], forged);
  assert.equal(r.ok, false);
  assert.match(r.why, /refused: this receipt does not verify/);
});

test('appendReceipt refuses malformed inputs without throwing (chain, receipt, hostile shapes)', () => {
  assert.equal(appendReceipt('not-an-array', realCascadeReceipt()).ok, false);
  assert.equal(appendReceipt([], null).ok, false);
  assert.equal(appendReceipt([], 'not-an-object').ok, false);
  const evilArr = Object.assign([], { kind: 'fallbrain-cascade', hash: 'x'.repeat(64) });
  assert.equal(appendReceipt([], evilArr).ok, false); // hostile shape must not slip past isObj
});

// ---- verifyLedgerChain ----

test('verifyLedgerChain: empty ledger is trivially valid', () => {
  const v = verifyLedgerChain([]);
  assert.deepEqual(v, { ok: true, valid: true, length: 0 });
});

test('verifyLedgerChain: a chain built honestly through appendReceipt verifies clean', () => {
  const r1 = appendReceipt([], realCascadeReceipt('a', 0));
  const r2 = appendReceipt(r1.chain, realTriageReceipt(1));
  const r3 = appendReceipt(r2.chain, realCascadeReceipt('b', 2));
  const v = verifyLedgerChain(r3.chain);
  assert.equal(v.ok, true);
  assert.equal(v.valid, true);
  assert.equal(v.length, 3);
});

test('verifyLedgerChain catches a receipt tampered AFTER append, even with the outer chain-hash faithfully recomputed (defence in depth)', () => {
  const r1 = appendReceipt([], realCascadeReceipt());
  const tampered = { ...r1.chain[0], entry: { ...r1.chain[0].entry, cost: 999 } };
  // recompute the OUTER chain hash so the ledger-link itself is internally consistent —
  // only the receipt's own internal hash (set at sealing time) is now stale.
  const h = sha256(tampered.prevHash + '|' + canon(tampered.entry));
  const outerConsistent = { ...tampered, hash: h.hash };
  const v = verifyLedgerChain([outerConsistent]);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 0);
  assert.match(v.why, /no longer verifies against its own internal hash/);
});

test('verifyLedgerChain catches a broken prevHash link', () => {
  const r1 = appendReceipt([], realCascadeReceipt('a', 0));
  const r2 = appendReceipt(r1.chain, realTriageReceipt(1));
  const broken = [r2.chain[0], { ...r2.chain[1], prevHash: 'not-the-real-prev-hash' }];
  const v = verifyLedgerChain(broken);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 1);
  assert.match(v.why, /chain link broken/);
});

test('verifyLedgerChain catches a mismatched seq at the exact broken position', () => {
  const r1 = appendReceipt([], realCascadeReceipt('a', 0));
  const r2 = appendReceipt(r1.chain, realTriageReceipt(1));
  const broken = [r2.chain[0], { ...r2.chain[1], seq: 7 }];
  const v = verifyLedgerChain(broken);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 1);
});

test('verifyLedgerChain: clause 1 (item not an object) fires even when every OTHER field is genuinely correct — a hostile array carrying the real seq/hash/prevHash/entry would otherwise sail through every downstream check', () => {
  const good = appendReceipt([], realCascadeReceipt()).chain[0];
  const notObj = Object.assign([], { seq: good.seq, hash: good.hash, prevHash: good.prevHash, entry: good.entry });
  const v = verifyLedgerChain([notObj]);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 0);
});

test('verifyLedgerChain catches a directly corrupted hash (right prevHash/seq/entry, wrong recorded hash) — kills the h.hash!==item.hash clause specifically', () => {
  const good = appendReceipt([], realCascadeReceipt()).chain[0];
  const corrupted = { ...good, hash: 'f'.repeat(64) }; // a plausible-looking but wrong hash
  const v = verifyLedgerChain([corrupted]);
  assert.equal(v.valid, false);
  assert.equal(v.brokenAt, 0);
  assert.match(v.why, /this entry.s hash does not match its own chain link/);
});

test('verifyLedgerChain refuses a non-array input without throwing', () => {
  assert.deepEqual(verifyLedgerChain(null), { ok: false, why: 'the ledger is an array' });
  assert.deepEqual(verifyLedgerChain('nope'), { ok: false, why: 'the ledger is an array' });
});
