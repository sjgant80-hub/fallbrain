// fall-remember · disk.mjs — the durable disk I/O: real gzip compression, a real user-granted disk
// handle where the browser offers one, and a universal export/import file fallback everywhere else.
// Ungated glue around store.mjs's gated envelope law — same split every claudedidy CLI uses around
// a gated kernel (orders.mjs/preflight.mjs, cascade.mjs/precedent-cli.mjs, ledger.mjs/the page).
//
// REAL compression, checked empirically before writing this file, not assumed: CompressionStream /
// DecompressionStream ('gzip') are a W3C standard, identical API in Node 18+ and every evergreen
// browser (Blob/Response/btoa/atob too) — verified live in node directly: a 600-byte string
// compressed to 39 bytes and decompressed back byte-exact before a single line of this was written.
//
// HONEST, stated on the surface that uses this, not just in a comment: the File System Access API
// (showSaveFilePicker/showOpenFilePicker, seamless re-save to the same granted file) is Chromium-
// family only as of the check run before this file was written — re-verify before claiming
// universal support, never imply it. The export/import fallback works in every browser and is the
// one this estate already ships in miniature (fallbrain's receipt downloads) — same "own your
// file" shape, applied to the whole memory store instead of one receipt.

import { sealEnvelope, openEnvelope, parseSnapshotFile } from './store.mjs';

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** gzipCompress(text) — real gzip, real bytes reduced, base64-encoded for a single JSON file. */
export async function gzipCompress(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

/** gzipDecompress(base64) — the exact inverse. Throws on genuinely corrupt gzip bytes (a real
 *  decompression failure) — the caller (makeSnapshot/restoreSnapshot below) is where that's
 *  turned into an honest {ok:false} rather than an uncaught exception reaching the page. */
export async function gzipDecompress(base64) {
  const bytes = base64ToBytes(base64);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

/**
 * hasFileSystemAccess() — the honest capability check this estate's own doctrine demands (never
 * imply a capability the running browser doesn't have). Chromium-family only, checked live, not
 * sniffed by user-agent string.
 */
export function hasFileSystemAccess() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/**
 * makeSnapshot(stateObject) — stateObject: anything JSON-serialisable (fall-remember's own
 * toJSON() output, or any other real app state — this file does not assume FallRemember
 * specifically, on purpose, so the SAME primitive can back fall-remember's own memory and a
 * shipped app's own IndexedDB-backed state, e.g. fallbrain's). Returns the sealed, compressed
 * envelope ready to write to one file, or {ok:false} on a genuine failure (never throws).
 */
export async function makeSnapshot(stateObject) {
  let json;
  try { json = JSON.stringify(stateObject); } catch (e) { return { ok: false, why: 'the state is not JSON-serialisable: ' + e.message }; }
  if (typeof json !== 'string' || json === undefined) return { ok: false, why: 'the state serialised to nothing (a function or undefined at the top level)' };
  let compressedB64;
  try { compressedB64 = await gzipCompress(json); } catch (e) { return { ok: false, why: 'compression failed: ' + e.message }; }
  const sealed = sealEnvelope({ json, compressedB64, createdAt: new Date().toISOString() });
  if (!sealed.ok) return sealed;
  return { ok: true, envelope: sealed.envelope };
}

/**
 * restoreSnapshot(rawParsedFile) — rawParsedFile: whatever JSON.parse produced from a file the
 * user picked or a granted handle read. Decompresses, verifies BOTH teeth against the gated law
 * (store.mjs), and only then hands back the real state object. Refuses (never throws) on any
 * malformed file, wrong version, or failed verification — a caller gets {ok:false, why} for every
 * one of those, and {ok:true, valid:false, why} specifically for a file that parses and decompresses
 * but fails the tamper/corruption check, so the two failure classes are never confused.
 */
export async function restoreSnapshot(rawParsedFile) {
  const parsed = parseSnapshotFile(rawParsedFile);
  if (!parsed.ok) return parsed;
  let json;
  try { json = await gzipDecompress(parsed.envelope.compressed); }
  catch (e) { return { ok: false, why: 'the compressed payload will not decompress — the file is corrupt: ' + e.message }; }
  const v = openEnvelope(parsed.envelope, json);
  if (!v.ok) return v;
  if (!v.valid) return { ok: true, valid: false, why: v.why };
  let state;
  try { state = JSON.parse(json); } catch (e) { return { ok: true, valid: false, why: 'decompressed bytes verified but do not parse as JSON: ' + e.message }; }
  return { ok: true, valid: true, state, envelope: parsed.envelope };
}

// ---- File System Access API path (Chromium-family; capability-checked by the caller) ----

/** pickSaveHandle(suggestedName) — the ONE user-permission moment; after this, saveToHandle can
 *  re-save silently to the same file, which is the whole point (no repeated file-picker nagging). */
export async function pickSaveHandle(suggestedName = 'fall-remember-memory.json') {
  if (!hasFileSystemAccess()) return { ok: false, why: 'File System Access is not available in this browser' };
  try {
    const handle = await window.showSaveFilePicker({ suggestedName, types: [{ description: 'Fall-remember snapshot', accept: { 'application/json': ['.json'] } }] });
    return { ok: true, handle };
  } catch (e) { return { ok: false, why: e && e.name === 'AbortError' ? 'the user cancelled the file picker' : 'could not get a save handle: ' + e.message }; }
}

export async function pickOpenHandle() {
  if (typeof window === 'undefined' || typeof window.showOpenFilePicker !== 'function') return { ok: false, why: 'File System Access open-picker is not available in this browser' };
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Fall-remember snapshot', accept: { 'application/json': ['.json'] } }] });
    return { ok: true, handle };
  } catch (e) { return { ok: false, why: e && e.name === 'AbortError' ? 'the user cancelled the file picker' : 'could not get an open handle: ' + e.message }; }
}

export async function saveToHandle(handle, envelope) {
  try {
    const w = await handle.createWritable();
    await w.write(JSON.stringify(envelope));
    await w.close();
    return { ok: true };
  } catch (e) { return { ok: false, why: 'writing to the granted file failed: ' + e.message }; }
}

export async function loadFromHandle(handle) {
  try {
    const file = await handle.getFile();
    const text = await file.text();
    return { ok: true, parsed: JSON.parse(text) };
  } catch (e) { return { ok: false, why: 'reading the granted file failed: ' + e.message }; }
}

// ---- universal fallback: a real download + a real <input type=file> upload, every browser ----

export function downloadEnvelope(envelope, filename = 'fall-remember-memory.json') {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function readUploadedFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => { try { resolve({ ok: true, parsed: JSON.parse(reader.result) }); } catch (e) { resolve({ ok: false, why: 'not valid JSON: ' + e.message }); } };
    reader.onerror = () => resolve({ ok: false, why: 'could not read the file' });
    reader.readAsText(file);
  });
}
