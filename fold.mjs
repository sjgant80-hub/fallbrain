// fold.mjs — the primorial fold codec + Mersenne-127 shield. The REAL, verified core of
// Thomas's "Scotty Starship Ninjaprise": a bloom (a state over 7 prime rings) folds
// LOSSLESSLY into a single integer and unfolds back — by the Fundamental Theorem of
// Arithmetic (subsets) and the Chinese Remainder Theorem (full states). Empty bloom = 1
// (unity), full bloom = 510510 (the primorial). Pure, total, mutation-gated.
//
// What is REAL here (and only this): the encoding. The song's "pair theorem" (two inverse
// blooms heal each other) was scouted and did NOT beat a random control — where it appears
// to work it is the tautology union(a,reflect(a)) = 1−a+a² ≥ 0.75 — so it is held as poem,
// NOT built. This file is the part that survives contact with arithmetic.

export const RINGS = [2, 3, 5, 7, 11, 13, 17];   // the seven prime rings
export const PRIMORIAL = 510510;                  // 17# = ∏RINGS  (the MAP / the FIELD)
export const SHIELD = 127;                        // 2^7 − 1 = Mersenne M7  (the SHIELD)
export const STATES = 128;                        // 2^7 = |divisors(510510)| — the bloom lattice
// invariant, checked in tests: SHIELD === STATES − 1 === count of non-empty blooms.

// ── subset codec: which rings are LIT → a squarefree divisor of 510510 (FTA-lossless) ──

// A subset of RINGS (given as the lit primes) folds to the product of those primes.
// [] → 1 (the empty bloom = unity); all seven → 510510 (the full bloom = primorial).
export function foldSubset(litPrimes) {
  if (!Array.isArray(litPrimes)) return 1;
  let n = 1;
  const seen = new Set();
  for (const p of litPrimes) {
    if (RINGS.includes(p) && !seen.has(p)) { n *= p; seen.add(p); }
  }
  return n;
}

// Unfold a squarefree divisor of 510510 back to its lit rings (which primes divide it).
export function unfoldSubset(n) {
  const v = toInt(n);
  const out = [];
  for (const p of RINGS) if (v % p === 0) out.push(p);
  return out;
}

// Is n a valid bloom — a divisor of 510510 (squarefree over the seven rings)?
export function isBloom(n) {
  const v = toInt(n);
  if (v < 1) return false;
  return PRIMORIAL % v === 0;
}

// ── CRT residue codec: a FULL state (one residue per ring) ⇄ one integer in [0,510510) ──

// Fold seven residues (r_i is taken mod p_i) into the unique n ∈ [0,510510) with
// n ≡ r_i (mod p_i) for every ring. Lossless by the Chinese Remainder Theorem.
export function foldResidues(residues) {
  const r = normalizeResidues(residues);
  let n = 0;
  for (let i = 0; i < RINGS.length; i++) {
    const p = RINGS[i];
    const M = PRIMORIAL / p;              // ∏ of the other primes
    const y = modInverse(M % p, p);       // M·y ≡ 1 (mod p)
    n = (n + r[i] * M * y) % PRIMORIAL;
  }
  return ((n % PRIMORIAL) + PRIMORIAL) % PRIMORIAL;
}

// Unfold an integer into its seven ring-residues: n mod each prime.
export function unfoldResidues(n) {
  const v = ((toInt(n) % PRIMORIAL) + PRIMORIAL) % PRIMORIAL;
  return RINGS.map((p) => v % p);
}

// ── the Mersenne-127 shield: a cheap corruption guard (the SHIELD reduction) ──

export function shield(n) {
  return (((toInt(n) % SHIELD) + SHIELD) % SHIELD);
}
export function shielded(n) {
  const v = toInt(n);
  return { n: v, chk: shield(v) };
}
export function verifyShield(s) {
  if (!s || typeof s !== 'object') return false;
  return Number.isInteger(s.n) && shield(s.n) === s.chk;
}

// ── helpers (total, defensive — a hostile input yields a safe value, never a throw) ──

function toInt(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.trunc(x) : 0;
  try { const n = Number(x); return Number.isFinite(n) ? Math.trunc(n) : 0; } catch { return 0; }
}

function normalizeResidues(residues) {
  const arr = Array.isArray(residues) ? residues : [];
  return RINGS.map((p, i) => {
    const v = toInt(arr[i]);
    return ((v % p) + p) % p;             // fold each residue into [0,p)
  });
}

// Modular inverse of a mod p (p a small prime) by exhaustive search — total: returns 0 if
// none (only when a ≡ 0, which never happens for M mod p since the primes are coprime).
function modInverse(a, p) {
  const aa = ((a % p) + p) % p;
  for (let y = 1; y < p; y++) if ((aa * y) % p === 1) return y;
  return 0;
}
