# Model choice per agent role

Answers question 1 in `halcy_case_material/BRIEF.md`: which models do which
jobs, why, what it costs per booking, what happens when a model is wrong, and
what we measure to know the choice was right. Written 2026-10-06.

**Status.** Decided: every role runs `claude-opus-5-5`, with per-role
overrides from the environment (`README.md`, Decisions). Measured: the three
example asks on the mock hotel, once with every role on Opus 5.5 and once
with Sonnet 5.5 on the search role, same code, scripted traveller (section
5). Not measured: repeats, Haiku, any hotel other than the mock. One run per
cell is an observation, not a measurement.

## 1. What runs today

From `halcy_case_material/starter/agent/config.ts`:

| Role         | Model             | Effort | Max turns | Shape of the job                          |
| ------------ | ----------------- | ------ | --------- | ----------------------------------------- |
| Orchestrator | `claude-opus-5-5` | medium | 60        | Talks to the traveller, owns the goal     |
| Objective    | `claude-opus-5-5` | low    | 10        | One call: goal to weights and constraints |
| Search       | `claude-opus-5-5` | medium | 80        | Drives an unseen hotel site in a browser  |
| Validation   | `claude-opus-5-5` | low    | 30        | Re-checks one candidate on the live page  |

Scoring is deterministic code, not a model (`scoring/objective.ts`). The
payment hand-off is a controlled sequence, not an agent (`ARCHITECTURE.md`
2.7).

Switching a role needs no code change:

```bash
MODEL_SEARCH=claude-sonnet-5-5
EFFORT_SEARCH=medium
```

