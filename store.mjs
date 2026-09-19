// fallbrain · store.mjs — the durable STORE under fallbrain's own state: the door queue and the
// receipt ledger currently live ONLY in IndexedDB, which a routine browser-data clear erases with
// no warning and no recovery — exactly the gap Simon named ("apps need harddrive if webgpu gets
// wiped"). This is that file's envelope law: a tamper-evident wrapper around a compressed snapshot
// of fallbrain's real state, so a memory file the user keeps on their own disk can be trusted on
// the way back in, not just written on the way out.
//
// SAME LAW as fall-remember's own store.mjs (same repo family, same organ pattern, konomified into
// each repo that needs it) — adapted here to REUSE WHAT THIS REPO ALREADY HAS rather than importing
// a sibling organ this repo doesn't otherwise use:
//   · fall-remember's copy uses address() (its own 128-bit, non-cryptographic hash). fallbrain has
//     no FallRemember instance to wrap and no address() of its own — but it already vendors a REAL
//     sha256 + canon (cascade.mjs, used by every receipt this repo already seals: cascadeReceipt,
//     triageReceipt, ledger.mjs's appendReceipt). Reusing THAT is more honest than importing a
//     sibling repo's hash this repo doesn't otherwise touch, and it's cryptographically stronger.
//   · geometric-computer's fold.mjs shield()/shielded()/verifyShield() (vendored, re-gated fresh in
//     this repo too) — the same cheap corruption pre-check, layered under the real sha256 check,
//     the same two-teeth shape as fall-remember's senses.mjs and this envelope's own sibling copy.
//     fold.mjs's OTHER functions (foldSubset/foldResidues, a bounded 7-dimensional bloom/residue
//     encoder) do not apply to arbitrary state and are not used that way here — real compression is
//     disk.mjs's job (CompressionStream), kept separate on purpose.
//
// AUDIT-SHAPED: the envelope IS a receipt in the same {...,hash} self-verifying shape every other
// receipt in this repo already uses (cascadeReceipt/triageReceipt/ledger entries) — sealed once,
// self-verified on the way back in, so a restored snapshot is VERIFIABLE, not merely present.
//
// Pure and total: garbage in -> { ok:false, why }, never a throw. No I/O, no clock (createdAt is
// passed in by the caller, same discipline as every receipt-sealing function in this repo).

import { sha256, canon } from './cascade.mjs';
import { shielded, verifyShield } from './fold.mjs';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isInt = (v) => Number.isInteger(v) && v >= 0;

export const KIND = 'fallbrain-memory-snapshot';
export const VERSION = 1;

function hashOf(text) {
  // sha256 can only fail on a non-string, which every call site here already guards against — but
  // it is still handled honestly (never assumed) rather than trusted blind.
  const h = sha256(text);
  return h.ok ? h.hash : null;
}

// The envelope is a RECEIPT, same shape as every other receipt in this repo: seal computes a hash
// over every OTHER field via canon() (the same canonical-JSON helper cascadeReceipt/triageReceipt
// already use), verify recomputes it and refuses on any disagreement — so a tamper to createdAt or
// compressedBytes (fields the payload hash alone never touches) is caught too.
export function receiptHashOf(e) {
  return hashOf(canon({ v: e.v, kind: e.kind, createdAt: e.createdAt, addr: e.addr, shieldN: e.shield.n, shieldChk: e.shield.chk, rawBytes: e.rawBytes, compressedBytes: e.compressedBytes, compressed: e.compressed }));
}

function shieldOf(addr) {
  // shield() takes an integer; derive one from the first 32 bits of the sha256 hex — deterministic,
  // and independent enough of the full check to be worth a second look (a tamper that only patches
  // the trailing hex of addr would still usually flip these leading bits too, but the real defence
  // is that BOTH checks must pass, not that either alone is unbeatable).
  return shielded(parseInt(addr.slice(0, 8), 16));
}

/**
 * sealEnvelope({ json, compressedB64, createdAt }) — json: the exact string that was compressed
 * (JSON.stringify of fallbrain's real state: door queue + receipt ledger). compressedB64: the
 * base64 of the REAL compressed bytes (disk.mjs's job to produce — this function never compresses
 * anything itself). Returns the tamper-evident envelope ready to write to one file.
 */
