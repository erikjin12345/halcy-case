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
| `tools/browser.ts`       | `observe`, `act`, `goto`, `screenshot` as tools, boundary-checked, iframes masked   |
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

Every role defaults to `claude-opus-5-5` with effort `medium` (orchestrator,
search) or `low` (objective, validation). Override per role with
`MODEL_<ROLE>` and `EFFORT_<ROLE>`. Moving a role to a cheaper model is a
measured decision for the design document: run the same requests with
`MODEL_VALIDATION=claude-haiku-4-5` and compare the run logs.

## What is not here yet

- The payment hand-off (blind mode exists in `tools/boundary.ts`, the flow does not).
- Mid-run goal updates from the traveller (the chat server delivers them only
  through `wait_for_reply`).
- Any test against the mock beyond `check.ts`.
