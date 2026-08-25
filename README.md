# fallbrain

### ▶ Live: **https://sjgant80-hub.github.io/fallbrain/** — assemble a company, boot the brain, run the governed loop.

**The assembly that switches the estate on for ONE company.** The pieces already exist — fallcore
(the on-prem model), fallrouter (local⇄frontier routing), didy/fall-os (the conductor), fallcorp
(the 90/10 company shape), and ~50 live organs (the tools that do the work: onboarding, casework,
documents, firm accounts, compliance…). fallbrain snaps them together and boots:

1. **Assemble** — describe the company (name + vertical). The kernel staffs it from the estate's
   live organs — ten complete vertical families (claims, legal, accountancy, estate, recruitment,
   clinic, HR, insurance, mortgage, veterinary), each with intake / casework / documents / accounts,
   plus the shared layer (compliance, sales, invoicing, scheduling, forms). A capability the estate
   cannot staff is a **named refusal**, never a silent gap.
2. **Boot** — probe your local model (FallRelay / Ollama). The model words drafts and reads free
   text; **it never makes the call**. Local-down degrades the wording, never the law.
3. **Run** — the governed loop. Each tick, the kernel decides the ONE next action by the priority
   law, and every decision speaks its reason.

## The three laws (`brain.mjs`, witness-gated **28/28, zero baselines**)

- **`assemble(spec, organs)`** — staff the company or refuse with the gap named.
- **`nextAction(state)`** — the priority law, argued not arbitrary:
  expired cooling-off (statutory, **legal door**) → open complaints (DISP clock, **client-trust
  door**) → pending CDD (AML, **legal door**) → KYC reviews (auto-draft) → invoice chasers
  (auto-draft; *moving* money is the **money door**) → documents (auto) → summarise-the-day.
- **`tick(state, grant)`** — the wallet rule: no action without a grant that covers it
  (capability × budget, checked **before** the act). Door actions **queue for a human key** and
  never auto-run. Budget exhausted is a full stop, not a quiet continue.

`organs.json` is **generated from the estate index** (`gen-organs.mjs`), never typed — the
generator refuses any organ that is missing or not live. CI runs the tests, the mutation gate, and
diffs the kernel inlined into the live page against the source: **the live law cannot drift from
the proven law.**

## Honest limits

The organs are real and live; the law, doors and grant wall are real refusals. **"Read the real
records" reads this device's actual organ databases** — the whole estate shares one origin
(sjgant80-hub.github.io) and the organs store device-local IndexedDB, so records you created in an
organ are readable here. The derivation law (`state.mjs`, witness-gated **22/22, zero baselines**)
turns raw records into the day-state by the organs' own semantics — and its verified DB map records
a real trap: the family naming **splits** (five organs use `.v1`, five use `-v1`; an assumed
convention would have silently read half the estate as empty). No records on a device is said
plainly, never faked; docsAwaited has no organ signal yet and honestly reads 0. The four doors
(money, legal, taste, client-trust) are held by a human, always: the brain queues, a person turns
the key.

**Proven end-to-end:** a claimant seeded through fallclaimonboard's own UI (CDD pending, expired
cooling clock, open complaint) → fallbrain read the organ's actual IndexedDB → derived the counts
exactly → the loop queued the statutory work at the legal and client-trust doors.

MIT · Built with Konomi (created by Thomas Frumkin · [konomi-systems.com](https://konomi-systems.com))