`capabilities()` in `config.ts` (PR #5) keeps an override from breaking the
request: Haiku 4.5 rejects the `effort` parameter and does not take the
refusal fallback, so neither is sent to it.

## 2. The principle

**A heavy model where an error is expensive and the volume is low. A cheap
model where the volume is high and an error is caught downstream.**

Sizing by "how hard does the job sound" gives the wrong answer here. The
search role is both the largest and the hardest, and it is still the only
place a cheaper model belongs, because validation checks its result on the
live page before the traveller sees anything.

## 3. Role by role

| Role         | Share of tokens | Cost of an error                                   | Who catches it                              | Proposal                          |
| ------------ | --------------- | -------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| Orchestrator | Low             | High: wrong words to the traveller, wrong approval | Nobody after it; the traveller reads it     | Keep Opus 5.5                     |
| Objective    | Very low        | High: a need ("must cancel") scored as a wish      | Validation, late; a whole search is wasted  | Keep Opus 5.5 at low effort       |
| Search       | About 40% of cost | Medium: wrong room, add-on left ticked, extra turns | Validation, on the live page              | Sonnet 5.5 held up; see 5 and 6   |
| Validation   | About 25%, more on retries | High: it reads the price the traveller approves | The approval card, only if the traveller notices | Keep Opus 5.5; measure next |

Notes:

- **Search is not web search.** It drives a booking site it has never seen:
  a cookie banner over the page, a calendar with read-only fields, an upsell
  modal, pre-ticked add-ons (`payment/TRAPS.md` traps 7, 8, 14, 15, 16). A
  model that is cheap per token but needs twice the turns is not cheaper.
- **Validation differs from `ARCHITECTURE.md` 2.3**, which suggests a small
  fast model. It reads the price and terms the traveller approves, so an
  error is expensive, and measured it costs about as much as search. A
  cheaper model here is the next thing to measure, not a default.
- **Objective** is a single short call; a cheaper model saves a cent.

## 4. Candidates and prices

Anthropic list prices per million tokens, from the price list cached
2026-09-25:

| Model               | Input | Output |
| ------------------- | ----- | ------ |
| `claude-opus-5-5`   | $4    | $20    |
| `claude-sonnet-5-5` | $2    | $10    |
| `claude-haiku-4-5`  | $1    | $5     |

**A second provider (for example a Gemini Flash-class model for search).**
Allowed by the brief and a fair candidate. Not in the prototype: the tool
loop is built on Anthropic's tool runner (`llm/client.ts`), so it needs its
own loop, a second key and a new dependency with a written reason. Its price
is not quoted here because it has not been verified.

## 5. Cost per booking, measured

Both groups on commit `6f5dd69`, run with `npm run scenarios -- 01 02 03`,
so no human delay is in the wall time. Costs recomputed from each run's
`llm.done` events. Per million tokens: Opus 5.5 $4 in, $20 out, $0.20 cache
read, $5 cache write; Sonnet 5.5 $2, $10, $0.20, $2.50.

| Ask | Every role on Opus 5.5 | Sonnet 5.5 on search | Search role alone |
| --- | ---------------------- | -------------------- | ----------------- |
| 1   | $0.309, 27 turns, 116 s | $0.224, 25 turns, 85 s  | $0.124 to $0.058 |
| 2   | $0.474, 44 turns, 181 s | $0.409, 46 turns, 176 s | $0.172 to $0.087 |
| 3   | $0.511, 43 turns, 158 s | $0.274, 33 turns, 125 s | $0.130 to $0.083 |

Reports: `runs/scenarios/2026-10-06T05-07-16-021Z` and `...T05-14-58-249Z`.


- **Sonnet 5.5 did the search job as well as Opus 5.5 here.** In all three
  asks it recorded the same candidates with the hotel's exact prices, and
  every run reached the approval card. The search role cost 36% to 53% less.
- **The whole booking gets $0.07 to $0.09 cheaper** on asks 1 and 2. Search
  is about 40% of an Opus booking (ask 1: search $0.124, orchestrator $0.079,
  validation $0.073, objective $0.033), so halving it moves the total by 14% to 27%.
- **Ask 3 on Opus is not a fair figure.** The orchestrator started two
  validations in one turn and both drove the same page: seven failed actions,
  three validation calls for $0.261, and a wrong report that the Flexible rate
  could not be booked. The traveller ended on the non-refundable rate. That
  is a fault in the harness, not in the search model; fixed in PR #16. The
  $0.24 gap between the two columns on ask 3 is mostly this accident.
- **Validation is as large as search and less predictable.** Ask 2 runs
  objective, search and validation twice, because the traveller's breakfast
  answer triggers a re-check; that is why it is the dearest ask in both
  columns.
- **Output tokens and turns still dominate**: caching carries the input.

Earlier figures in this file are superseded. A first estimate of about $2.2
per booking was seven times too high (it assumed 25 search turns, 400k
uncached input tokens and no caching); kept as a line because the debrief
asks what the tools got wrong. Single runs on older code cost $0.31 to $0.43.

## 6. What we measure

| Metric                              | Why                                              |
| ----------------------------------- | ------------------------------------------------ |
| Bookings that reach the approval card | The only outcome that counts                   |
| Right room and rate for the request | Checked per case in `starter/agent/scenarios`    |
| Validation rejections and failed actions | How often search or validation went wrong   |
| Turns and wall-clock time per booking | The hold is 15 minutes; slow is a failure mode |
| Cost per completed booking          | Not per request: retries and extra turns count   |
| Same on a hotel site not seen before | The debrief runs one                            |

Decision rule: move search to the cheapest model whose completion rate on the
example asks matches Opus 5.5 and whose validation rejections do not rise.
The bar is "no worse", not "nearly as good": about $0.08 per booking is at
stake, and one failed booking outweighs many of those.

| Search model        | Reached approval | Right room | Validation rejections | Failed actions |
| ------------------- | ---------------- | ---------- | --------------------- | -------------- |
| `claude-opus-5-5`   | 3 of 3           | 3 of 3     | 1 (ask 3, the accident) | 0, 0, 7      |
| `claude-sonnet-5-5` | 3 of 3           | 3 of 3     | 0                     | 0, 0, 1        |
| `claude-haiku-4-5`  | not run          | not run    | not run               | not run        |

**Where that leaves the decision.** On this sample Sonnet 5.5 meets the rule.
The default in `config.ts` is unchanged, because three runs on one hotel do
not show "no worse": the next steps are to repeat each cell, re-run ask 3 on
Opus after PR #16, and run both on a second hotel. Switching for the debrief
is one line in `.env` (`MODEL_SEARCH=claude-sonnet-5-5`).

A caution about "right room" on ask 3: the request names no rate. The Opus
run ended on the non-refundable rate after the scripted traveller asked for
Flexible, was told it could not be booked, and pressed the first button it
was offered. The case passed because it did not check the rate. The scenario
and the scripted traveller are being tightened so that this fails.

## 7. When a model is wrong

| Role         | Typical error                              | How it is detected                                         | What the traveller sees                         |
| ------------ | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Objective    | A hard need scored as a soft preference    | Validation checks the candidate against the goal           | A delay, if validation catches it; untested     |
| Search       | Wrong room, add-on left ticked, wrong dates | Validation re-reads room, rate, dates and price on the live page | Nothing; the candidate is rejected and re-searched |
| Validation   | Misreads an amount or the terms            | Planned: approval figures come from the payment page (`payment/TRAPS.md` trap 5); hand-off not built yet | The hotel's own figures before they approve |
| Orchestrator | Says more than the page supports           | Every chat message and approval is in the run log          | The message itself; approval needs a button press |
| Any          | The model declines the request             | `stop_reason: "refusal"`; server-side fallback where supported, otherwise the run stops | "Something went wrong on my side", nothing booked |

Seen in the first runs, all on Opus 5.5:

- Validation rejected a correct candidate once: it read the tourist tax on
  the payment page as a price mismatch. The orchestrator still showed the
  right breakdown and the traveller approved. Prompt changed in PR #9.
- Search tried to `fill` read-only date fields twice per run, five seconds
  lost each time, then used the calendar. Observation now marks read-only
  fields (PR #9).
- The orchestrator started two validations at once on the one shared page
  (ask 3, Opus). They interfered, one wrongly reported the Flexible rate as
  unbookable, and the traveller was told so. Delegated browser agents are
  queued and an acceptance is overruled when the page is on another rate
  (PR #16).

Proposed and not built: after validation extracts an amount, check in code
that the same figure appears verbatim in the page text, so a misread price
cannot reach the approval card.

No model ever sees card details. That is enforced outside the models, by
`tools/boundary.ts` and `evidence/log.ts`, and does not depend on which model
is chosen.

## 8. Open

- Repeat each cell; re-run ask 3 on Opus after PR #16.
- Run both configurations on a hotel site other than the mock.
- Haiku 4.5 on search: not run.
- Effort per role is the larger lever (output tokens are half the cost) and
  has not been swept.
- A second provider for search: named as a candidate, not built.
