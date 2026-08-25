#!/usr/bin/env node
// fallbrain · build-page.mjs — inline the gated kernel (brain.mjs) VERBATIM into index.html between
// the markers, exposing window.FALLBRAIN. CI diffs the rebuild: the live law cannot drift from the
// proven law. Replacement is a FUNCTION (never a string) so any $-sequences in the kernel are inert.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kernel = readFileSync(join(here, 'brain.mjs'), 'utf8')
  .replace(/^export default .*$/m, '')
  .replace(/^export /gm, '')
  .replace(/<\/script/gi, '<\\/script');

const block = `/*__KERNEL_START__*/
(function(){
${kernel.trim()}
window.FALLBRAIN = { DOORS, CAPABILITIES, validSpec, assemble, nextAction, tick };
})();
/*__KERNEL_END__*/`;

const htmlPath = join(here, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /\/\*__KERNEL_START__\*\/[\s\S]*?\/\*__KERNEL_END__\*\//;
if (!re.test(html)) { console.error('REFUSED: markers not found'); process.exit(1); }
writeFileSync(htmlPath, html.replace(re, () => block));
console.log(`inlined ${(kernel.length / 1024).toFixed(1)}KB of gated law into index.html`);
