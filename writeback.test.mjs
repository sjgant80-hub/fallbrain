// fallbrain · writeback.test.mjs — the write-back law: approved keys write in organ shapes, all else refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writebackPlan } from './writeback.mjs';

const NOW = 1_756_200_000_000;
const DAY = 86400000;
const KEY = (over) => Object.assign({ id: 'k7', status: 'decided', verdict: 'approved', door: 'legal', action: 'process-cooling-cancellation', reason: 'clock expired, cancellation stands', draft: null, draftedBy: null }, over);
const CL = (over) => Object.assign({ id: 'c1', archivedAt: null, kyc: { status: 'verified' }, cooling: {} }, over);
const EXPIRED = { expiresAt: NOW - 2 * DAY, waived: false, cancelledAt: null };

test('ONLY AN APPROVED KEY WRITES — pending and refused keys touch nothing', () => {
  const recs = { clients: [CL({ cooling: EXPIRED })] };
  assert.match(writebackPlan(KEY({ status: 'pending', verdict: null }), recs, NOW).why, /still waiting for a human hand/);
  assert.match(writebackPlan(KEY({ verdict: 'refused' }), recs, NOW).why, /refused key writes nothing/);
  assert.equal(writebackPlan(KEY(), recs, NOW).ok, true);
});

test('COOLING CANCELLATION — the organ\'s own fields, both the client and the register event', () => {
  const p = writebackPlan(KEY(), { clients: [CL({ cooling: EXPIRED }), CL({ id: 'c2', cooling: { expiresAt: NOW + DAY } })] }, NOW);
  assert.equal(p.ok, true);
  assert.equal(p.ops.length, 2, 'one matching client → one client op + one register event');
  const [cop, ev] = p.ops;
  assert.equal(cop.type, 'client-cooling-cancel');
  assert.equal(cop.clientId, 'c1');
  assert.equal(cop.set.cancelledAt, NOW);
  assert.match(cop.set.cancellationReason, /cancellation stands/, 'the HUMAN\'s argued reason rides into the record');
  assert.match(cop.set.processedBy, /legal door · fallbrain · k7/);
  assert.equal(ev.type, 'cooling-event');
  assert.equal(ev.rec.kind, 'cancelled');
  assert.equal(ev.rec.id, 'co-fb-k7-c1', 'deterministic id: one key, one id, ever');
  assert.equal(ev.rec.expiresAt, NOW - 2 * DAY, 'the original expiry rides into the register');
  assert.equal(ev.rec.waived, false);
});

test('COOLING — waived, already-cancelled, unexpired and archived clients are NOT touched', () => {
  const recs = { clients: [
    CL({ cooling: { ...EXPIRED, waived: true } }),
    CL({ id: 'c2', cooling: { ...EXPIRED, cancelledAt: NOW - DAY } }),
    CL({ id: 'c3', cooling: { expiresAt: NOW + DAY } }),
    CL({ id: 'c4', cooling: EXPIRED, archivedAt: NOW - DAY }),
  ] };
  const p = writebackPlan(KEY(), recs, NOW);
  assert.equal(p.ok, false);
  assert.match(p.why, /records moved/, 'nothing matches → a NAMED refusal, not a silent no-op');
});

test('COMPLAINT RESPONSE — requires the draft; attaches to every OPEN complaint, namespaced', () => {
  const key = KEY({ action: 'draft-complaint-response', door: 'client-trust', draft: 'Dear Ms R, …', draftedBy: 'qwen2.5:7b' });
  const recs = { complaints: [{ id: 'p1' }, { id: 'p2', resolvedAt: NOW - DAY }] };
  const p = writebackPlan(key, recs, NOW);
  assert.equal(p.ok, true);
  assert.equal(p.ops.length, 1, 'the resolved complaint is not touched');
  assert.equal(p.ops[0].type, 'complaint-response');
  assert.equal(p.ops[0].complaintId, 'p1');
  assert.equal(p.ops[0].response.text, 'Dear Ms R, …');
  assert.equal(p.ops[0].response.draftedBy, 'qwen2.5:7b');
  assert.equal(p.ops[0].response.keyId, 'k7');
  // no draft attached → refuse with the fix
  assert.match(writebackPlan(KEY({ action: 'draft-complaint-response', draft: null }), recs, NOW).why, /NO draft attached/);
  // no open complaints → named refusal
  assert.match(writebackPlan(key, { complaints: [{ id: 'p2', resolvedAt: NOW }] }, NOW).why, /records moved/);
});

test('CDD REQUEST — the letter lands in notes[]; CDD status is NOT flipped by an approved letter', () => {
  const key = KEY({ action: 'draft-cdd-verification', draft: 'Please provide photo ID…' });
  const recs = { clients: [CL({ kyc: { status: 'pending' } }), CL({ id: 'c2', kyc: { status: 'verified' } })] };
  const p = writebackPlan(key, recs, NOW);
  assert.equal(p.ok, true);
  assert.equal(p.ops.length, 1);
  assert.equal(p.ops[0].type, 'client-note');
  assert.equal(p.ops[0].clientId, 'c1');
  assert.match(p.ops[0].note.text, /Please provide photo ID/);
  assert.match(p.why, /NOT flipped/, 'the law SAYS verification stays the organ\'s act');
  assert.ok(!JSON.stringify(p.ops).includes('"status"'), 'no op touches kyc.status');
  assert.match(writebackPlan(KEY({ action: 'draft-cdd-verification' }), recs, NOW).why, /NO draft/);
});

test('NO IMPROVISED WRITES — an action without a write-back law refuses by name', () => {
  const p = writebackPlan(KEY({ action: 'draft-payment-chaser' }), { clients: [] }, NOW);
  assert.equal(p.ok, false);
  assert.match(p.why, /draft-payment-chaser/);
  assert.match(p.why, /improvised write/);
});

test('THE EXPIRY BOUNDARY — a cooling clock expiring at this exact instant counts (<=, matching the derivation law)', () => {
  const p = writebackPlan(KEY(), { clients: [CL({ cooling: { expiresAt: NOW, waived: false, cancelledAt: null } })] }, NOW);
  assert.equal(p.ok, true, 'expiresAt === now is expired');
  const p2 = writebackPlan(KEY(), { clients: [CL({ cooling: { expiresAt: NOW + 1, waived: false, cancelledAt: null } })] }, NOW);
  assert.equal(p2.ok, false, 'one ms in the future is not');
});

test('HOSTILE SHAPES — an array/function CARRYING key props is not a key; same for records', () => {
  const arrKey = []; Object.assign(arrKey, KEY());
  assert.match(writebackPlan(arrKey, { clients: [CL({ cooling: EXPIRED })] }, NOW).why, /needs the inbox entry/);
  const fnKey = function () {}; Object.assign(fnKey, KEY());
  assert.match(writebackPlan(fnKey, { clients: [CL({ cooling: EXPIRED })] }, NOW).why, /needs the inbox entry/);
  const fnRecs = function () {}; fnRecs.clients = [CL({ cooling: EXPIRED })];
  assert.match(writebackPlan(KEY(), fnRecs, NOW).why, /needs the organ records/);
});

test('FUZZ — total on garbage', () => {
  for (const g of [null, 7, 'k', []]) { assert.equal(writebackPlan(g, {}, NOW).ok, false); assert.equal(writebackPlan(KEY(), g, NOW).ok, false); }
  assert.match(writebackPlan(KEY(), {}, 0).why, /epoch-ms/);
  assert.equal(writebackPlan(KEY(), { clients: [null, 'x', 7] }, NOW).ok, false, 'junk clients → no match → refuse');
  assert.ok(true);
});
