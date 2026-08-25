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
Object.assign(window.FALLBRAIN, { writebackPlan });
})();
/*__KERNEL_END__*/`;

const htmlPath = join(here, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /\/\*__KERNEL_START__\*\/[\s\S]*?\/\*__KERNEL_END__\*\//;
if (!re.test(html)) { console.error('REFUSED: markers not found'); process.exit(1); }
writeFileSync(htmlPath, html.replace(re, () => block));
console.log(`inlined ${((brain.length + state.length + draft.length) / 1024).toFixed(1)}KB of gated law (deciding + derivation + drafting) into index.html`);
