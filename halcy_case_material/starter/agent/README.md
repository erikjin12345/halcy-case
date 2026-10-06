# starter/agent

The booking agent: four model-driven roles, one browser, one chat. Planning
and the trap analysis live in `../../../agent/` at the repo root; this folder
is the code. Conventions: `../../../agent/CLAUDE.md`.

## Layout

| Path                     | Job                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `index.ts`               | `bookingAgent`, drop-in for the starter's `agent` in `chat/server.ts`               |
| `config.ts`              | `.env` loading, credential check, model and effort per role (env-overridable)       |
| `types.ts`               | Goal, Objective, ValidationResult, RunState, feature vocabulary                      |
| `store.ts`               | `Store` seam: candidates with per-field timestamps, evaluations by objective hash, rejections by constraint with readmit; in-memory implementation and tests |
| `prompts/*.md`           | One system prompt per role, byte-stable for caching; `prompts/index.ts` loads them  |
| `llm/client.ts`          | `runAgent`: tool-use loop per role with usage logging and refusal handling          |
| `llm/structured.ts`      | `extract`: one-shot Zod-typed extraction, optional screenshot input                 |
| `llm/model.ts`           | The starter's `Model` seam implemented for Claude                                   |
| `tools/boundary.ts`      | `PaymentBoundary`: origin allowlist and blind mode, asked by every browser tool     |
| `tools/driver.ts`        | `PageDriver`: the seam between the agents and whatever holds the hotel page          |
| `tools/playwright-driver.ts` | The raw driver over a Playwright page; reads every frame, never given to an agent |
| `tools/guarded-driver.ts` | The boundary applied to a driver: nothing reaches the page while blind, foreign frames emptied |
| `tools/browser.ts`       | `observe`, `act`, `goto`, `screenshot` as tools on a guarded driver, iframes masked  |
| `payment/handoff.ts`     | The payment step as a fixed sequence in code: last look, blind mode, wait, outcome, report |
| `payment/signals.ts`     | The wait while blind: main-tab navigation, chat buttons, tab closed, deadline, reminders |
| `payment/outcome.ts`     | One redacted read after blind mode; `decide` turns a proposal into a `PaymentResult`  |
| `payment/classify.ts`    | The one model call in the payment step: propose a status from the hotel's page text   |
| `payment/redact.ts`      | Card, code and password fields and last-four digits removed from every observation    |
| `payment/page-facts.ts`  | Hold clock and amounts read from the page by code                                     |
| `payment/messages.ts`    | Every traveller-facing text of the payment step, as templates                         |
| `payment/types.ts`       | `PaymentStatus`, `PaymentResult`, `Signal`, `Terms`                                    |
| `tools/chat.ts`          | `say`, `show_card`, `ask_traveller`, `wait_for_reply`, with timeouts                |
| `tools/scoring.ts`       | `set_goal`, `set_objective`, `add_candidate`, `score_candidates`                    |
| `tools/time.ts`          | `check_time` against a search budget and an optional hard deadline                  |
| `scoring/objective.ts`   | Deterministic additive scoring over Store candidates, hard-constraint failures as rejections |
| `agents/orchestrator.ts` | Talks to the traveller, owns the goal, delegates via `run_objective`, `run_search`, `run_validation` |
| `agents/objective.ts`    | One call: goal to weights, hard constraints, threshold                              |
| `agents/search.ts`       | Drives the hotel site, records candidates, scores them                              |
| `agents/validation.ts`   | Re-verifies one candidate on the live page, stops before anything that books       |
| `check.ts`               | Smoke test: `npm run agent:check`                                                   |
| `*.test.ts`              | Unit tests: `npm test`                                                              |

## Running

```bash
cp .env.example .env     # then put your key in it
npm run agent:check      # deterministic scoring test, then two tiny API calls
```

To use it in the chat, change the import in `starter/chat/server.ts` from
`../agent.ts` to `../agent/index.ts` and the export name from `agent` to
`bookingAgent`.

## Model choice

The reasoning (which model for which role, cost per booking, what to measure)
is in `../../../agent/MODELS.md`. This section only says how the code behaves.

Every role defaults to `claude-opus-5-5` with effort `medium` (orchestrator,
search) or `low` (objective, validation). Override per role with
`MODEL_<ROLE>` and `EFFORT_<ROLE>`. Moving a role to a cheaper model is a
measured decision for the design document: run the same requests with, say,
`MODEL_SEARCH=claude-sonnet-5-5` and compare the run logs.

`capabilities()` in `config.ts` decides what each request may carry, so an
override cannot break the call:

| Model               | `effort` sent | Refusal fallback sent | Smallest cacheable prefix |
| ------------------- | ------------- | --------------------- | ------------------------- |
| `claude-opus-5-5`   | yes           | yes                   | 512 tokens                |
| `claude-sonnet-5-5` | yes           | yes                   | 512 tokens                |
| `claude-haiku-4-5`  | no (rejected) | no                    | 4096 tokens               |

## Caching

Each tool-loop request has two cache breakpoints: an explicit one on the
system prompt and the automatic one on the tail of the history. A search run
re-sends its whole history every turn, so the second one is where the saving
is. `llm.turn` and `llm.done` events carry `cache_read_input_tokens` and
`cache_creation_input_tokens`; if reads stay at zero across turns, something
in the prefix is changing. On Haiku 4.5 the system prompt alone is below the
cacheable minimum, so caching only starts once the history has grown.

## What is not here yet

- The payment hand-off (blind mode exists in `tools/boundary.ts`, the flow does not).
- Mid-run goal updates from the traveller (the chat server delivers them only
  through `wait_for_reply`).
- Any test against the mock beyond `check.ts`.
