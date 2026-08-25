// fallbrain · inbox.test.mjs — the door-queue law, falsifiable: keys queue, humans turn, records hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueue, turnKey, pending } from './inbox.mjs';

const NOW = 1_756_100_000_000;
const ITEM = { door: 'legal', action: 'draft-cdd-verification', count: 3, why: '3 claimants await CDD — AML bars acting for unverified clients' };

test('ENQUEUE — a valid door decision enters pending, with a deterministic id and its reason', () => {
  const r = enqueue([], ITEM, 1, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.queue.length, 1);
  assert.equal(r.entry.id, 'k1');
  assert.equal(r.entry.status, 'pending');
  assert.equal(r.entry.door, 'legal');
  assert.match(r.entry.why, /AML/);
  assert.equal(r.entry.verdict, null);
  // the original array is untouched — the law is pure
  const q0 = []; enqueue(q0, ITEM, 1, NOW); assert.equal(q0.length, 0);
});

test('ENQUEUE refuses garbage with the reason — door, action, why, seq, clock all guarded', () => {
  assert.match(enqueue([], { ...ITEM, door: 'backdoor' }, 1, NOW).why, /not one of the four doors/);
  assert.match(enqueue([], { ...ITEM, action: '' }, 1, NOW).why, /needs the action/);
  assert.match(enqueue([], { ...ITEM, why: '' }, 1, NOW).why, /cannot say why/);
  assert.match(enqueue([], ITEM, 0, NOW).why, /positive integer/);
  assert.match(enqueue([], ITEM, 1, 0).why, /epoch-ms/);
  assert.match(enqueue('x', ITEM, 1, NOW).why, /array/);
  assert.match(enqueue([], null, 1, NOW).why, /not a queueable item/);
  assert.match(enqueue([], [ITEM], 1, NOW).why, /not a queueable item/);
});

test('ONE JOB HOLDS ONE KEY — the same action pending at the same door is refused', () => {
  const q1 = enqueue([], ITEM, 1, NOW).queue;
  const dup = enqueue(q1, ITEM, 2, NOW + 1);
  assert.equal(dup.ok, false);
  assert.match(dup.why, /already pending at the legal door/);
  // a DIFFERENT door or action is fine
  assert.equal(enqueue(q1, { ...ITEM, door: 'client-trust' }, 2, NOW).ok, true);
  assert.equal(enqueue(q1, { ...ITEM, action: 'process-cooling-cancellation' }, 2, NOW).ok, true);
  // and once DECIDED, the same job may queue again (a new day, a new key)
  const decided = turnKey(q1, 'k1', 'approved', '', NOW + 2).queue;
  assert.equal(enqueue(decided, ITEM, 2, NOW + 3).ok, true);
});

test('TURN KEY — approve moves pending → decided and stamps the when', () => {
  const q = enqueue([], ITEM, 1, NOW).queue;
  const r = turnKey(q, 'k1', 'approved', 'CDD pack reviewed, all three verified', NOW + 100);
  assert.equal(r.ok, true);
  assert.equal(r.entry.status, 'decided');
  assert.equal(r.entry.verdict, 'approved');
  assert.equal(r.entry.decidedAt, NOW + 100);
  assert.match(r.entry.reason, /reviewed/);
});

test('A REFUSAL NEEDS AN ARGUABLE REASON — under 12 characters is a shrug', () => {
  const q = enqueue([], ITEM, 1, NOW).queue;
  assert.match(turnKey(q, 'k1', 'refused', '', NOW).why, /at least 12 characters/);
  assert.match(turnKey(q, 'k1', 'refused', 'no', NOW).why, /shrug/);
  const ok = turnKey(q, 'k1', 'refused', 'ID documents do not match the claim address', NOW);
  assert.equal(ok.ok, true);
  assert.equal(ok.entry.verdict, 'refused');
  // an APPROVAL may carry no reason (the act itself is the argument)
  assert.equal(turnKey(q, 'k1', 'approved', '', NOW).ok, true);
});

