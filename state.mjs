// fallbrain · state.mjs — the derivation law: real organ records in, the day-state counts out.
//
// The organs store their records device-local (IndexedDB, one origin across the whole estate), so
// fallbrain can READ them — but the counts the loop runs on must be DERIVED BY LAW, not eyeballed.
// This kernel is that law, pure and total so witness can gate it. The IO (opening the organs' DBs)
// lives in the page; everything decidable lives here.
//
// Semantics are lifted from the organs' OWN code, not invented:
//   · an active client is one not archived (archivedAt null)                      [-onboard family]
//   · cooling-off EXPIRED: expiresAt reached, not waived, not cancelled           [fallclaimonboard]
//   · CDD pending: kyc.status === 'pending'                                       [-onboard family]
//   · review due: kyc.nextReviewDue within 30 days (the organ's own overdue rule) [-onboard family]
//   · complaint open: no resolvedAt                                               [fallclaimonboard]
//   · invoice unpaid: status === 'sent' (issued and awaiting payment;
//     'draft' is not yet owed, 'paid' is done)                                    [fallinvoice]

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const arr = (v) => (v === undefined || v === null) ? [] : (Array.isArray(v) ? v : null);
const REVIEW_WINDOW_MS = 30 * 86400000;

/**
 * The verified map of organ databases — read from each organ's SHIPPED SOURCE, never guessed, every
 * entry re-verified 2026-08-25. Two traps an assumed convention would have hit:
 *   · the naming SPLITS: five organs use ".v1", five "-v1";
 *   · the ARCHITECTURE splits: four organs keep clients in a snapshot (store "state", key "main",
 *     snap.clients — mode "snapshot"), six keep them as per-record rows in a keyPath store whose
 *     NAME varies (clients / candidates / patients / starters — mode "records"). A snapshot-only
 *     reader silently reads the six as empty — the silent-empty defect class, caught by verifying.
 * personStore names the row store for records mode; complaintsStore exists in claims only.
 */
export const ORGAN_DBS = Object.freeze({
  claims: { db: 'fallclaimonboard.v1', mode: 'snapshot', personStore: null, complaintsStore: 'complaints' },
  legal: { db: 'falllegalonboard.v1', mode: 'snapshot', personStore: null, complaintsStore: null },
  insurance: { db: 'fallinsuranceonboard.v1', mode: 'snapshot', personStore: null, complaintsStore: null },
  veterinary: { db: 'fallvetonboard.v1', mode: 'snapshot', personStore: null, complaintsStore: null },
  accountancy: { db: 'fallbooksonboard.v1', mode: 'records', personStore: 'clients', complaintsStore: null },
  estate: { db: 'fallestateonboard-v1', mode: 'records', personStore: 'clients', complaintsStore: null },
  mortgage: { db: 'fallmortgageonboard-v1', mode: 'records', personStore: 'clients', complaintsStore: null },
  recruitment: { db: 'fallrecruitonboard-v1', mode: 'records', personStore: 'candidates', complaintsStore: null },
  clinic: { db: 'fallcliniconboard-v1', mode: 'records', personStore: 'patients', complaintsStore: null },
  hr: { db: 'fallhronboard-v1', mode: 'records', personStore: 'starters', complaintsStore: null },
  sharedInvoices: { db: 'fallinvoice', store: 'invoices' },
});

/**
 * Derive the day-state the loop runs on. records = { clients?, complaints?, invoices? } — each an
 * array when present (a missing source reads as empty, a NON-ARRAY is refused: a wrong shape must
 * never derive a wrong-but-plausible zero). nowMs anchors the clocks and must be a real timestamp.
 */
export function deriveState(records, nowMs) {
  const r = obj(records);
  if (!r) return { ok: false, why: 'records must be { clients?, complaints?, invoices? }' };
  if (!Number.isInteger(nowMs) || nowMs <= 0) return { ok: false, why: 'nowMs must be a real epoch-ms timestamp — the cooling and review clocks anchor to it' };
  const clients = arr(r.clients), complaints = arr(r.complaints), invoices = arr(r.invoices);
  if (!clients) return { ok: false, why: 'clients must be an array of client records' };
  if (!complaints) return { ok: false, why: 'complaints must be an array of complaint records' };
  if (!invoices) return { ok: false, why: 'invoices must be an array of invoice records' };

  const active = clients.filter((c) => obj(c) && !c.archivedAt);
  const coolingExpired = active.filter((c) => {
    const k = obj(c.cooling);
    return !!(k && k.expiresAt && k.expiresAt <= nowMs && !k.waived && !k.cancelledAt);
  }).length;
  const cddPending = active.filter((c) => obj(c.kyc) && c.kyc.status === 'pending').length;
  const reviewsDue = active.filter((c) => {
    const k = obj(c.kyc);
    return !!(k && k.nextReviewDue && (k.nextReviewDue - nowMs) < REVIEW_WINDOW_MS);
  }).length;
  const complaintsOpen = complaints.filter((x) => obj(x) && !x.resolvedAt).length;
  const invoicesUnpaid = invoices.filter((x) => obj(x) && x.status === 'sent').length;

  return {
    ok: true,
    coolingExpired, complaintsOpen, cddPending, reviewsDue, invoicesUnpaid,
    docsAwaited: 0, // no organ publishes an "awaited documents" signal yet — 0 by honesty, not by measurement
    counts: { activeClients: active.length, totalClients: clients.length, complaints: complaints.length, invoices: invoices.length },
    why: `derived from ${active.length} active client(s), ${complaints.length} complaint record(s), ${invoices.length} invoice(s) — docsAwaited has no organ signal yet and reads 0`,
  };
}

export default deriveState;
