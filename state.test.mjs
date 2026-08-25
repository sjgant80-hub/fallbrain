// fallbrain · state.test.mjs — the derivation law against hand-built records, every rule falsifiable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveState, ORGAN_DBS } from './state.mjs';

const NOW = 1_756_000_000_000; // fixed anchor — the law is deterministic given its clock
const DAY = 86400000;
const cl = (over) => Object.assign({ id: 'c1', archivedAt: null, kyc: { status: 'verified', nextReviewDue: null }, cooling: {} }, over);

test('COOLING EXPIRED — reached AND not waived AND not cancelled; the boundary is inclusive', () => {
  const on = (cooling) => deriveState({ clients: [cl({ cooling })] }, NOW).coolingExpired;
  assert.equal(on({ expiresAt: NOW - 1 }), 1, 'past expiry counts');
  assert.equal(on({ expiresAt: NOW }), 1, 'expiring this instant counts (<=)');
  assert.equal(on({ expiresAt: NOW + 1 }), 0, 'still in the period does not');
  assert.equal(on({ expiresAt: NOW - 1, waived: true }), 0, 'waived never expires');
  assert.equal(on({ expiresAt: NOW - 1, cancelledAt: NOW - 2 }), 0, 'already cancelled is done, not pending');
  assert.equal(on({}), 0, 'no clock started');
});

test('CDD PENDING — status pending only, and only for active clients', () => {
  const r = deriveState({ clients: [
    cl({ kyc: { status: 'pending' } }),
    cl({ id: 'c2', kyc: { status: 'verified' } }),
    cl({ id: 'c3', kyc: { status: 'review' } }),
    cl({ id: 'c4', kyc: { status: 'pending' }, archivedAt: NOW - DAY }),
  ] }, NOW);
  assert.equal(r.cddPending, 1, 'one active pending; the archived pending client does not count');
  assert.equal(r.counts.activeClients, 3);
});

test('REVIEWS DUE — the organ\'s own rule: nextReviewDue within 30 days, overdue included', () => {
  const on = (due) => deriveState({ clients: [cl({ kyc: { status: 'verified', nextReviewDue: due } })] }, NOW).reviewsDue;
  assert.equal(on(NOW - 5 * DAY), 1, 'overdue counts');
  assert.equal(on(NOW + 29 * DAY), 1, 'due in 29 days counts');
  assert.equal(on(NOW + 30 * DAY), 0, 'exactly 30 days out is NOT yet due — the organ rule is strictly < 30d');
  assert.equal(on(NOW + 31 * DAY), 0, 'due in 31 days does not');
  assert.equal(on(null), 0, 'no review scheduled');
});

test('COMPLAINTS OPEN — no resolvedAt means open', () => {
  const r = deriveState({ complaints: [{ id: 'p1' }, { id: 'p2', resolvedAt: NOW - DAY }, { id: 'p3', resolvedAt: null }] }, NOW);
  assert.equal(r.complaintsOpen, 2);
});

test('INVOICES UNPAID — sent is owed; draft is not yet owed; paid is done', () => {
  const r = deriveState({ invoices: [
    { id: 'i1', status: 'sent' }, { id: 'i2', status: 'sent' },
    { id: 'i3', status: 'draft' }, { id: 'i4', status: 'paid' },
  ] }, NOW);
  assert.equal(r.invoicesUnpaid, 2);
});

test('THE DERIVED STATE FEEDS THE LOOP — shape matches nextAction\'s fields, docsAwaited honest 0', () => {
  const r = deriveState({ clients: [cl({ kyc: { status: 'pending' } })] }, NOW);
  for (const f of ['coolingExpired', 'complaintsOpen', 'cddPending', 'reviewsDue', 'invoicesUnpaid', 'docsAwaited']) {
    assert.ok(Number.isInteger(r[f]) && r[f] >= 0, f + ' is a count');
  }
  assert.equal(r.docsAwaited, 0);
  assert.match(r.why, /no organ signal/, 'the missing signal is SAID, not smuggled as a measurement');
});

test('MISSING SOURCES read as empty; WRONG SHAPES are refused, never a plausible zero', () => {
  const r = deriveState({}, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.cddPending + r.complaintsOpen + r.invoicesUnpaid, 0);
  assert.match(deriveState({ clients: 'many' }, NOW).why, /clients must be an array/);
  assert.match(deriveState({ complaints: {} }, NOW).why, /complaints must be an array/);
  assert.match(deriveState({ invoices: 7 }, NOW).why, /invoices must be an array/);
  assert.match(deriveState(null, NOW).why, /records/);
  assert.match(deriveState([], NOW).why, /records/, 'an array is not a records bag');
  assert.match(deriveState({}, 0).why, /epoch-ms/);
  assert.match(deriveState({}, 1.5).why, /epoch-ms/);
});

test('GARBAGE INSIDE the arrays is skipped, not crashed on', () => {
  const r = deriveState({ clients: [null, 'x', 7, cl({ kyc: { status: 'pending' } })], complaints: [null, { id: 'p' }], invoices: ['x', { status: 'sent' }] }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.cddPending, 1);
  assert.equal(r.complaintsOpen, 1);
  assert.equal(r.invoicesUnpaid, 1);
});

test('ORGAN_DBS — the verified map covers all ten verticals and records the naming SPLIT', () => {
  const verts = ['claims', 'legal', 'accountancy', 'estate', 'recruitment', 'clinic', 'hr', 'insurance', 'mortgage', 'veterinary'];
  for (const v of verts) assert.ok(ORGAN_DBS[v] && ORGAN_DBS[v].db, v + ' has a verified DB name');
  const dotV1 = verts.filter((v) => ORGAN_DBS[v].db.endsWith('.v1'));
  const dashV1 = verts.filter((v) => ORGAN_DBS[v].db.endsWith('-v1'));
  assert.equal(dotV1.length, 5, 'five organs use ".v1"');
  assert.equal(dashV1.length, 5, 'five use "-v1" — the split an assumed convention would have missed');
  assert.equal(ORGAN_DBS.claims.complaintsStore, 'complaints', 'claims carries the complaints register');
  assert.equal(ORGAN_DBS.sharedInvoices.db, 'fallinvoice');
});
