# agent

Planning folder for the whole booking agent. No code yet. Conventions are in
`CLAUDE.md`; read it before writing anything here.

## Layout

| Path              | What                                                                          |
| ----------------- | ----------------------------------------------------------------------------- |
| `CLAUDE.md`       | Conventions: English only, short files, payment boundary, logging             |
| `ARCHITECTURE.md` | The four-agent design (orchestrator, web search, objective function, validation) and an assessment against the brief |
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
