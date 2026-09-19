// fallbrain · ledger.mjs — the receipt ledger: every cascade/triage receipt, hash-chained, so the
// company's escalation history is a real append-only record anyone can verify — not a claim about
// what happened, a re-checkable one. THE MISSING PERSISTENCE LAYER: cascade.mjs/triage.mjs already
// seal individual decisions into receipts, but until this file nothing accumulated them past one
// browser render — no filesystem log, no IndexedDB store, checked directly against state.mjs before
// writing a line of this (2026-09-19).
//
// THE PROVENANCE QUESTION THIS ANSWERS, AND THE ONE IT DELIBERATELY DOES NOT TRY TO:
// fallforge's provenanceChain (mint→catalogue→served→audited) proves an ARTIFACT's lifecycle across
// independent systems, binding on manifest.hash — "is the running node the exact thing that was
// minted and shelved." fallbrain's cascade/triage receipts are not that shape. They're independent
// TASK-EXECUTION EVENTS over time, each already self-verifying via its own taskHash (a hash of THIS
// message/action's text and answers, checked against itself — see cascade.mjs/triage.mjs's own
// comments, which flagged this exact seam as deliberately left open, not forgotten). Checked
// directly before building anything: reusing provenanceChain here would mean comparing a triage
// taskHash (over message text + answers) against a mint manifest.hash (over a model's build
// manifest) — two hashes over fundamentally different inputs that could never legitimately match by
// construction. Forcing that "join" would either always fail (useless) or require faking the match
// (dishonest) — exactly the mistake this session already caught itself on once with draft.mjs's
// task-shape mismatch. Declining it again, on purpose, here.
//
// The pattern that genuinely fits this shape already exists in the estate: fallnode's OWN
// hash-chained service ledger (appendLedger/verifyLedger, GENESIS/prevHash) — built for exactly
// "a sequence of independently-generated, self-verifiable events from one source." Vendored here,
// not imported (single-file-page discipline — every repo in this family vendors its own
// sha256/canon deliberately; same reasoning), and strengthened one step further for this specific
// use: an entry may only join the chain if it ALREADY verifies as a genuine cascade or triage
// receipt on its own terms. A garbage or forged-but-plausible entry cannot enter even once, let
// alone accumulate — the ledger's own gate, not just a wrapper around an assertion.
//
// Pure and total: garbage in -> { ok:false, why }, never a throw. The page persists `chain`
// (IndexedDB, device-local — same store discipline as every other fallbrain record) and re-verifies
// on read, the same "never trust a cached render" discipline the rest of the estate holds.

import { sha256, canon, verifyCascadeReceipt } from './cascade.mjs';
import { verifyTriageReceipt } from './triage.mjs';

const isStr = (v) => typeof v === 'string';
const isObj = (v) => (v && typeof v === 'object' && !Array.isArray(v));
const isArr = Array.isArray;

const RECEIPT_KINDS = Object.freeze(['fallbrain-cascade', 'fallbrain-triage']);

function verifyByKind(receipt) {
  if (receipt.kind === 'fallbrain-cascade') return verifyCascadeReceipt(receipt);
  if (receipt.kind === 'fallbrain-triage') return verifyTriageReceipt(receipt);
  return { ok: false, why: `"${isStr(receipt.kind) ? receipt.kind : typeof receipt.kind}" is not a receipt kind this ledger accepts (${RECEIPT_KINDS.join(' or ')})` };
}

/**
 * appendReceipt(chain, receipt) — only a receipt that VERIFIES on its own terms may join the
 * ledger. This is the ledger's own gate: a garbage or forged-but-plausible-looking receipt never
 * gets in, not even once. Returns a NEW array (pure); the caller persists it.
 */
export function appendReceipt(chain, receipt) {
  if (!isArr(chain)) return { ok: false, why: 'the ledger is an array' };
  if (!isObj(receipt)) return { ok: false, why: 'a ledger entry must be a receipt object' };
  const v = verifyByKind(receipt);
  if (!v.ok) return { ok: false, why: v.why };
  if (!v.valid) return { ok: false, why: 'refused: this receipt does not verify against its own hash — ' + v.why };
  const prevHash = chain.length === 0 ? 'GENESIS' : chain[chain.length - 1].hash;
  const h = sha256(prevHash + '|' + canon(receipt));
  if (!h.ok) return { ok: false, why: h.why };
  return { ok: true, chain: [...chain, { seq: chain.length, prevHash, hash: h.hash, kind: receipt.kind, entry: receipt }] };
}

/**
 * verifyLedgerChain(chain) — walks the hash chain AND re-verifies every entry is still a genuine
 * receipt: defence in depth. A chain-link-consistent forgery (someone hand-edited entry.hash to
 * match after tampering with the receipt inside it) is still caught, because the receipt's OWN
 * internal hash is re-checked here too, not just trusted because it passed at append time.
 */
export function verifyLedgerChain(chain) {
  if (!isArr(chain)) return { ok: false, why: 'the ledger is an array' };
  for (let i = 0; i < chain.length; i++) {
    const item = chain[i];
    if (!isObj(item) || !isStr(item.hash) || !isStr(item.prevHash) || !isObj(item.entry))
      return { ok: true, valid: false, brokenAt: i, why: 'malformed ledger entry at this position' };
    if (item.seq !== i) return { ok: true, valid: false, brokenAt: i, why: 'sequence number does not match its position in the chain' };
    const expectedPrev = i === 0 ? 'GENESIS' : chain[i - 1].hash;
    if (item.prevHash !== expectedPrev) return { ok: true, valid: false, brokenAt: i, why: 'chain link broken — prevHash does not match the prior entry\'s hash' };
    const h = sha256(item.prevHash + '|' + canon(item.entry));
    if (!h.ok || h.hash !== item.hash) return { ok: true, valid: false, brokenAt: i, why: 'this entry\'s hash does not match its own chain link — tampered after it was appended' };
    const v = verifyByKind(item.entry);
    if (!v.ok || !v.valid) return { ok: true, valid: false, brokenAt: i, why: 'the receipt at this position no longer verifies against its own internal hash' };
  }
  return { ok: true, valid: true, length: chain.length };
}
