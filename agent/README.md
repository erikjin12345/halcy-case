# agent

Planning folder for the whole booking agent. No code yet. Conventions are in
`CLAUDE.md`; read it before writing anything here.

## Layout

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `CLAUDE.md`       | Conventions: English only, short files, payment boundary, logging             |
| `ARCHITECTURE.md` | The four-agent design (orchestrator, web search, objective function, validation) and an assessment against the brief |
| `MODELS.md`       | Which model does which job, cost per booking, what we measure                 |
| `payment/`        | The payment hand-off module that runs after the four agents                   |
| `payment/README.md` | Goals and hard limits of the hand-off                                       |
| `payment/TRAPS.md`  | Every trap in the mock hotel, its effect, and ways around it                |

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
- 2026-10-06: Agent state is an in-memory `Store` (`starter/agent/store.ts`)
  in the 2.9 three-table shape. No sqlite or Docker for the prototype: the
  hold and browser session die with the run anyway, and evidence is in
  `RunLog`. A Firestore store implements the same interface later.
- 2026-10-06: Model choices written up in `MODELS.md`. Defaults stay on
  `claude-opus-5-5` for every role. Proposed: search moves to a cheaper model
  once measured against Opus on the example asks; the other three stay.
