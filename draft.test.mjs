// fallbrain · draft.test.mjs — the drafting law, falsifiable: every brief is law, every tell refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftBrief, acceptDraft, DRAFT_SYSTEM } from './draft.mjs';

const ACTIONS = ['process-cooling-cancellation', 'draft-complaint-response', 'draft-cdd-verification', 'draft-kyc-review', 'draft-payment-chaser', 'generate-documents'];

test('EVERY LOOP ACTION HAS A BRIEF — and each carries the doctrine + a word limit', () => {
  for (const a of ACTIONS) {
    const b = draftBrief({ action: a }, {});
    assert.equal(b.ok, true, a);
    assert.equal(b.system, DRAFT_SYSTEM);
    assert.match(b.system, /never make decisions/, 'the model is told it decides nothing');
    assert.match(b.system, /placeholder/i, 'missing facts become placeholders, never inventions');
    assert.match(b.prompt, /under \d+ words/, a + ' has a length constraint');
  }
});

test('FACTS RIDE ONLY FROM CTX — given facts appear; absent facts become placeholders', () => {
  const withFacts = draftBrief({ action: 'draft-complaint-response' }, { complainant: 'Priya Realrecord', firm: 'Northgate Claims', nature: 'No update for three weeks' });
  assert.match(withFacts.prompt, /Priya Realrecord/);
  assert.match(withFacts.prompt, /Northgate Claims/);
  assert.match(withFacts.prompt, /No update for three weeks/);
  const bare = draftBrief({ action: 'draft-complaint-response' }, {});
  assert.match(bare.prompt, /\[NATURE OF COMPLAINT\]/, 'missing nature is a placeholder, not an invention');
  assert.ok(!/Priya/.test(bare.prompt));
  // ctx is sanitised: newlines flattened, length capped
  const sneaky = draftBrief({ action: 'draft-complaint-response' }, { nature: 'line1\nline2\n' + 'x'.repeat(300) });
  assert.ok(!/\n.*line2/.test(sneaky.prompt.split('Nature of complaint')[1].slice(0, 50)), 'newlines flattened');
  assert.ok(sneaky.prompt.length < 700, 'runaway ctx capped');
});

test('UNKNOWN ACTIONS ARE REFUSED, NOT IMPROVISED — and summarise-day has no client draft', () => {
  assert.match(draftBrief({ action: 'transfer-funds' }, {}).why, /refusing to improvise/);
  assert.match(draftBrief({ action: 'summarise-day' }, {}).why, /no client-facing draft/);
  assert.match(draftBrief(null, {}).why, /decision/);
  assert.match(draftBrief({}, {}).why, /decision/);
});

test('THE GUARD refuses chat-template tokens — the raw-model tell', () => {
  assert.match(acceptDraft('Dear Ms Smith, your request has been processed.<|im_end|>').why, /chat-template token/);
  assert.match(acceptDraft('[INST] Dear Sir, further to your letter of last week, thanks.').why, /chat-template token/);
  assert.match(acceptDraft('<start_of_turn>Dear Madam, we write further to your complaint here.').why, /chat-template token/);
});

test('THE GUARD refuses self-identification and aggression; passes calm', () => {
  assert.match(acceptDraft('As an AI, I have drafted this letter for your complaint about delays.').why, /identifies itself as an AI/);
  assert.match(acceptDraft('Pay this invoice immediately or we will sue you without further notice!!').why, /aggressive/);
  assert.match(acceptDraft('This is your final warning regarding the outstanding balance due to us.').why, /aggressive/);
  const calm = acceptDraft('Dear Ms Realrecord,\n\nThank you for your letter. We are reviewing your file and will respond by [DATE].\n\nYours sincerely,\n[NAME]');
  assert.equal(calm.ok, true);
  assert.match(calm.why, /calm/);
  assert.match(calm.text, /^Dear Ms Realrecord/, 'text returned trimmed');
});

test('THE GUARD refuses thin output with the reason', () => {
  assert.match(acceptDraft('').why, /nothing/);
  assert.match(acceptDraft('   ').why, /nothing/);
  assert.match(acceptDraft('Dear Sir, thanks.').why, /under 40 characters/);
});

test('THE 40-CHAR BOUNDARY — exactly 40 characters is enough to review', () => {
  const exactly40 = 'Dear Ms Smith, we will reply by [DATE]..'; // 40 chars
  assert.equal(exactly40.length, 40);
  assert.equal(acceptDraft(exactly40).ok, true, 'exactly 40 passes (< 40 refuses, not <=)');
  assert.equal(acceptDraft(exactly40.slice(0, 39)).ok, false, '39 is thin');
});

test('COOLING BRIEF — a given ref rides in; a missing ref is a [REFERENCE] placeholder', () => {
  assert.match(draftBrief({ action: 'process-cooling-cancellation' }, { ref: 'NC-042' }).prompt, /reference NC-042/);
  assert.match(draftBrief({ action: 'process-cooling-cancellation' }, {}).prompt, /\[REFERENCE\]/);
});

test('A CTX THAT IS NOT A PLAIN OBJECT CONTRIBUTES NO FACTS — arrays/functions with props are inert', () => {
  // hostile shapes: an array or function can CARRY properties, but only a plain object is a ctx
  const arrCtx = []; arrCtx.nature = 'SMUGGLED';
  assert.ok(!/SMUGGLED/.test(draftBrief({ action: 'draft-complaint-response' }, arrCtx).prompt), 'array props never reach the prompt');
  const fnCtx = function () {}; fnCtx.nature = 'SMUGGLED';
  assert.ok(!/SMUGGLED/.test(draftBrief({ action: 'draft-complaint-response' }, fnCtx).prompt), 'function props never reach the prompt');
  assert.match(draftBrief({ action: 'draft-complaint-response' }, fnCtx).prompt, /\[NATURE OF COMPLAINT\]/);
});

test('FUZZ — total on garbage', () => {
  for (const g of [null, undefined, 7, {}, [], 'ok']) { const r = acceptDraft(g); assert.equal(typeof r.ok, 'boolean'); }
  for (const g of [null, undefined, 7, [], 'go']) { const r = draftBrief(g, g); assert.equal(r.ok, false); }
  assert.ok(true);
});
