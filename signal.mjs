// fallbrain · signal.mjs — the escalation signal: read the real ledger, surface WHERE the local
// model keeps failing to hold format and the limb has to answer instead. That's the honest,
// checkable version of "where would minting a task-specific model pay off" — not a guess, a count
// over real receipts, each of which is itself a verified, tamper-evident record (ledger.mjs).
//
// Deliberately does NOT invent a recommendation sentence. It returns the real counts and rates per
// category, plus a plain, bounded flag — "enough volume to mean something" or "too few samples to
// conclude anything" — and leaves the actual business judgement to whoever reads it. Overselling a
// pattern from 2 data points is exactly the kind of claim this estate refuses to make (same
// discipline as the n=2 caveat already kept honest in fallforgemint's own proof-node work).
//
// Refuses to compute anything over a chain that doesn't verify — an aggregate built on a tampered
// or malformed ledger would be a real number about a fake history. Pure and total: garbage in ->
// { ok:false, why }, never a throw.

import { verifyLedgerChain } from './ledger.mjs';

const isArr = Array.isArray;

// Below this many triage receipts in a category, a rate is noise dressed as a finding — don't
// claim one. Matches the estate's existing small-sample honesty (fallforgemint's n=2 caveat).
export const MIN_SAMPLE = 5;

/**
 * escalationSignal(chain) — chain: a ledger as produced by ledger.mjs's appendReceipt. Verifies the
 * chain first (never signal off data that might be tampered), then counts, per recognised triage
 * category: how many times the local model held format vs. how many times it escalated to the
 * limb. Unresolved receipts (neither local nor limb answer held the taxonomy) are counted
 * separately — a real signal too, but a different one: the taxonomy or the prompt may be the gap,
 * not "which model answers," and folding it into a category's rate would misdescribe it.
 */
export function escalationSignal(chain) {
  if (!isArr(chain)) return { ok: false, why: 'the ledger is an array' };
  const v = verifyLedgerChain(chain);
  if (!v.ok) return v;
  if (!v.valid) return { ok: false, why: `refused to signal off a ledger that does not verify (broken at position ${v.brokenAt}) — an aggregate over tampered history is a real number about a fake history` };

  const triaged = chain.filter((item) => item.kind === 'fallbrain-triage').map((item) => item.entry);
  if (triaged.length === 0) return { ok: true, categories: [], unresolvedCount: 0, totalTriaged: 0, why: 'no triage receipts in the ledger yet — nothing to signal from' };

  const byCategory = {};
  let unresolvedCount = 0;
  for (const r of triaged) {
    if (r.resolved !== true || typeof r.category !== 'string' || r.category.length === 0) { unresolvedCount++; continue; }
    const c = (byCategory[r.category] ||= { category: r.category, total: 0, escalated: 0, local: 0 });
    c.total++;
    if (r.tier === 'escalated') c.escalated++;
    else c.local++;
  }

  const categories = Object.values(byCategory).map((c) => ({
    category: c.category,
    total: c.total,
    local: c.local,
    escalated: c.escalated,
    escalationRate: c.escalated / c.total,
    enoughSample: c.total >= MIN_SAMPLE,
    flag: c.total >= MIN_SAMPLE
      ? `${c.escalated}/${c.total} escalated (${Math.round((c.escalated / c.total) * 100)}%) — enough volume to mean something`
      : `only ${c.total} sample(s) — below the ${MIN_SAMPLE}-sample floor, too few to conclude anything`,
  })).sort((a, b) => (b.escalated - a.escalated) || (b.total - a.total));

  return {
    ok: true,
    categories,
    unresolvedCount,
    totalTriaged: triaged.length,
    why: categories.length > 0
      ? `${triaged.length} triage receipt(s) across ${categories.length} recognised categor${categories.length === 1 ? 'y' : 'ies'}, ${unresolvedCount} unresolved`
      : `${triaged.length} triage receipt(s), all unresolved — the taxonomy or the prompt may be the gap, not which model answers`,
  };
}