test('A DECIDED ITEM STAYS DECIDED — the second turn of the same key is refused', () => {
  const q = enqueue([], ITEM, 1, NOW).queue;
  const once = turnKey(q, 'k1', 'approved', '', NOW).queue;
  const again = turnKey(once, 'k1', 'refused', 'changed my mind about this one', NOW + 1);
  assert.equal(again.ok, false);
  assert.match(again.why, /already approved/);
  assert.match(again.why, /record does not move/);
});

test('TURN KEY refuses unknown ids, bad verdicts, bad clocks', () => {
  const q = enqueue([], ITEM, 1, NOW).queue;
  assert.match(turnKey(q, 'k99', 'approved', '', NOW).why, /no item "k99"/);
  assert.match(turnKey(q, 'k1', 'maybe', '', NOW).why, /"approved" or "refused"/);
  assert.match(turnKey(q, 'k1', 'approved', '', 0).why, /epoch-ms/);
  assert.match(turnKey('x', 'k1', 'approved', '', NOW).why, /array/);
});

test('PENDING — per-door, oldest first, decided items gone, the why speaks', () => {
  let q = enqueue([], { ...ITEM, why: 'first in' }, 1, NOW).queue;
  q = enqueue(q, { door: 'legal', action: 'process-cooling-cancellation', why: 'statutory clock ran out' }, 2, NOW - 500).queue; // older ts
  q = enqueue(q, { door: 'money', action: 'pay-disbursement', why: 'counsel fee due' }, 3, NOW + 5).queue;
  q = turnKey(q, 'k3', 'approved', '', NOW + 10).queue;
  const p = pending(q);
  assert.equal(p.ok, true);
  assert.equal(p.total, 2);
  assert.equal(p.byDoor.money.length, 0, 'the decided money item is out of pending');
  assert.equal(p.byDoor.legal.length, 2);
  assert.equal(p.byDoor.legal[0].action, 'process-cooling-cancellation', 'oldest first');
  assert.match(p.why, /2 key\(s\) waiting/);
  assert.match(pending([]).why, /doors are clear/);
  assert.match(pending('x').why, /array/);
});

test('A DRAFT RIDES WITH ITS ITEM — kept verbatim when given, strictly null when absent', () => {
  const withDraft = enqueue([], { ...ITEM, draft: 'Dear Ms Realrecord, …', draftedBy: 'qwen2.5:7b' }, 1, NOW).entry;
  assert.equal(withDraft.draft, 'Dear Ms Realrecord, …', 'the worded draft is kept verbatim');
  assert.equal(withDraft.draftedBy, 'qwen2.5:7b');
  const bare = enqueue([], ITEM, 1, NOW).entry;
  assert.strictEqual(bare.draft, null, 'no draft is null, not ""');
  assert.strictEqual(bare.draftedBy, null);
});

test('COUNT — a non-integer count falls to 0; a real count is kept as the number it is', () => {
  assert.strictEqual(enqueue([], { ...ITEM, count: '7' }, 1, NOW).entry.count, 0, 'a STRING count is not a count');
  assert.strictEqual(enqueue([], { ...ITEM, count: -3 }, 1, NOW).entry.count, 0);
  assert.strictEqual(enqueue([], { ...ITEM, count: 5 }, 1, NOW).entry.count, 5);
});

test('THE 12-CHAR REASON BOUNDARY — exactly 12 characters is the shortest arguable refusal', () => {
  const q = enqueue([], ITEM, 1, NOW).queue;
  const exactly12 = 'docs missing'; // 12 chars
  assert.equal(exactly12.length, 12);
  assert.equal(turnKey(q, 'k1', 'refused', exactly12, NOW).ok, true, '12 passes (< 12 refuses, not <=)');
  assert.equal(turnKey(q, 'k1', 'refused', 'docs missin', NOW).ok, false, '11 is a shrug');
});

test('FUZZ — total on garbage', () => {
  for (const g of [null, 7, 'q', {}, [null, 'x', 7]]) { pending(g); enqueue(g, ITEM, 1, NOW); turnKey(g, 'k1', 'approved', '', NOW); }
  const withJunk = pending([null, 'x', 7, { id: 'k1', status: 'pending', door: 'legal', ts: 1, action: 'a', why: 'w' }]);
  assert.equal(withJunk.ok, true);
  assert.equal(withJunk.total, 1, 'junk rows skipped, real rows counted');
  assert.ok(true);
});
