// fallbrain · brain.test.mjs — the assembly law, the priority law, and the grant wall, falsifiable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSpec, assemble, nextAction, tick, DOORS, CAPABILITIES } from './brain.mjs';

const ORGANS = JSON.parse(readFileSync(new URL('./organs.json', import.meta.url), 'utf8'));
const CLAIMS = { name: 'Northgate Claims', vertical: 'claims', needs: ['intake', 'casework', 'documents', 'accounts', 'compliance'] };

test('ASSEMBLE staffs a claims firm from live organs and keeps all four doors human', () => {
  const r = assemble(CLAIMS, ORGANS);
  assert.equal(r.ok, true, r.why);
  const names = r.organs.map((o) => o.name);
  assert.ok(names.includes('fallclaimonboard'), 'intake = fallclaimonboard');
  assert.ok(names.includes('fallclaim'), 'casework = fallclaim');
  assert.ok(names.includes('fallclaimpaper'), 'documents = fallclaimpaper');
  assert.ok(names.includes('fallclaimpractice'), 'accounts = fallclaimpractice');
  assert.ok(names.includes('falljustice'), 'compliance = falljustice');
  assert.equal(r.doors.length, 4);
  assert.ok(r.doors.every((d) => d.holder === 'human'), 'every door held by a human');
  assert.deepEqual(r.doors.map((d) => d.door).sort(), [...DOORS].sort());
  assert.ok(r.organs.every((o) => /^https:\/\//.test(o.url)), 'every organ carries its live URL');
});

test('ASSEMBLE works for every vertical the generator emitted — no half-staffed family', () => {
  for (const v of Object.keys(ORGANS.verticals)) {
    const r = assemble({ name: 'T', vertical: v, needs: ['intake', 'casework', 'documents', 'accounts'] }, ORGANS);
    assert.equal(r.ok, true, v + ': ' + r.why);
    assert.ok(r.organs.length >= 4, v + ' staffs its own four family organs');
  }
});

test('ASSEMBLE refuses what it cannot staff — a named gap, never a silent one', () => {
  const r = assemble({ name: 'X', vertical: 'claims', needs: ['intake', 'payments'] }, { verticals: { claims: ORGANS.verticals.claims }, shared: [] });
  assert.equal(r.ok, false);
  assert.match(r.why, /payments/, 'the missing capability is NAMED');
  assert.match(r.why, /refuses/, 'and the refusal says why silent gaps are the defect');
  const rv = assemble({ name: 'X', vertical: 'space-mining', needs: ['intake'] }, ORGANS);
  assert.equal(rv.ok, false);
  assert.match(rv.why, /space-mining/, 'unknown vertical named');
  assert.match(rv.why, /claims/, 'and the real options listed');
});

test('VALIDSPEC refuses garbage with the reason', () => {
  assert.match(validSpec(null).why, /not a company spec/);
  assert.match(validSpec({ name: '', vertical: 'claims', needs: ['intake'] }).why, /needs a name/);
  assert.match(validSpec({ name: 'X', vertical: '', needs: ['intake'] }).why, /vertical/);
  assert.match(validSpec({ name: 'X', vertical: 'claims', needs: [] }).why, /at least one capability/);
  assert.match(validSpec({ name: 'X', vertical: 'claims', needs: ['alchemy'] }).why, /alchemy/);
});

test('THE PRIORITY LAW — statutory clocks outrank money, and the order is total', () => {
  // all pressures at once: expired cooling-off wins (a statutory right is live NOW)
  const all = { coolingExpired: 2, complaintsOpen: 3, cddPending: 4, reviewsDue: 5, invoicesUnpaid: 6, docsAwaited: 7 };
  assert.equal(nextAction(all).action, 'process-cooling-cancellation');
  assert.equal(nextAction({ ...all, coolingExpired: 0 }).action, 'draft-complaint-response');
  assert.equal(nextAction({ ...all, coolingExpired: 0, complaintsOpen: 0 }).action, 'draft-cdd-verification');
  assert.equal(nextAction({ ...all, coolingExpired: 0, complaintsOpen: 0, cddPending: 0 }).action, 'draft-kyc-review');
  assert.equal(nextAction({ ...all, coolingExpired: 0, complaintsOpen: 0, cddPending: 0, reviewsDue: 0 }).action, 'draft-payment-chaser');
  assert.equal(nextAction({ ...all, coolingExpired: 0, complaintsOpen: 0, cddPending: 0, reviewsDue: 0, invoicesUnpaid: 0 }).action, 'generate-documents');
  assert.equal(nextAction({}).action, 'summarise-day');
});

test('THE DOORS — statutory/complaint/CDD actions carry a door; drafting does not', () => {
  assert.equal(nextAction({ coolingExpired: 1 }).door, 'legal');
  assert.equal(nextAction({ complaintsOpen: 1 }).door, 'client-trust');
  assert.equal(nextAction({ cddPending: 1 }).door, 'legal');
  assert.equal(nextAction({ reviewsDue: 1 }).door, null, 'a draft is auto');
  assert.equal(nextAction({ invoicesUnpaid: 1 }).door, null, 'the CHASER is a draft; moving money would be the money door');
  assert.equal(nextAction({ docsAwaited: 1 }).door, null);
});

test('EVERY DECISION SPEAKS — the why carries the count and the reason', () => {
  const d = nextAction({ cddPending: 3 });
  assert.match(d.why, /3/, 'the count is in the reason');
  assert.match(d.why, /AML/, 'and the LAW the priority rests on');
  assert.match(nextAction({ complaintsOpen: 2 }).why, /DISP/);
});

test('TICK — the grant wall: no capability, no action; the refusal names the gap', () => {
  const r = tick({ invoicesUnpaid: 5 }, { capabilities: ['intake'], budget: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.acted, false);
  assert.match(r.why, /REFUSED/);
  assert.match(r.why, /invoicing/, 'the un-granted capability is named');
  assert.equal(r.budget, 10, 'a refused action spends nothing');
});

test('TICK — budget exhausted is a full stop, not a quiet continue', () => {
  const r = tick({ docsAwaited: 1 }, { capabilities: ['documents'], budget: 0 });
  assert.equal(r.acted, false);
  assert.match(r.why, /budget exhausted/);
  assert.match(r.why, /human renews/, 'renewal is a human act');
});

test('TICK — a door action QUEUES and never auto-runs, even with grant and budget', () => {
  const r = tick({ coolingExpired: 1 }, { capabilities: ['intake'], budget: 10 });
  assert.equal(r.acted, false);
  assert.equal(r.queued, 'legal');
  assert.equal(r.budget, 10, 'queueing spends no budget');
  assert.match(r.why, /human turns this key/);
});

test('TICK — an auto action spends exactly one action of budget', () => {
  const r = tick({ docsAwaited: 2 }, { capabilities: ['documents'], budget: 3 });
  assert.equal(r.acted, true);
  assert.equal(r.budget, 2);
  assert.equal(r.decision.action, 'generate-documents');
});

test('TICK — the idle summarise needs no capability grant (it touches nothing external)', () => {
  const r = tick({}, { capabilities: [], budget: 1 });
  assert.equal(r.acted, true);
  assert.equal(r.decision.action, 'summarise-day');
});

test('ORGANS.JSON is generated and honest — every organ live-URL-shaped, ten verticals', () => {
  assert.equal(Object.keys(ORGANS.verticals).length, 10);
  const all = Object.values(ORGANS.verticals).flat().concat(ORGANS.shared);
  assert.ok(all.length >= 40, 'the estate staffs at least 40 organs');
  for (const o of all) {
    assert.ok(/^https:\/\/sjgant80-hub\.github\.io\//.test(o.url), o.name + ' has a Pages URL');
    assert.ok(CAPABILITIES.includes(o.capability), o.name + ' capability is real: ' + o.capability);
  }
});

test('A NON-OBJECT IS REFUSED AS SUCH — strings, numbers and arrays never mis-parse as state', () => {
  // guards obj(): a truthy primitive walked as a record would read every count as 0 and
  // "summarise the day" instead of refusing — a wrong action, not an error.
  assert.match(nextAction('busy day').why, /not an observed state/);
  assert.match(nextAction(7).why, /not an observed state/);
  assert.match(nextAction([{ cddPending: 1 }]).why, /not an observed state/);
  assert.match(tick({ docsAwaited: 1 }, 'full grant').why, /grant/);
  assert.match(tick({ docsAwaited: 1 }, [1, 2]).why, /grant/);
  assert.match(assemble(CLAIMS, [1, 2]).why, /organMap/);
  assert.match(validSpec('a claims firm').why, /not a company spec/);
  assert.match(validSpec([CLAIMS]).why, /not a company spec/);
});

test('FUZZ — total on garbage', () => {
  nextAction(null); nextAction('x'); nextAction(7); tick(null, null); tick({}, {}); assemble(null, null);
  assemble(CLAIMS, null); assemble(CLAIMS, { verticals: null, shared: [] });
  assert.match(nextAction({ cddPending: -1 }).why, /non-negative/);
  assert.match(nextAction({ cddPending: 1.5 }).why, /non-negative/);
  assert.match(tick({}, { capabilities: ['x'], budget: -1 }).why, /grant/);
  assert.ok(true);
});
