# Model choice per agent role

Answers question 1 in `halcy_case_material/BRIEF.md`: which models do which
jobs, why, what it costs per booking, what happens when a model is wrong, and
what we measure to know the choice was right. Written 2026-10-06.

**Status.** Decided: every role runs `claude-opus-5-5` today, with per-role
overrides from the environment (`README.md`, Decisions). Proposed, not yet
decided: move the search role to a cheaper model once it is measured. Nothing
here has been run against the live API yet; there is no key in the
environment. Every cost figure below is an estimate until section 6 is filled
in from run logs.

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
search role is both the most expensive and the hardest, and it is still the
right place for the cheaper model, because validation checks its result on
the live page before the traveller sees anything.

## 3. Role by role

| Role         | Share of tokens | Cost of an error                                   | Who catches it                              | Proposal                          |
| ------------ | --------------- | -------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| Orchestrator | Low             | High: wrong words to the traveller, wrong approval | Nobody after it; the traveller reads it     | Keep Opus 5.5                     |
| Objective    | Very low        | High: a need ("must cancel") scored as a wish      | Validation, late; a whole search is wasted  | Keep Opus 5.5 at low effort       |
| Search       | Most of the run | Medium: wrong room, add-on left ticked, extra turns | Validation, on the live page                | Sonnet 5.5 first, then Haiku 4.5  |
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

## 5. Cost per booking, estimated

Assumptions, to be replaced by measured numbers: a search run of about 25
turns with an average context of about 15k tokens, so about 400k input and
10k output tokens. The other three roles together about 60k input and 6k
output on Opus 5.5. No caching counted.

| Search model        | Search  | Other roles | Per booking |
| ------------------- | ------- | ----------- | ----------- |
| `claude-opus-5-5`   | ~$1.80  | ~$0.36      | ~$2.2       |
| `claude-sonnet-5-5` | ~$0.90  | ~$0.36      | ~$1.3       |
| `claude-haiku-4-5`  | ~$0.45  | ~$0.36      | ~$0.8       |

Two things move these more than the model does:

- **Caching the tool-loop history** (PR #5). The search run re-sends its
  whole history every turn; cached reads are billed at a fraction of the
  input price. On Haiku 4.5 caching starts later, because its smallest
  cacheable prefix is 4096 tokens.
- **Turns per booking.** Fewer, better-aimed actions beat a lower price per
  token.

The brief reimburses the agent's API spend up to $50. At the all-Opus
estimate that is about 20 full runs, which is enough for the measurement in
section 6 but not for careless reruns.

## 6. What we measure

Run the example asks in `starter/examples.json` with the search role on each
candidate, several runs each, everything else unchanged. Every number comes
from the run log (`llm.turn`, `llm.done`, `act`, `observe`):

| Metric                              | Why                                              |
| ----------------------------------- | ------------------------------------------------ |
| Bookings that reach the approval card | The only outcome that counts                   |
| Validation rejections per booking   | How often search got the room, rate or price wrong |
| Turns and wall-clock time per booking | The hold is 15 minutes; slow is a failure mode |
| Cost per completed booking          | Not per request: retries and extra turns count   |
| Same on a hotel site not seen before | The debrief runs one                            |

Decision rule: take the cheapest search model whose completion rate on the
example asks matches Opus 5.5, and whose validation rejections do not rise.

| Search model        | Completed | Rejections | Turns | Cost per booking |
| ------------------- | --------- | ---------- | ----- | ---------------- |
| `claude-opus-5-5`   | not run   | not run    | not run | not run        |
| `claude-sonnet-5-5` | not run   | not run    | not run | not run        |
| `claude-haiku-4-5`  | not run   | not run    | not run | not run        |

## 7. When a model is wrong

| Role         | Typical error                              | How it is detected                                         | What the traveller sees                         |
| ------------ | ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Objective    | A hard need scored as a soft preference    | Validation checks the candidate against the goal           | A delay, if validation catches it; untested     |
| Search       | Wrong room, add-on left ticked, wrong dates | Validation re-reads room, rate, dates and price on the live page | Nothing; the candidate is rejected and re-searched |
| Validation   | Misreads an amount or the terms            | Planned: approval figures come from the payment page (`payment/TRAPS.md` trap 5); hand-off not built yet | The hotel's own figures before they approve |
| Orchestrator | Says more than the page supports           | Every chat message and approval is in the run log          | The message itself; approval needs a button press |
| Any          | The model declines the request             | `stop_reason: "refusal"`; server-side fallback where supported, otherwise the run stops | "Something went wrong on my side", nothing booked |

Proposed and not built: after validation extracts an amount, check in code
that the same figure appears verbatim in the page text, so a misread price
cannot reach the approval card.

No model ever sees card details. That is enforced outside the models, by
`tools/boundary.ts` and `evidence/log.ts`, and does not depend on which model
is chosen.

## 8. Open

- Search on Sonnet 5.5 or Haiku 4.5: pending section 6.
- A second provider for search: named as a candidate, not built.
- Validation on a smaller model: pending section 6.
- Effort levels per role are first guesses and belong in the same sweep.
- Everything in `llm/` is unverified against the live API.
