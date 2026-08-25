#!/usr/bin/env node
// fallbrain · gen-organs.mjs — generate organs.json from the ESTATE INDEX, never typed by hand.
// One-kernel rule: any surface stating estate facts is generated from the index. The generator
// REFUSES if a named organ is missing or not live — a silent drop is how the empty finance shelf
// shipped ([[audit-before-the-url]]), so absence is a loud stop, not a shrug.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const IDX = process.argv[2] || 'C:/Users/sjgan/.claude/projects/C--Users-sjgan--claude/memory/estate-index.json';
const nodes = JSON.parse(readFileSync(IDX, 'utf8')).nodes.filter((n) => n && n.name && !n.private);
const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));

// the ten complete vertical families (each: onboard=intake, core=casework, paper=docs, practice=firm accounts)
const FAMILIES = {
  claims: 'fallclaim', legal: 'falllegal', accountancy: 'fallbooks', estate: 'fallestate',
  recruitment: 'fallrecruit', clinic: 'fallclinic', hr: 'fallhr', insurance: 'fallinsurance',
  mortgage: 'fallmortgage', veterinary: 'fallvet',
};
// shared organs every company gets, keyed by capability
const SHARED = {
  compliance: ['falljustice', 'redress-engine'],
  sales: ['fallcrm', 'falllead'],
  hiring: ['fallhire'],
  scheduling: ['fallslot'],
  invoicing: ['fallinvoice'],
  payments: ['fallpay'],
  documents: ['fallpdf'],
  forms: ['fallform'],
};

const missing = [];
function organ(name, capability) {
  const n = byName[name];
  if (!n) { missing.push(name + ' (not in index)'); return null; }
  if (!n.live) { missing.push(name + ' (not live)'); return null; }
  return { name, capability, url: n.url || `https://sjgant80-hub.github.io/${name}/`, desc: (n.desc || '').slice(0, 140) };
}

const verticals = {};
for (const [v, fam] of Object.entries(FAMILIES)) {
  verticals[v] = [
    organ(fam + 'onboard', 'intake'),
    organ(fam, 'casework'),
    organ(fam + 'paper', 'documents'),
    organ(fam + 'practice', 'accounts'),
  ].filter(Boolean);
}
const shared = [];
for (const [cap, names] of Object.entries(SHARED)) for (const nm of names) { const o = organ(nm, cap); if (o) shared.push(o); }

if (missing.length) {
  console.error('REFUSED — organs named but absent/not-live (fix or remove, never silently drop):\n  ' + missing.join('\n  '));
  process.exit(1);
}

const out = { generated: new Date().toISOString().slice(0, 10), source: 'estate-index.json', verticals, shared };
writeFileSync(join(here, 'organs.json'), JSON.stringify(out, null, 2));
const total = Object.values(verticals).flat().length + shared.length;
console.log(`organs.json: ${Object.keys(verticals).length} verticals · ${total} organs, all verified live in the index`);
