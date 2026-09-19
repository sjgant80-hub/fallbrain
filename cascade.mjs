// fallbrain · cascade.mjs — wires the priority law to the FallForge local-first cascade.
//
// nextAction() decides WHAT needs doing; tick() checks the grant covers it. Neither prices HOW the
// doing gets answered. This law does: the company's own local model answers first, and a genuine
// format failure — never the model's own uncertainty — is the only thing that escalates to a bigger
// model. shouldEscalate() below is ported VERBATIM from fallnode's kernel.mjs (the same proven,
// shipped, gated function already running FallForge's real local-first mechanism), so a company
// assembled on fallbrain prices its AI work exactly the way the rest of the estate already does — not
// a similar-looking reimplementation. ASK_COST/LIMB_COST match fallnode's CHARGE_ASK/CHARGE_LIMB.
//
// cascadeReceipt() carries a taskHash — the same binding field Veridia's crosscheckReceipt uses and
// the fallforge provenance organ's "audited" link checks — so a cascade decision is, by construction,
// something a Veridia department could later cross-check and the hub's provenanceChain could later
// walk. That join isn't built yet (see the honest-scope note in the architecture brief); this receipt
// shape is what makes it buildable without a redesign.
//
// Pure and total: garbage in -> { ok:false, why }, never a throw.

const isStr = (v) => typeof v === 'string';
const isObj = (v) => (v && typeof v === 'object' && !Array.isArray(v));
const isInt = (v) => Number.isInteger(v);
const HEX = /^[0-9a-f]+$/;
const isHash = (v) => isStr(v) && v.length === 64 && HEX.test(v);

export const ASK_COST = 1;    // fallnode kernel.mjs — CHARGE_ASK
export const LIMB_COST = 5;   // fallnode kernel.mjs — CHARGE_LIMB

