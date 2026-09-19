import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipCompress, gzipDecompress, makeSnapshot, restoreSnapshot, hasFileSystemAccess } from './disk.mjs';
import { enqueue } from './inbox.mjs';
import { appendReceipt } from './ledger.mjs';
import { cascadeReceipt } from './cascade.mjs';

// ---- real compression, run not assumed ----

test('gzipCompress/gzipDecompress: a real string round-trips byte-exact, and is actually smaller compressed', async () => {
  const text = 'the dodeca remembers · '.repeat(80);
  const compressed = await gzipCompress(text);
  assert.ok(compressed.length < text.length, `compressed (${compressed.length}) should beat raw (${text.length}) on repetitive text`);
  const restored = await gzipDecompress(compressed);
  assert.equal(restored, text);
});

test('gzipCompress/gzipDecompress: round-trips an empty string, unicode, and a large record dump', async () => {
  for (const text of ['', '🜁 sovereign · κ=0.618 · 日本語', JSON.stringify({ chambers: Array.from({ length: 12 }, (_, i) => Array.from({ length: 30 }, (_, j) => ({ name: `rec-${i}-${j}`, text: `memory number ${i}-${j}` }))) })]) {
    const restored = await gzipDecompress(await gzipCompress(text));
    assert.equal(restored, text);
  }
});

test('gzipDecompress genuinely throws on corrupt bytes (not silently returns garbage) — caught by restoreSnapshot, tested there', async () => {
  await assert.rejects(() => gzipDecompress('bm90LWdlbnVpbmUtZ3ppcA==')); // valid base64, NOT valid gzip
});

// ---- makeSnapshot / restoreSnapshot: the real E2E round trip on fallbrain's REAL state shape ----

function realFallbrainState(n = 0) {
  // a real door-queue entry, via the real law (inbox.mjs), not a hand-shaped object
  const q = enqueue([], { door: 'client-trust', action: 'process-cooling-cancellation', count: 2, why: 'expired cooling-off, 2 clients' }, 1, 1700000000000 + n);
  // a real cascade receipt, via the real law (cascade.mjs), same as every receipt this repo seals
  const r = cascadeReceipt({ decision: { action: 'triage-correspondence' }, output: '{"category":"complaint","urgency":"standard"}', format: { type: 'json', required: ['category', 'urgency'] }, holder: 'ada', createdAt: '2026-09-19T00:00:0' + n + 'Z' });
  const ledger = appendReceipt([], r.receipt);
  return { doorQueue: { seq: 1, queue: q.queue }, receiptLedger: ledger.chain };
}

test('makeSnapshot -> restoreSnapshot: fallbrain\'s REAL state (a real door-queue entry + a real ledger receipt) round-trips intact, verified valid', async () => {
  const state = realFallbrainState();
  const made = await makeSnapshot(state);
  assert.equal(made.ok, true, JSON.stringify(made));
  const restored = await restoreSnapshot(made.envelope);
  assert.equal(restored.ok, true);
  assert.equal(restored.valid, true);
  assert.deepEqual(restored.state, state); // the actual content survived, not just a count
  assert.equal(restored.state.doorQueue.queue[0].action, 'process-cooling-cancellation');
  assert.equal(restored.state.receiptLedger[0].entry.kind, 'fallbrain-cascade');
});

test('restoreSnapshot catches a tampered compressed payload — a REAL swap, not a hand-picked field edit', async () => {
  const stateA = realFallbrainState(0);
  const stateB = realFallbrainState(1);
  const madeA = await makeSnapshot(stateA);
  const madeB = await makeSnapshot(stateB);
  const swapped = { ...madeA.envelope, compressed: madeB.envelope.compressed }; // A's envelope, B's real compressed bytes
  const restored = await restoreSnapshot(swapped);
  assert.equal(restored.ok, true);
  assert.equal(restored.valid, false);
});

test('restoreSnapshot refuses a file that is not JSON-shaped, and a genuinely corrupt compressed field, without throwing', async () => {
  assert.equal((await restoreSnapshot(null)).ok, false);
  assert.equal((await restoreSnapshot({ kind: 'not-this' })).ok, false);
  const made = await makeSnapshot({ hello: 'world' });
  const corrupt = { ...made.envelope, compressed: 'bm90LWdlbnVpbmUtZ3ppcA==' };
  const r = await restoreSnapshot(corrupt);
  assert.equal(r.ok, false);
  assert.match(r.why, /will not decompress/);
});

test('makeSnapshot refuses non-serialisable state honestly instead of throwing or silently dropping data', async () => {
  const circular = {}; circular.self = circular;
  const r = await makeSnapshot(circular);
  assert.equal(r.ok, false);
});

// ---- capability detection ----

test('hasFileSystemAccess is honest in an environment with no window — no false capability claim', () => {
  assert.equal(hasFileSystemAccess(), false);
});
