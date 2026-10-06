# Model choice per agent role

Answers question 1 in `halcy_case_material/BRIEF.md`: which models do which
jobs, why, what it costs per booking, what happens when a model is wrong, and
what we measure to know the choice was right. Written 2026-10-06.

**Status.** Decided 2026-10-06 by the user: search runs `claude-sonnet-5-5`;
orchestrator, objective and validation run `claude-opus-5-5`; per-role
overrides from the environment (`README.md`, Decisions). Measured: the three
example asks on the mock hotel, once with every role on Opus 5.5 and twice
with Sonnet 5.5 on the search role, scripted traveller (section 5). Not
measured: an Opus repeat, Haiku, any hotel other than the mock. One or two
runs per cell is an observation, not a measurement.

## 1. What runs today

From `halcy_case_material/starter/agent/config.ts`:

| Role         | Model               | Effort | Max turns | Shape of the job                          |
| ------------ | ------------------- | ------ | --------- | ----------------------------------------- |
| Orchestrator | `claude-opus-5-5`   | medium | 60        | Talks to the traveller, owns the goal     |
| Objective    | `claude-opus-5-5`   | low    | 10        | One call: goal to weights and constraints |
| Search       | `claude-sonnet-5-5` | medium | 80        | Drives an unseen hotel site in a browser  |
| Validation   | `claude-opus-5-5`   | low    | 30        | Re-checks one candidate on the live page  |

Scoring is deterministic code, not a model (`scoring/objective.ts`). The
payment hand-off is a controlled sequence, not an agent (`ARCHITECTURE.md`
2.7).

Switching a role needs no code change: `MODEL_SEARCH=claude-opus-5-5` in
`.env` puts search back on Opus.

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

| Role         | Share of cost | Cost of an error                                   | Who catches it                              | Model                          |
| ------------ | ------------- | -------------------------------------------------- | ------------------------------------------- | ------------------------------ |
| Orchestrator | About 25%     | High: wrong words to the traveller, wrong approval | Nobody after it; the traveller reads it     | Opus 5.5                       |
| Objective    | About 10%     | High: a need ("must cancel") scored as a wish      | Validation, late; a whole search is wasted  | Opus 5.5 at low effort         |
| Search       | About 40%     | Medium: wrong room, add-on left ticked, extra turns | Validation, on the live page               | Sonnet 5.5, decided 2026-10-06 |
| Validation   | About 25%, more on retries | High: it reads the price the traveller approves | The approval card, only if the traveller notices | Opus 5.5; measure next |

Shares are from ask 1 with every role on Opus 5.5. With Sonnet 5.5 on search,
search is about a quarter of the booking.

Notes:

- **Search is not web search.** It drives a booking site it has never seen:
  a cookie banner over the page, a calendar with read-only fields, an upsell
  modal, pre-ticked add-ons (`payment/TRAPS.md` traps 7, 8, 14, 15, 16). A
  model that is cheap per token but needs twice the turns is not cheaper.
- **Validation differs from `ARCHITECTURE.md` 2.3**, which suggests a small
  fast model. It reads the price and terms the traveller approves, and
  measured it costs as much as search. A cheaper model is the next to measure.
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

Both groups run with `npm run scenarios -- 01 02 03` on commit `6f5dd69`,
except ask 3 on Opus, re-run on `c9dc33b` (see below). No human delay is in
the wall time. Costs recomputed from each run's
`llm.done` events. Per million tokens: Opus 5.5 $4 in, $20 out, $0.20 cache
read, $5 cache write; Sonnet 5.5 $2, $10, $0.20, $2.50.

| Ask | Every role on Opus 5.5 | Sonnet 5.5 on search, two runs | Search role: Opus to Sonnet |
| --- | ---------------------- | ------------------------------ | --------------------------- |
| 1   | $0.309, 116 s | $0.224 and $0.268, 85 and 96 s   | $0.124 to $0.058, $0.060 |
| 2   | $0.474, 181 s | $0.409 and $0.380, 176 and 166 s | $0.172 to $0.087, $0.084 |
| 3   | $0.396, 123 s | $0.274 and $0.279, 125 and 108 s | $0.162 to $0.083, $0.069 |

Reports under `runs/scenarios/`: `...T05-07-16-021Z`, `...T05-14-58-249Z` and,
for the second Sonnet run on `85cb8dd` plus PR #23, `...T07-10-23-704Z`.

- **Sonnet 5.5 did the search job as well as Opus 5.5 here.** All six runs
  reached the approval card with the right room and rate, and in the first
  three the recorded candidates and prices were checked against the hotel's
  and matched. The search role cost about half.
- **The whole booking gets $0.04 to $0.12 cheaper**, 13% to 31%. Two Sonnet
  runs of the same ask differ by 2% to 20%, so the low end of that saving is
  within run-to-run noise; the direction is the same in all six.
- **Ask 3 on Opus was run twice.** On `6f5dd69` the orchestrator started two
  validations in one turn and both drove the same page: seven failed actions,
  $0.511, a wrong report that the Flexible rate could not be booked, and the
  traveller ended on the non-refundable rate. That was a fault in the harness,
  not in a model (fixed in PR #16). The figure above is the re-run after the
  fix; the two commits do not differ in the search role.
- **Validation is as large as search and less predictable.** Ask 2 runs
  objective, search and validation twice, because the traveller's breakfast
  answer triggers a re-check; that is why it is the dearest ask in both
  columns.
- **Output tokens and turns still dominate**: caching carries the input.

A first estimate of about $2.2 per booking was seven times too high (25
search turns, 400k uncached input tokens, no caching assumed). Kept as a line
because the debrief asks what the tools got wrong.

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
The bar is "no worse", not "nearly as good": about $0.10 per booking is at
stake, and one failed booking outweighs many of those.

| Search model        | Reached approval | Right room | Validation rejections | Failed actions |
| ------------------- | ---------------- | ---------- | --------------------- | -------------- |
| `claude-opus-5-5`   | 3 of 3           | 3 of 3     | 0                     | 0, 0, 0        |
| `claude-sonnet-5-5` | 6 of 6           | 6 of 6     | 0                     | 0, 0, 1; 0, 1, 1 |
| `claude-haiku-4-5`  | not run          | not run    | not run               | not run        |

Graded by `starter/agent/scenarios`; ask 3 on Opus is the re-run. The first
run of that cell fails the grader (wrong rate, two agents on one page).

**Where that leaves the decision.** On this sample Sonnet 5.5 meets the rule,
and the user decided on it: the default for search in `config.ts` is now
`claude-sonnet-5-5`. The evidence is one Opus and two Sonnet runs per ask on one hotel,
which does not show "no worse". What would change the decision back: a
repeat of the six cells in which Sonnet misses a candidate, misreads a price
or fails to reach the card, or a second hotel on which it gets stuck where
Opus does not. Going back is one line in `.env`
(`MODEL_SEARCH=claude-opus-5-5`).

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

- Repeat the Opus runs: one per ask is all there is.
- Run both configurations on a hotel site other than the mock.
- Haiku 4.5 on search: not run.
- Effort per role is the larger lever (output tokens are half the cost) and
  has not been swept.
- A second provider for search: named as a candidate, not built.
