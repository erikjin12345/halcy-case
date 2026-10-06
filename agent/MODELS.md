# Model choice per agent role

Answers question 1 in `halcy_case_material/BRIEF.md`: which models do which
jobs, why, what it costs per booking, what happens when a model is wrong, and
what we measure to know the choice was right. Written 2026-10-06.

**Status.** Decided: every role runs `claude-opus-5-5`, with per-role
overrides from the environment (`README.md`, Decisions). Measured: one
completed booking on the mock hotel, all roles on Opus 5.5, cost $0.33
(section 5). Not measured: any other model, any other ask, any other hotel.
One run per configuration is an observation, not a measurement.

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
| Search       | Largest, 41% of cost | Medium: wrong room, add-on left ticked, extra turns | Validation, on the live page           | Candidate for Sonnet 5.5; see 5   |
| Validation   | Low             | High: it reads the price the traveller approves    | The approval card, only if the traveller notices | Keep Opus 5.5 at low effort  |

Notes:

- **Search is not web search.** It drives a booking site it has never seen:
  a cookie banner over the page, a calendar with read-only fields, an upsell
  modal, pre-ticked add-ons (`payment/TRAPS.md` traps 7, 8, 14, 15, 16). A
  model that is cheap per token but needs twice the turns is not cheaper.
- **Validation differs from `ARCHITECTURE.md` 2.3**, which suggests a small
  fast model. Comparing two records should be code. Reading the price and the
  terms off the page is the step that can surprise the traveller, and its
  volume is small, so the saving from a smaller model is small too. Revisit
  after measurement.
- **Objective** is a single short call. A cheaper model saves a fraction of a
  cent per booking.

## 4. Candidates and prices

Anthropic list prices per million tokens, from the price list cached
2026-09-25:

| Model               | Input | Output |
| ------------------- | ----- | ------ |
| `claude-opus-5-5`   | $4    | $20    |
| `claude-sonnet-5-5` | $2    | $10    |
| `claude-haiku-4-5`  | $1    | $5     |

**A second provider (for example a Gemini Flash-class model for search).**
The brief allows several providers and it is a fair candidate. It is not in
the prototype because the tool loop is built on Anthropic's tool runner
(`llm/client.ts`). A second provider needs its own tool loop, a second key and
a new runtime dependency with a written reason (`CLAUDE.md`). Its price is not
quoted here because it has not been verified. The starter's `Model` seam
(`starter/model.ts`) is single-shot, so it does not cover the tool loop.

## 5. Cost per booking, measured

One completed booking: example ask 1 on the mock hotel, every role on
`claude-opus-5-5`, run log `runs/2026-10-06T04-39-53-161Z-booking`. Recomputed
from its `llm.done` events at $4 input, $20 output, $0.20 cache read and $5
cache write per million tokens.

| Role         | Turns | Output | Cache read | Cache write | Cost   | Share |
| ------------ | ----- | ------ | ---------- | ----------- | ------ | ----- |
| Search       | 11    | 2,904  | 64,841     | 12,667      | $0.134 | 41%   |
| Orchestrator | 9     | 2,492  | 44,865     | 4,418       | $0.081 | 25%   |
| Validation   | 6     | 1,729  | 23,370     | 7,466       | $0.077 | 24%   |
| Objective    | 2     | 1,005  | 1,963      | 2,654       | $0.034 | 10%   |
| **Total**    | 28    | 8,130  | 135,039    | 27,205      | $0.326 |       |

Uncached input was 64 tokens in total. Wall clock 155 seconds, including the
traveller's button presses.

What the run shows:

- **Output tokens are half the bill** ($0.16), cache writes most of the rest
  ($0.14), cache reads $0.03. The levers are effort and turns, in that order,
  before model choice.
- **Caching carries the input cost.** 135k of 162k input tokens were cache
  reads.
- **Turns matter more than price per token.** The run before this one
  (`runs/2026-10-06T04-35-53-692Z-booking`) cost $0.41 with 21 search turns;
  serialising the browser tools so the model could batch brought search to 11
  turns and cut its cost by a third, with the model unchanged.
- **A cheaper search model saves little here.** Search is $0.13 of $0.33. At
  Sonnet 5.5 prices with the same turns that is about $0.07 saved per booking;
  moving search to a free model would save $0.13. Derived, not run.

**The estimate this replaces was wrong by a factor of seven.** The first
version of this file put an all-Opus booking at about $2.2, assuming 25
search turns, 400k uncached input tokens and no caching. The real run used 11
search turns and almost no uncached input. Kept here because the debrief asks
what the tools got wrong.

The brief reimburses up to $50 of API spend. At $0.33 a run that is about 150
runs, so the sweep in section 6 is affordable.

## 6. What we measure

Run each example ask in `starter/examples.json` with the search role on each
candidate, everything else unchanged. Every number comes from the run log
(`llm.turn`, `llm.done`, `act`, `observe`):

| Metric                              | Why                                              |
| ----------------------------------- | ------------------------------------------------ |
| Bookings that reach the approval card | The only outcome that counts                   |
| Validation rejections per booking   | How often search got the room, rate or price wrong |
| Turns and wall-clock time per booking | The hold is 15 minutes; slow is a failure mode |
| Cost per completed booking          | Not per request: retries and extra turns count   |
| Same on a hotel site not seen before | The debrief runs one                            |

Decision rule: move search to the cheapest model whose completion rate on the
example asks matches Opus 5.5 and whose validation rejections do not rise.
With at most $0.13 per booking at stake, a single extra failed booking in the
sweep outweighs the saving, so the bar is "no worse", not "nearly as good".

Results so far, ask 1 only, one run each:

| Search model        | Completed | Rejections | Turns (search) | Wall  | Cost   |
| ------------------- | --------- | ---------- | -------------- | ----- | ------ |
| `claude-opus-5-5`   | 1 of 1    | 1, false   | 28 (11)        | 155 s | $0.326 |
| `claude-sonnet-5-5` | not run   | not run    | not run        | not run | not run |
| `claude-haiku-4-5`  | not run   | not run    | not run        | not run | not run |

The Opus row predates two fixes in PR #9 (validation prompt, read-only date
fields) and has to be re-run after it merges before it is a baseline.

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

Proposed and not built: after validation extracts an amount, check in code
that the same figure appears verbatim in the page text, so a misread price
cannot reach the approval card.

No model ever sees card details. That is enforced outside the models, by
`tools/boundary.ts` and `evidence/log.ts`, and does not depend on which model
is chosen.

## 8. Open

- Re-run the Opus baseline after PR #9, on all three example asks.
- Search on Sonnet 5.5 and Haiku 4.5: not run. The cost case is weaker than
  first estimated; the open question is whether quality holds, not how much
  is saved.
- Effort per role is the larger lever (output tokens are half the cost) and
  has not been swept.
- A second provider for search: named as a candidate, not built.
- Nothing has been run on a hotel site other than the mock.
