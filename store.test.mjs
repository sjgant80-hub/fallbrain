import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sealEnvelope, openEnvelope, parseSnapshotFile, receiptHashOf, KIND, VERSION } from './store.mjs';
import { sha256 } from './cascade.mjs';
const address = (s) => sha256(s).hash; // test-local helper matching store.mjs's own hashOf

const REAL_JSON = JSON.stringify({ v: 1, size: 2, chambers: Array.from({ length: 12 }, () => []), center: null });
const OTHER_JSON = JSON.stringify({ v: 1, size: 99, chambers: [], center: [1, 2, 3] });

function realSeal(json = REAL_JSON, n = 0) {
  const r = sealEnvelope({ json, compressedB64: 'ZmFrZS1jb21wcmVzc2VkLWJ5dGVz', createdAt: '2026-09-19T00:00:0' + n + 'Z' });
  assert.equal(r.ok, true, 'test fixture must itself be a genuinely valid seal: ' + JSON.stringify(r));
  return r.envelope;
}

// simulates a SOPHISTICATED tamperer who edits a field AND recomputes the receipt hash to match —
// isolates whichever DEEPER check (addr/shield/rawBytes) a test is actually targeting, rather than
// always just re-proving the outer receipt-hash layer catches everything (real, but a weaker test).
function reReceipt(env) {
  const { receiptHash, ...body } = env;
  return { ...body, receiptHash: receiptHashOf(body) };
}

// ---- sealEnvelope ----

test('sealEnvelope produces a real envelope whose addr matches this repo\'s own sha256 of the json', () => {
  const env = realSeal();
  assert.equal(env.v, VERSION);
  assert.equal(env.kind, KIND);
  assert.equal(env.addr, address(REAL_JSON));
  assert.equal(env.rawBytes, REAL_JSON.length);
  assert.equal(env.compressedBytes, 'ZmFrZS1jb21wcmVzc2VkLWJ5dGVz'.length);
  assert.equal(env.compressed, 'ZmFrZS1jb21wcmVzc2VkLWJ5dGVz');
});

test('sealEnvelope refuses each missing field individually, never throws', () => {
  assert.equal(sealEnvelope({}).ok, false);
  assert.equal(sealEnvelope({ compressedB64: 'x', createdAt: 't' }).ok, false); // no json
  assert.equal(sealEnvelope({ json: 'x', createdAt: 't' }).ok, false); // no compressedB64
  assert.equal(sealEnvelope({ json: 'x', compressedB64: 'y' }).ok, false); // no createdAt
  assert.equal(sealEnvelope(null).ok, false);
  assert.equal(sealEnvelope('not-an-object').ok, false);
});

test('sealEnvelope refuses an empty-string json/compressedB64/createdAt at the boundary', () => {
  assert.equal(sealEnvelope({ json: '', compressedB64: 'y', createdAt: 't' }).ok, false);
  assert.equal(sealEnvelope({ json: 'x', compressedB64: '', createdAt: 't' }).ok, false);
  assert.equal(sealEnvelope({ json: 'x', compressedB64: 'y', createdAt: '' }).ok, false);
});

// ---- openEnvelope: the honest round trip ----

test('openEnvelope: a genuine seal verifies valid against the SAME json it was sealed with', () => {
  const env = realSeal();
  const r = openEnvelope(env, REAL_JSON);
  assert.equal(r.ok, true);
  assert.equal(r.valid, true);
});

test('openEnvelope: refuses when the decompressed bytes do not match what was sealed (tampered payload)', () => {
  const env = realSeal(REAL_JSON);
  const r = openEnvelope(env, OTHER_JSON); // a real, different, validly-shaped JSON — not garbage
  assert.equal(r.ok, true);
  assert.equal(r.valid, false);
});

test('openEnvelope: the receipt hash alone catches an unsophisticated tamper to ANY field — even one addr/shield/rawBytes never separately check (createdAt, compressedBytes)', () => {
  const env = realSeal(REAL_JSON);
  for (const patch of [{ addr: address(OTHER_JSON) }, { createdAt: 'a different time' }, { compressedBytes: env.compressedBytes + 1 }]) {
    const r = openEnvelope({ ...env, ...patch }, REAL_JSON);
    assert.equal(r.valid, false, JSON.stringify(patch));
    assert.match(r.why, /receipt hash does not match/);
  }
});

