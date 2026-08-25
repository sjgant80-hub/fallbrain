// fallbrain · writeback.mjs — the write-back law: an APPROVED key lands back in the organ's own
// records, in the organ's own shapes. The circle closes: organ → derivation → decision → human key
// → organ again.
//
// This is surgery on another tool's data, so the law is strict:
//   · only an APPROVED key writes — a pending key has no verdict, a refused key means the work
//     does not happen, and neither touches a record;
//   · every write uses a shape the organ itself defines (verified against its shipped source):
//     cooling.cancelledAt / cancellationReason on the client, the coolingOff register event,
//     client.notes[] for attached letters, a namespaced responses list on the complaint;
//   · a key whose targets no longer exist in the records is a NAMED refusal — the records moved,
//     and writing into a moved world is how ghosts are made;
//   · ids are deterministic per key (a decided key stays decided, so one key = one id, ever).
//
// Pure planner: (entry, records, nowMs) → { ok, ops[], why }. The page executes ops against
// IndexedDB and re-reads to verify; everything decidable lives here where witness can reach it.

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const str = (v) => (typeof v === 'string' ? v : '');
const arr = (v) => (Array.isArray(v) ? v : []);

/** Plan the organ writes for one decided key. Returns ops the page can execute mechanically. */
export function writebackPlan(entry, records, nowMs) {
  const e = obj(entry);
  if (!e) return { ok: false, why: 'writeback needs the inbox entry the human decided' };
  if (!Number.isInteger(nowMs) || nowMs <= 0) return { ok: false, why: 'nowMs must be a real epoch-ms timestamp' };
  if (e.status !== 'decided') return { ok: false, why: 'only a DECIDED key can write back — this one is still waiting for a human hand' };
  if (e.verdict !== 'approved') return { ok: false, why: 'a refused key writes nothing — refusal means the work does not happen, and the record already says why' };
  const r = obj(records);
  if (!r) return { ok: false, why: 'writeback needs the organ records ({ clients?, complaints? })' };
  const clients = arr(r.clients).filter((c) => obj(c) && !c.archivedAt);
  const stamp = 'approved at the ' + str(e.door) + ' door · fallbrain · ' + e.id;

  if (e.action === 'process-cooling-cancellation') {
    const hit = clients.filter((c) => {
      const k = obj(c.cooling);
      return !!(k && k.expiresAt && k.expiresAt <= nowMs && !k.waived && !k.cancelledAt);
    });
    if (!hit.length) return { ok: false, why: 'no client in the organ still has an expired, un-cancelled cooling-off period — the records moved since this key was queued; nothing written' };
    const reason = str(e.reason) || 'cooling-off period expired; cancellation processed';
    const ops = [];
    for (const c of hit) {
      ops.push({ type: 'client-cooling-cancel', clientId: c.id, set: { cancelledAt: nowMs, cancellationReason: reason, processedBy: stamp } });
      ops.push({ type: 'cooling-event', rec: { id: 'co-fb-' + e.id + '-' + c.id, clientId: c.id, kind: 'cancelled', ts: nowMs, processedBy: stamp, notes: '', expiresAt: obj(c.cooling).expiresAt, waived: false, waiverReason: '', cancellationReason: reason } });
    }
    return { ok: true, ops, why: `${hit.length} client(s): cooling cancellation written to the client record AND the organ's cooling-off register, in the organ's own shapes` };
  }

  if (e.action === 'draft-complaint-response') {
    if (!str(e.draft).trim()) return { ok: false, why: 'this key was approved with NO draft attached — there is nothing to write onto the complaint; word the draft and queue a fresh key' };
    const open = arr(r.complaints).filter((x) => obj(x) && !x.resolvedAt);
    if (!open.length) return { ok: false, why: 'no complaint in the organ is still open — the records moved since this key was queued; nothing written' };
    const ops = open.map((x) => ({ type: 'complaint-response', complaintId: x.id, response: { ts: nowMs, door: str(e.door), keyId: e.id, draftedBy: str(e.draftedBy) || 'local model', text: str(e.draft) } }));
    return { ok: true, ops, why: `${open.length} open complaint(s): the approved response letter attached to the complaint record (namespaced — the organ stores it; it does not yet render it)` };
  }

  if (e.action === 'draft-cdd-verification') {
    if (!str(e.draft).trim()) return { ok: false, why: 'this key was approved with NO draft attached — there is nothing to write onto the client; word the draft and queue a fresh key' };
    const hit = clients.filter((c) => obj(c.kyc) && c.kyc.status === 'pending');
    if (!hit.length) return { ok: false, why: 'no client in the organ still has CDD pending — the records moved since this key was queued; nothing written' };
    const ops = hit.map((c) => ({ type: 'client-note', clientId: c.id, note: { ts: nowMs, author: stamp, text: 'CDD document-request letter approved for sending:\n\n' + str(e.draft) } }));
    return { ok: true, ops, why: `${hit.length} client(s): the approved CDD request letter attached to the client's notes (the organ's own notes[] field). CDD status is NOT flipped — approving the LETTER is not verifying the documents; that stays the organ's own act` };
  }

  return { ok: false, why: `no write-back law exists for "${str(e.action)}" — nothing is written (an improvised write into another tool's records is how data goes bad)` };
}

export default writebackPlan;