export function sealEnvelope(input) {
  const { json, compressedB64, createdAt } = isObj(input) ? input : {};
  if (!isStr(json)) return { ok: false, why: 'the envelope needs the exact JSON string that was compressed' };
  if (!isStr(compressedB64)) return { ok: false, why: 'the envelope needs the compressed payload, base64-encoded' };
  if (!isStr(createdAt)) return { ok: false, why: 'the envelope needs a createdAt timestamp' };
  const addr = hashOf(json);
  if (!addr) return { ok: false, why: 'could not hash the state' };
  const shield = shieldOf(addr);
  const body = {
    v: VERSION,
    kind: KIND,
    createdAt,
    addr,
    shield,
    rawBytes: json.length,
    compressedBytes: compressedB64.length,
    compressed: compressedB64,
  };
  return { ok: true, envelope: { ...body, receiptHash: receiptHashOf(body) } };
}

/**
 * openEnvelope(envelope, decompressedJson) — decompressedJson: what disk.mjs got back out after
 * decompressing envelope.compressed (this function never decompresses anything itself). Verifies
 * the receipt hash (every field), then BOTH teeth on the payload: the shield (cheap, fast) and the
 * full sha256 (the real check) must agree with what the decompressed bytes actually hash to —
 * never trusts the envelope's own claim about itself.
 */
export function openEnvelope(envelope, decompressedJson) {
  const e = isObj(envelope) ? envelope : null;
  if (!e) return { ok: false, why: 'not a snapshot envelope' };
  if (e.kind !== KIND) return { ok: false, why: `not a ${KIND} envelope` };
  if (e.v !== VERSION) return { ok: false, why: `unknown snapshot version ${String(e.v)}` };
  if (!isStr(e.addr)) return { ok: false, why: 'the envelope carries no address' };
  if (!isObj(e.shield)) return { ok: false, why: 'the envelope carries no shield' };
  if (!isInt(e.rawBytes)) return { ok: false, why: 'the envelope carries no rawBytes count' };
  if (!isInt(e.compressedBytes)) return { ok: false, why: 'the envelope carries no compressedBytes count' };
  if (!isStr(e.receiptHash)) return { ok: false, why: 'the envelope carries no receipt hash' };
  if (!isStr(decompressedJson)) return { ok: false, why: 'nothing was decompressed to check against the envelope' };

  const { receiptHash, ...body } = e;
  if (receiptHashOf(body) !== receiptHash) return { ok: true, valid: false, why: 'the envelope\'s own receipt hash does not match its fields — the envelope itself was edited after it was sealed' };

  const realAddr = hashOf(decompressedJson);
  if (!realAddr) return { ok: true, valid: false, why: 'could not hash the decompressed bytes' };
  if (!verifyShield(e.shield)) return { ok: true, valid: false, why: 'the shield itself is malformed — refused before the full check even runs' };
  const shieldNow = shieldOf(realAddr);
  if (shieldNow.chk !== e.shield.chk) return { ok: true, valid: false, why: 'the shield does not match the decompressed bytes — corruption caught by the cheap check first' };
  if (realAddr !== e.addr) return { ok: true, valid: false, why: 'the decompressed bytes do not match the envelope\'s address — tampered or corrupted after it was written' };
  if (decompressedJson.length !== e.rawBytes) return { ok: true, valid: false, why: 'the decompressed length does not match what was sealed' };
  return { ok: true, valid: true, why: 'snapshot intact — both the shield and the full hash agree with the decompressed bytes' };
}

/**
 * parseSnapshotFile(raw) — raw: whatever JSON.parse produced from a file the user picked. Refuses
 * anything that isn't shaped like a real envelope before disk.mjs ever tries to decompress it — a
 * malformed file should never reach the decompressor at all.
 */
export function parseSnapshotFile(raw) {
  if (!isObj(raw)) return { ok: false, why: 'not a fallbrain snapshot file (not an object)' };
  if (raw.kind !== KIND) return { ok: false, why: `not a ${KIND} file` };
  if (raw.v !== VERSION) return { ok: false, why: `unsupported snapshot version ${String(raw.v)}` };
  if (!isStr(raw.compressed)) return { ok: false, why: 'the file carries no compressed payload' };
  return { ok: true, envelope: raw };
}
