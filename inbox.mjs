// fallbrain · inbox.mjs — the door-queue law: the brain queues, a HUMAN turns the key.
//
// The loop's door decisions land here and WAIT. Nothing in this kernel can approve anything —
// approval is an argument a person makes, and this law only governs what that argument must look
// like: what may enter a queue, that one job holds one key, that a decided item stays decided, and
// that a refusal carries a reason you could argue with (a reason under 12 characters is a shrug,
// not an argument — the exemption-is-a-reason rule, applied to the doors).
//
// Pure and total over a plain queue array; the page persists it (IndexedDB, device-local) and
// renders it. Garbage in → { ok:false, why }, never a corrupted queue.

const DOORS = ['money', 'legal', 'taste', 'client-trust'];
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const str = (v) => (typeof v === 'string' ? v : '');
const now_ = (v) => Number.isInteger(v) && v > 0;

/**
 * Queue a door decision. Pure: returns { ok, queue, entry } with a NEW array. seq makes the id
 * deterministic (the caller owns the counter). One job holds one key: the same action pending at
 * the same door is refused — queueing it twice would let one approval look like two.
 */
export function enqueue(queue, item, seq, nowMs) {
  if (!Array.isArray(queue)) return { ok: false, why: 'the queue is an array' };
  const it = obj(item);
  if (!it) return { ok: false, why: 'not a queueable item' };
  if (!DOORS.includes(it.door)) return { ok: false, why: `"${str(it.door)}" is not one of the four doors (${DOORS.join(', ')})` };
  if (!str(it.action).trim()) return { ok: false, why: 'a queued item needs the action the loop decided' };
  if (!str(it.why).trim()) return { ok: false, why: 'a queued item needs the decision\'s reason — an item that cannot say why it is here does not get a key' };
  if (!Number.isInteger(seq) || seq < 1) return { ok: false, why: 'seq must be a positive integer (the caller owns the counter)' };
  if (!now_(nowMs)) return { ok: false, why: 'nowMs must be a real epoch-ms timestamp' };
  if (queue.some((q) => obj(q) && q.status === 'pending' && q.action === it.action && q.door === it.door)) {
    return { ok: false, why: `"${it.action}" is already pending at the ${it.door} door — one job holds one key; clear it before queueing it again` };
  }
  const entry = {
    id: 'k' + seq, ts: nowMs, door: it.door, action: it.action,
    count: Number.isInteger(it.count) && it.count >= 0 ? it.count : 0,
    why: str(it.why), draft: str(it.draft) || null, draftedBy: str(it.draftedBy) || null,
    status: 'pending', decidedAt: null, verdict: null, reason: null,
  };
  return { ok: true, queue: queue.concat([entry]), entry };
}

/**
 * The human key-turn. verdict 'approved' or 'refused'; a REFUSAL requires a reason of at least 12
 * characters — a sentence you could argue with, never a flag. A decided item stays decided: the
 * second turn of the same key is refused, because an audit trail where verdicts move is no trail.
 */
export function turnKey(queue, id, verdict, reason, nowMs) {
  if (!Array.isArray(queue)) return { ok: false, why: 'the queue is an array' };
  if (!now_(nowMs)) return { ok: false, why: 'nowMs must be a real epoch-ms timestamp' };
  if (verdict !== 'approved' && verdict !== 'refused') return { ok: false, why: 'a key turns to "approved" or "refused" — nothing else' };
  const i = queue.findIndex((q) => obj(q) && q.id === id);
  if (i < 0) return { ok: false, why: `no item "${str(id)}" in the queue` };
  const q = queue[i];
  if (q.status !== 'pending') {
    return { ok: false, why: `"${q.action}" was already ${q.verdict} — a decided item stays decided; the record does not move` };
  }
  const r = str(reason).trim();
  if (verdict === 'refused' && r.length < 12) {
    return { ok: false, why: 'a refusal needs a reason you could argue with (at least 12 characters) — under that is a shrug, not an argument' };
  }
  const next = queue.slice();
  next[i] = Object.assign({}, q, { status: 'decided', verdict, reason: r || null, decidedAt: nowMs });
  return { ok: true, queue: next, entry: next[i] };
}

/** The doors' live view: pending items per door, oldest first — the queue a key-holder walks. */
export function pending(queue) {
  if (!Array.isArray(queue)) return { ok: false, why: 'the queue is an array' };
  const byDoor = { money: [], legal: [], taste: [], 'client-trust': [] };
  for (const q of queue) if (obj(q) && q.status === 'pending' && byDoor[q.door]) byDoor[q.door].push(q);
  for (const d of DOORS) byDoor[d].sort((a, b) => a.ts - b.ts);
  const total = DOORS.reduce((n, d) => n + byDoor[d].length, 0);
  return { ok: true, byDoor, total, why: total === 0 ? 'no keys waiting — the doors are clear' : `${total} key(s) waiting for a human hand` };
}

export default turnKey;