// ── SHA-256 + canonical JSON (vendored verbatim — see kernel.mjs in every sibling repo for why) ──
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256(text) {
  if (!isStr(text)) return { ok: false, why: 'sha256 takes a string' };
  const data = new TextEncoder().encode(text);
  const len = data.length;
  const padded = new Uint8Array((((len + 8) >> 6) << 6) + 64);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  const bitLen = len * 8;
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < padded.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15], y = w[t - 2];
      const s0 = (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) >>> 0;
      const s1 = (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10)) >>> 0;
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, hh = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K256[t] + w[t]) >>> 0;
      const S0 = (((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return { ok: true, hash: hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7) };
}

export function canon(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return '"?"';
}

/** shouldEscalate(output, format) — ported verbatim from fallnode/kernel.mjs. Does the node's answer
 *  hold the required JSON shape? A format failure is the ONLY thing that escalates. */
export function shouldEscalate(output, format) {
  if (!isObj(format) || !isStr(format.type)) return { ok: false, why: 'a format is { type, ... }' };
  if (format.type === 'any') return { ok: true, escalate: false, why: 'free-form — the node answer stands' };
  if (format.type !== 'json') return { ok: false, why: 'unknown format type: ' + format.type };
  if (!Array.isArray(format.required)) return { ok: false, why: 'json format needs a required fields array' };
  for (const f of format.required) if (!isStr(f) || f.length === 0) return { ok: false, why: 'each required field must be a non-empty string' };
  if (!isStr(output)) return { ok: true, escalate: true, why: 'no output produced' };
  const start = output.indexOf('{');
  if (start === -1) return { ok: true, escalate: true, why: 'no JSON object in the answer' };
  let depth = 0, end = -1, inStr = false, escNext = false;
  for (let i = start; i < output.length; i++) {
    const c = output[i];
    if (escNext) { escNext = false; continue; }
    if (c === '\\') { escNext = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return { ok: true, escalate: true, why: 'unbalanced JSON in the answer' };
  let obj;
  try { obj = JSON.parse(output.slice(start, end + 1)); } catch (e) { return { ok: true, escalate: true, why: 'the answer’s JSON does not parse' }; }
  if (!isObj(obj)) return { ok: true, escalate: true, why: 'the answer’s JSON is not an object' };
  for (const f of format.required) {
    if (!(f in obj)) return { ok: true, escalate: true, why: 'answer JSON is missing the field: ' + f };
  }
  return { ok: true, escalate: false, why: 'the node’s answer holds its format' };
}

/** cascade(decision, output, format) — given the priority law's chosen action and what the local
 *  model actually produced, decide the tier, the real cost, and name why. Never silent. */
export function cascade(decision, output, format) {
  if (!isObj(decision)) return { ok: false, why: 'cascade needs the loop’s decision object' };
  if (!isStr(decision.action)) return { ok: false, why: 'the decision needs an action' };
  const esc = shouldEscalate(output, format);
  if (!esc.ok) return esc;
  if (esc.escalate) return { ok: true, tier: 'escalated', cost: LIMB_COST, action: decision.action, why: 'local model did not hold format (' + esc.why + ') — escalated to the limb, labelled and priced higher' };
  return { ok: true, tier: 'local', cost: ASK_COST, action: decision.action, why: 'local model held format — ' + esc.why };
}

/** cascadeReceipt(input) — seals one cascade decision into a re-verifiable, provenance-bindable
 *  receipt. taskHash lets a downstream Veridia audit or the hub's provenance walk bind to this
 *  exact decision later, without this kernel needing to know anything about either. */
export function cascadeReceipt(input) {
  if (!isObj(input)) return { ok: false, why: 'cascadeReceipt takes an object' };
  const { decision, output, format, holder, createdAt } = input;
  if (!isStr(holder)) return { ok: false, why: 'the receipt needs a holder' };
  if (holder.trim().length === 0) return { ok: false, why: 'the receipt needs a non-empty holder' };
  if (!isStr(createdAt)) return { ok: false, why: 'the receipt needs a createdAt timestamp' };
  if (createdAt.length === 0) return { ok: false, why: 'the receipt needs a non-empty createdAt timestamp' };
  const c = cascade(decision, output, format);
  if (!c.ok) return c;
  const th = sha256(canon({ action: decision.action, output: isStr(output) ? output : null }));
  if (!th.ok) return { ok: false, why: th.why };
  const body = {
    v: 1,
    kind: 'fallbrain-cascade',
    action: c.action,
    tier: c.tier,
    cost: c.cost,
    holder: holder.trim(),
    taskHash: th.hash,
    createdAt,
    why: c.why,
    scope: 'One priced local-first routing decision: which tier answered this action and what it cost. Proves the escalation rule was applied honestly to this decision — not that the answer itself was correct or that the action was approved to run.',
  };
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  return { ok: true, receipt: { ...body, hash: h.hash } };
}

/** cascadeSignable(receipt) — the exact canonical bytes an Ed25519 signature covers (minus signature). */
export function cascadeSignable(receipt) {
  if (!isObj(receipt)) return { ok: false, why: 'not a fallbrain cascade receipt' };
  if (receipt.kind !== 'fallbrain-cascade') return { ok: false, why: 'not a fallbrain cascade receipt' };
  if (!isHash(receipt.hash)) return { ok: false, why: 'the receipt has no hash' };
  const body = { ...receipt };
  delete body.signature;
  return { ok: true, payload: canon(body) };
}

/** verifyCascadeReceipt(r) — matches its own hash AND the cost actually matches its own tier. */
export function verifyCascadeReceipt(r) {
  if (!isObj(r)) return { ok: false, why: 'not a fallbrain cascade receipt' };
  if (r.kind !== 'fallbrain-cascade') return { ok: false, why: 'not a fallbrain cascade receipt' };
  if (!isHash(r.hash)) return { ok: false, why: 'the receipt has no hash' };
  const body = { ...r };
  delete body.hash;
  delete body.signature;
  const h = sha256(canon(body));
  if (!h.ok) return { ok: false, why: h.why };
  if (h.hash !== r.hash) return { ok: true, valid: false, why: 'the receipt does not match its own fingerprint — it was changed after it was issued' };
  if (r.tier !== 'local' && r.tier !== 'escalated') return { ok: true, valid: false, why: 'the receipt has no valid tier' };
  if (!isInt(r.cost)) return { ok: true, valid: false, why: 'the receipt has no cost' };
  const expectedCost = r.tier === 'local' ? ASK_COST : LIMB_COST;
  if (r.cost !== expectedCost) return { ok: true, valid: false, why: 'the receipt’s cost does not match its own tier — a local tier must cost ' + ASK_COST + ', escalated must cost ' + LIMB_COST };
  return { ok: true, valid: true, why: 'cascade intact' };
}
