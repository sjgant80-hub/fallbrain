#!/usr/bin/env node
// fallbrain · build-page.mjs — inline the gated kernel (brain.mjs) VERBATIM into index.html between
// the markers, exposing window.FALLBRAIN. CI diffs the rebuild: the live law cannot drift from the
// proven law. Replacement is a FUNCTION (never a string) so any $-sequences in the kernel are inert.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const strip = (f) => readFileSync(join(here, f), 'utf8')
  .replace(/^export default .*$/m, '')
  .replace(/^export /gm, '')
  .replace(/<\/script/gi, '<\\/script');
const brain = strip('brain.mjs');
const state = strip('state.mjs');
const draft = strip('draft.mjs');
const cascade = strip('cascade.mjs');
// triage.mjs is the one kernel that composes ANOTHER kernel (cascade.mjs) via a real ES import —
// correct for Node (tests, witness), but each inlined kernel gets its OWN plain-script IIFE scope
// here, not a module graph. Translate the import into a destructure off window.FALLBRAIN, which by
// this point in the concatenated script already carries everything cascade.mjs's own IIFE assigned.
const triage = strip('triage.mjs')
  .replace(/^import \{[^}]*\} from '\.\/cascade\.mjs';$/m, "const { cascade, ASK_COST, LIMB_COST, sha256, canon } = window.FALLBRAIN;");
// ledger.mjs composes BOTH cascade.mjs (sha256/canon/verifyCascadeReceipt) and triage.mjs
// (verifyTriageReceipt) via real ES imports — same translation, both collapse onto window.FALLBRAIN
// since by this point in the concatenated script both prior IIFEs have already assigned to it.
const ledger = strip('ledger.mjs')
  .replace(/^import \{[^}]*\} from '\.\/cascade\.mjs';$/m, "const { sha256, canon, verifyCascadeReceipt } = window.FALLBRAIN;")
  .replace(/^import \{[^}]*\} from '\.\/triage\.mjs';$/m, "const { verifyTriageReceipt } = window.FALLBRAIN;");
const signal = strip('signal.mjs')
  .replace(/^import \{[^}]*\} from '\.\/ledger\.mjs';$/m, "const { verifyLedgerChain } = window.FALLBRAIN;");
// fold.mjs has no cross-file imports (pure primorial/shield arithmetic) — inlined as-is.
const fold = strip('fold.mjs');
// store.mjs composes cascade.mjs (sha256/canon) and fold.mjs (shielded/verifyShield) — same
// window.FALLBRAIN translation as every other composing kernel here.
const store = strip('store.mjs')
  .replace(/^import \{[^}]*\} from '\.\/cascade\.mjs';$/m, "const { sha256, canon } = window.FALLBRAIN;")
  .replace(/^import \{[^}]*\} from '\.\/fold\.mjs';$/m, "const { shielded, verifyShield } = window.FALLBRAIN;");
// disk.mjs is the ungated I/O half (compression, File System Access, download/upload) — composes
// store.mjs's gated law the same way.
const disk = strip('disk.mjs')
  .replace(/^import \{[^}]*\} from '\.\/store\.mjs';$/m, "const { sealEnvelope, openEnvelope, parseSnapshotFile } = window.FALLBRAIN;");

// each kernel gets its OWN scope — they all declare helper consts (obj etc.) that would collide in one
const block = `/*__KERNEL_START__*/
window.FALLBRAIN = {};
(function(){
${brain.trim()}
Object.assign(window.FALLBRAIN, { DOORS, CAPABILITIES, validSpec, assemble, nextAction, tick });
})();
(function(){
${state.trim()}
Object.assign(window.FALLBRAIN, { deriveState, ORGAN_DBS });
})();
(function(){
${draft.trim()}
Object.assign(window.FALLBRAIN, { draftBrief, acceptDraft, DRAFT_SYSTEM });
})();
(function(){
${strip('inbox.mjs').trim()}
Object.assign(window.FALLBRAIN, { enqueue, turnKey, pending });
})();
(function(){
${strip('writeback.mjs').trim()}
Object.assign(window.FALLBRAIN, { writebackPlan, writeAllowed, WRITE_CAPS });
})();
(function(){
${cascade.trim()}
Object.assign(window.FALLBRAIN, { ASK_COST, LIMB_COST, shouldEscalate, cascade, cascadeReceipt, cascadeSignable, verifyCascadeReceipt, sha256, canon });
})();
(function(){
${triage.trim()}
Object.assign(window.FALLBRAIN, { TRIAGE_FORMAT, CATEGORIES, CATEGORY_FIELD, URGENCIES, parseTriage, triageOutcome, triageReceipt, triageSignable, verifyTriageReceipt });
})();
(function(){
${ledger.trim()}
Object.assign(window.FALLBRAIN, { appendReceipt, verifyLedgerChain });
})();
(function(){
${signal.trim()}
Object.assign(window.FALLBRAIN, { escalationSignal, MIN_SAMPLE });
})();
(function(){
${fold.trim()}
Object.assign(window.FALLBRAIN, { RINGS, PRIMORIAL, SHIELD, STATES, foldSubset, unfoldSubset, isBloom, foldResidues, unfoldResidues, shield, shielded, verifyShield });
})();
(function(){
${store.trim()}
Object.assign(window.FALLBRAIN, { STORE_KIND: KIND, STORE_VERSION: VERSION, sealEnvelope, openEnvelope, parseSnapshotFile, receiptHashOf });
})();
(function(){
${disk.trim()}
Object.assign(window.FALLBRAIN, { gzipCompress, gzipDecompress, hasFileSystemAccess, makeSnapshot, restoreSnapshot, pickSaveHandle, pickOpenHandle, saveToHandle, loadFromHandle, downloadEnvelope, readUploadedFile });
})();
/*__KERNEL_END__*/`;

const htmlPath = join(here, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /\/\*__KERNEL_START__\*\/[\s\S]*?\/\*__KERNEL_END__\*\//;
if (!re.test(html)) { console.error('REFUSED: markers not found'); process.exit(1); }
writeFileSync(htmlPath, html.replace(re, () => block));
console.log(`inlined ${((brain.length + state.length + draft.length + cascade.length + triage.length + ledger.length + signal.length + fold.length + store.length + disk.length) / 1024).toFixed(1)}KB of gated law (deciding + derivation + drafting + cascade + triage + ledger + signal + fold + store + disk) into index.html`);
