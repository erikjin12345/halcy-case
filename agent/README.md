# agent

Planning folder for the whole booking agent. No code yet. Conventions are in
`CLAUDE.md`; read it before writing anything here.

## Layout

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `CLAUDE.md`       | Conventions: English only, short files, payment boundary, logging             |
| `ARCHITECTURE.md` | The four-agent design (orchestrator, web search, objective function, validation) and an assessment against the brief |
| `MODELS.md`       | Which model does which job, cost per booking, what we measure                 |
| `WEBVIEW-PLAN.md` | Plan for the production path: hotel site in a WebView in the app, agents on the server. Not built |
| `payment/`        | The payment hand-off module that runs after the four agents                   |
| `payment/README.md` | Goals and hard limits of the hand-off                                       |
| `payment/TRAPS.md`  | Every trap in the mock hotel, its effect, and ways around it                |
| `payment/DESIGN.md` | What we build for payment: status-only rule, `PaymentResult`, hand-off sequence, guards, traps P1 to P14 |

## Where the code goes later

`halcy_case_material/starter/agent/` with one subfolder per agent and
`payment/` for the hand-off, so `starter/agent.ts` can import from it.

## Decisions

One line per decision, with a date. Open questions live in
`ARCHITECTURE.md` section 3 and `payment/TRAPS.md` last section.

- 2026-10-06: Folder renamed from `payment-module/` to `agent/` with
  `payment/` as a subfolder, since the design covers the whole agent.
- 2026-10-06: The four-agent design is kept (ARCHITECTURE.md section 1).
  Decisions 1 to 3 and 5 from section 3 taken as recommended: search inside
  one hotel site; deterministic scoring with model-set weights; validation on
  the shared browser, one candidate at a time; every role on `claude-opus-5-5`
  with per-role env overrides. Decision 4 (mid-run goal updates) deferred.
- 2026-10-06: Code scaffolding written under
  `halcy_case_material/starter/agent/` (see its README). Typechecks. Not yet
  run against the mock; no API key in the environment.
- 2026-10-06: The last four card digits on the hotel's confirmation page are
  masked before any model or log reads the page (`payment/DESIGN.md` P11).
  Models get a payment status, never card details, not even partial ones.
- 2026-10-06: Agent state is an in-memory `Store` (`starter/agent/store.ts`)
  in the 2.9 three-table shape. No sqlite or Docker for the prototype: the
  hold and browser session die with the run anyway, and evidence is in
  `RunLog`. A Firestore store implements the same interface later.
- 2026-10-06: Model choices written up in `MODELS.md`. Defaults stay on
  `claude-opus-5-5` for every role. Proposed: search moves to a cheaper model
  once measured against Opus on the example asks; the other three stay.
- 2026-10-06: `PageDriver` seam between the agents and the browser (phase 0
  of `WEBVIEW-PLAN.md`), PR #7. Agreed with the sessions owning `tools/`,
  `agents/` and the boundary tests. Agents only ever get a guarded driver.
  Merges after the first end-to-end run on `main`.
- 2026-10-06: The traveller pays in the visible browser window on the same
  screen; the live view is dropped (`payment/DESIGN.md` P7). Only the
  hand-off code can end blind mode. The payment sequence is built in
  `starter/agent/payment/`, PR #11, and has booked on the mock with a
  stand-in traveller.
