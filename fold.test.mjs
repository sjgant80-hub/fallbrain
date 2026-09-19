import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RINGS, PRIMORIAL, SHIELD, STATES,
  foldSubset, unfoldSubset, isBloom, foldResidues, unfoldResidues,
  shield, shielded, verifyShield,
} from './fold.mjs';

// --- lattice facts (the seed's numbers, verified structurally) -----------------------
test('the primorial lattice: 510510 = 17#, 128 states, 127 = non-empty blooms', () => {
  assert.equal(PRIMORIAL, 510510);
  assert.equal(PRIMORIAL, RINGS.reduce((a, b) => a * b, 1));
  assert.equal(STATES, 128);
  assert.equal(STATES, 2 ** RINGS.length);
  assert.equal(SHIELD, 127);
  assert.equal(SHIELD, STATES - 1);          // shield = count of non-empty blooms
});

// --- subset codec (FTA-lossless: which rings are lit ⇄ a squarefree divisor) ----------
test('foldSubset / unfoldSubset round-trip over all 128 blooms', () => {
  const seen = new Set();
  for (let mask = 0; mask < 128; mask++) {
    const lit = RINGS.filter((_, i) => mask & (1 << i));
    const n = foldSubset(lit);
    assert.equal(isBloom(n), true);
    seen.add(n);
    assert.deepEqual(unfoldSubset(n).sort((a, b) => a - b), lit.slice().sort((a, b) => a - b));
  }
  assert.equal(seen.size, 128);              // all distinct
});

test('empty bloom is unity, full bloom is the primorial', () => {
  assert.equal(foldSubset([]), 1);
  assert.equal(foldSubset(RINGS), 510510);
  assert.equal(foldSubset([3, 3, 5]), 15);   // dedup + ignore repeats
  assert.equal(foldSubset([4, 6, 5]), 5);    // non-ring primes ignored (only 5 is a ring)
  assert.equal(foldSubset('nope'), 1);       // total
});

test('isBloom accepts only divisors of 510510', () => {
  assert.equal(isBloom(1), true);
  assert.equal(isBloom(510510), true);
  assert.equal(isBloom(2 * 3 * 17), true);
  assert.equal(isBloom(4), false);           // 4 = 2² not squarefree over the rings
  assert.equal(isBloom(19), false);          // 19 not a ring
  assert.equal(isBloom(0), false);
  assert.equal(isBloom(NaN), false);
});

// --- CRT residue codec (a full 7-ring state ⇄ one integer, lossless) ------------------
test('foldResidues(unfoldResidues(n)) === n across the whole range', () => {
  for (let n = 0; n <= 3000; n++) assert.equal(foldResidues(unfoldResidues(n)), n);
  // a hard deterministic scatter across [0, PRIMORIAL)
  let x = 123457;
  for (let i = 0; i < 20000; i++) {
    x = (x * 48271) % PRIMORIAL;
    assert.equal(foldResidues(unfoldResidues(x)), x);
  }
});

test('unfoldResidues is n mod each ring; foldResidues normalizes + is total', () => {
  assert.deepEqual(unfoldResidues(30), [0, 0, 0, 2, 8, 4, 13]); // 30 mod [2,3,5,7,11,13,17]
  assert.equal(foldResidues([0, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(foldResidues('nope'), 0);          // total
  const big = foldResidues([1, 2, 4, 6, 10, 12, 16]);
  assert.ok(big >= 0 && big < PRIMORIAL);
});

// --- the Mersenne-127 shield (a corruption guard) ------------------------------------
test('shield reduces mod 127; shielded/verifyShield catch tampering', () => {
  assert.equal(shield(128), 1);
  assert.equal(shield(127), 0);
  assert.equal(shield(-1), 126);            // total: normalized into [0,127)
  assert.equal(shield('130'), 3);           // numeric string coerces (=== path)
  const s = shielded(123456);
  assert.equal(verifyShield(s), true);
  assert.equal(verifyShield({ n: 123457, chk: s.chk }), false);   // tampered n caught
  assert.equal(verifyShield(null), false);
  assert.equal(verifyShield({ n: 1.5, chk: 0 }), false);          // non-integer rejected
});