test('openEnvelope: catches a directly-tampered addr field even from a sophisticated tamperer who fixed the receipt hash too', () => {
  const env = realSeal(REAL_JSON);
  const tampered = reReceipt({ ...env, addr: address(OTHER_JSON) }); // a real address, just the WRONG one for this payload
  const r = openEnvelope(tampered, REAL_JSON); // the real decompressed bytes are still the honest original
  assert.equal(r.valid, false);
  assert.match(r.why, /do not match the envelope's address/);
});

test('openEnvelope: catches a shield that is internally VALID but simply wrong for this payload (a swapped-in shield, receipt hash also fixed)', () => {
  const envA = realSeal(REAL_JSON);
  const envB = realSeal(OTHER_JSON, 1);
  const tampered = reReceipt({ ...envA, shield: envB.shield }); // a genuinely well-formed shield — for the WRONG payload
  const r = openEnvelope(tampered, REAL_JSON);
  assert.equal(r.valid, false);
  assert.match(r.why, /shield does not match/);
});

test('openEnvelope: refuses a malformed shield object before running the full check, even receipt-hash-consistent', () => {
  const env = realSeal(REAL_JSON);
  const tampered = reReceipt({ ...env, shield: { n: 'not-a-number' } });
  const r = openEnvelope(tampered, REAL_JSON);
  assert.equal(r.valid, false);
  assert.match(r.why, /shield itself is malformed/);
});

test('openEnvelope: refuses a length mismatch even if the address happened to still match (extreme edge, defence in depth, receipt-hash-consistent)', () => {
  const env = realSeal(REAL_JSON);
  const tampered = reReceipt({ ...env, rawBytes: env.rawBytes + 1 });
  const r = openEnvelope(tampered, REAL_JSON);
  assert.equal(r.valid, false);
});

test('openEnvelope: rawBytes must be a non-negative integer — boundary + guard-collapse cases', () => {
  // 0 is a REAL valid integer (isInt(0) must be true) — use a non-empty decompressedJson so this
  // specifically exercises the isInt(rawBytes) guard, not the earlier isStr(decompressedJson) one;
  // it will still fail on the LENGTH mismatch below, but must get PAST the rawBytes-type guard first.
  const zeroLen = { ...realSeal(REAL_JSON), rawBytes: 0 };
  const r0 = openEnvelope(zeroLen, REAL_JSON);
  assert.doesNotMatch(r0.why, /carries no rawBytes count/); // must get PAST the isInt guard
  // clause 2 alone fails: a real integer, but negative
  assert.match(openEnvelope({ ...realSeal(REAL_JSON), rawBytes: -1 }, REAL_JSON).why, /carries no rawBytes count/);
  // clause 1 alone fails: non-negative, but not an integer
  assert.match(openEnvelope({ ...realSeal(REAL_JSON), rawBytes: 5.5 }, REAL_JSON).why, /carries no rawBytes count/);
});

test('openEnvelope: compressedBytes and receiptHash must be present and string/int-typed', () => {
  assert.match(openEnvelope({ ...realSeal(REAL_JSON), compressedBytes: 'not-a-number' }, REAL_JSON).why, /carries no compressedBytes count/);
  assert.match(openEnvelope({ ...realSeal(REAL_JSON), receiptHash: 42 }, REAL_JSON).why, /carries no receipt hash/);
});

test('openEnvelope: refuses malformed/hostile envelope shapes without throwing', () => {
  assert.equal(openEnvelope(null, REAL_JSON).ok, false);
  assert.equal(openEnvelope('not-an-object', REAL_JSON).ok, false);
  assert.equal(openEnvelope({ ...realSeal(), kind: 'something-else' }, REAL_JSON).ok, false);
  assert.equal(openEnvelope({ ...realSeal(), v: 2 }, REAL_JSON).ok, false);
  assert.equal(openEnvelope({ ...realSeal(), addr: 42 }, REAL_JSON).ok, false); // addr not a string
  assert.equal(openEnvelope({ ...realSeal(), rawBytes: 'not-a-number' }, REAL_JSON).ok, false);
  const evilArr = Object.assign([], realSeal());
  assert.equal(openEnvelope(evilArr, REAL_JSON).ok, false); // hostile array masquerading as an envelope
  assert.equal(openEnvelope(realSeal(), null).ok, false); // nothing decompressed to check
  assert.equal(openEnvelope(realSeal(), 42).ok, false); // decompressedJson not a string
});

// ---- parseSnapshotFile ----

test('parseSnapshotFile accepts a genuine envelope shape', () => {
  const r = parseSnapshotFile(realSeal());
  assert.equal(r.ok, true);
  assert.equal(r.envelope.kind, KIND);
});

test('parseSnapshotFile refuses wrong kind, wrong version, missing compressed payload, and hostile shapes', () => {
  assert.equal(parseSnapshotFile({ ...realSeal(), kind: 'not-this' }).ok, false);
  assert.equal(parseSnapshotFile({ ...realSeal(), v: 99 }).ok, false);
  assert.equal(parseSnapshotFile({ ...realSeal(), compressed: undefined }).ok, false);
  assert.equal(parseSnapshotFile(null).ok, false);
  assert.equal(parseSnapshotFile('nope').ok, false);
  const evilArr = Object.assign([], realSeal());
  assert.equal(parseSnapshotFile(evilArr).ok, false);
});
