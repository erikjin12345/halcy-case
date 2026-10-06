# Agent architecture (initial design)

Initial design given by the developer on 2026-10-06. Section 1 records the
design as stated. Section 2 is Claude's assessment against the case brief and
the mock hotel; it is input to a decision, not a change to the design.

---

## 1. The design as stated

Four AI agents. The payment hand-off (`payment/README.md`, `payment/TRAPS.md`) sits
after them and is not one of the four.

```
traveller <-> chat <-> ORCHESTRATOR
                           |  structured goal          ^ results, questions
                           v                           |
                     WEB SEARCH  <--- candidates ---> OBJECTIVE FUNCTION
                           |         + scores             (scoring, threshold)
                           v
                      VALIDATION  ---- accepted list ---> ORCHESTRATOR -> traveller
                                                               |
                                                               v
                                                     payment hand-off module
```

### 1.1 Orchestrator agent

- Owns all communication with the traveller through the chat, and all
  communication with the other three agents.
- Turns what the traveller writes into a structured format for the others
  (party size, dates, budget, must-haves, nice-to-haves).
- Relays the other agents' responses back to the traveller in plain language.
- Continuously updates what the other agents should do as the traveller
  writes more. A new message can tighten or loosen the goal mid-search.
- When the search ends without a good enough result, formulates that for the
  traveller so they can change the requirements.

### 1.2 Web search agent

- Receives a clear search goal from the orchestrator: number of people, dates,
  budget, and similar.
- Tries to find hotel rooms that meet the goal. Two parallel routes:
  1. Middle providers such as Booking.com and their API.
  2. Web scrape or search based on the requirements, then enter hotel
     websites and traverse them.
- Sends rooms and their metadata to the objective function agent.
- Also talks to the orchestrator (progress, questions, "nothing found").

### 1.3 Objective function agent

- Based on how the traveller phrased the request, creates or adjusts the
  parameters of an objective function that scores the rooms the search agent
  finds.
- Example: an additive model with terms for price, distance to public
  transport, proximity to shops, breakfast included, and so on.
- Open question from the developer: a deterministic scoring system versus an
  LLM giving the score from a system prompt. To be investigated.
- Has a **passing threshold**. If rooms above the threshold are found the
  search can stop, or continue for a fixed extra time to look for better.
- Has a **maximum search time**. If nothing reaches the threshold in time,
  the agent tells the orchestrator, which asks the traveller.
- The traveller can then update the requirements, which updates both the
  score parameters and the search space, and the two agents search on.
- The search and objective function agents interact with each other directly.

### 1.4 Validation agent

- Receives the candidate list that search and scoring believe is suitable.
- Verifies that each candidate really meets the requirements:
  - room count and dates are right
  - the price has not changed when proceeding towards payment
  - no upsell was accepted along the way
- Rejects candidates that no longer meet the requirements.
- Passes accepted candidates to the orchestrator, which shows them to the
  traveller. The traveller then chooses whether to proceed to payment.

---

## 2. Assessment against the brief and the mock

Claude's notes. Each point names the constraint it comes from.

### 2.1 The hotel is given, so "search" is inside one site

`BRIEF.md` says "One hotel booking only", the example asks all name the hotel,
and `hotels.json` maps hotel name to booking-site address. At the debrief they
add a hotel the agent has not seen, but still by name and address.

Effect: for the prototype, the web search agent's job is not to find hotels
but to find **rooms and rates inside one hotel's site**: dates, party size,
room types, rate types, add-ons. That is still a real search (three rooms times
two rates times breakfast on/off in the mock) and the objective function still
applies to it. The cross-hotel route (Booking.com, scraping) is the product
vision and belongs in the design document as "what comes next", not in the
8-hour build.

### 2.2 Middle providers would change who the seller is

The brief: "Halcy is not the seller: the traveller books directly with the
hotel, their contract is with the hotel." Using Booking.com for **metadata
only** keeps that true. Using it as the **booking channel** does not: the
contract would be with Booking.com's terms and the money would flow through
them. Worth one clear sentence in the design document: middle providers may
feed the search, never the checkout.

Also: "No real hotels in your prototype" and "don't automate bookings on
them". So no Booking.com calls at all in the prototype.

### 2.3 Four LLM agents is the answer to question 1, if the roles differ

Question 1 asks which models do which jobs and why. This architecture gives a
natural answer, provided each agent gets a model sized for its job:

| Agent              | Job shape                                      | Suggested model class                     |
| ------------------ | ---------------------------------------------- | ----------------------------------------- |
| Orchestrator       | Conversation, intent, summarising for a person | Strong general model, low volume per run  |
| Web search         | Drive a browser, read pages, pick next action  | Model that is good at structured output; vision optional |
| Objective function | Set weights from text, then score              | **Deterministic code** for scoring, small model only to extract weights |
| Validation         | Compare two structured records, strict         | Small fast model, or pure code where possible |

On the developer's open question (deterministic versus LLM scoring):
recommend deterministic. The scores must be explainable at the debrief
("why did it pick superior over classic?"), repeatable across runs, and cheap.
Let an LLM translate the traveller's words into weights once, then score in
code. An LLM-only score cannot be reproduced and makes the threshold
meaningless.

`docs/research/agent-search-architecture.md` gives the same answer with a
sharper reason: store **observations** (facts about a candidate, expensive to
collect) separately from **evaluations** (scores under one objective, cheap to
recompute). Then "the traveller updates the requirements" (1.3) becomes a
re-score over stored facts, not a new search. See 2.9.

### 2.4 Validation needs the same browser, and creates holds

`payment/TRAPS.md` trap 1: the booking only completes in the browser that started it.
`payment/TRAPS.md` traps 5 and 6: the real price (tourist tax, surge) only appears on
the payment page, which is reached by `POST /details`, which **creates a
15-minute hold** (trap 3).

Effects:

- The validation agent cannot open its own browser to check a candidate. It
  must drive the **same page** the search agent used, or the hand-off later
  fails with "Session not found".
- Validating a candidate "all the way to payment" creates a hold. Validating
  several candidates creates several holds. The mock does not decrement
  inventory, but a real hotel would, and some would block the second attempt.
  Recommend: validate **one** candidate at a time, the top-scored one, and only
  go to the payment page for the candidate the traveller is about to approve.
- The price shown to the traveller for approval must come from the payment
  page (trap 5). So the last validation step and the payment module's step 3
  are the same observation. Keep that as one code path.

### 2.5 "Continuously update the goal" collides with the chat server

`starter/chat/server.ts` runs one agent call at a time. A message sent while
the agent is running is delivered only when the agent calls `chat.reply()`;
otherwise it waits in `inbox`, and `inbox` is cleared when the run ends.

Effect: for the orchestrator to react mid-search, either the agent polls
`chat.reply()` between steps with a short timeout, or the chat server is
changed to push messages into a shared queue the orchestrator reads. The
second is cleaner and small. Decide before writing the orchestrator.

### 2.6 Thresholds and time limits need the hold clock

The maximum search time and "continue for a fixed time after passing the
threshold" are good. One addition: once any candidate has reached the details
page, the hold clock (15 minutes in the mock) is the real deadline, and it is
shorter than most search budgets would be. The objective function agent's
time limits should be expressed relative to the hold clock when one is
running.

### 2.7 Where the payment module sits

The design ends at "the traveller chooses to proceed to payment". The payment
module (`payment/README.md`) starts there. Its input is the validated candidate plus
the structured goal, so it can do the final comparison (`payment/TRAPS.md`
summary, step 3). It is not an LLM agent; it is a controlled sequence with one model
call to read the confirmation page.

### 2.9 Data model for re-scoring (from the research doc)

Adopt the three-table shape even in-process, as plain objects:

```
candidates    entity_id -> features, per-field observed_at, source page
evaluations   (entity_id, objective_hash) -> score, components, feasible
rejected      entity_id -> reason (hard constraint), so relaxing it re-admits
```

`objective_hash` is a hash of weights plus hard constraints. A changed goal
produces a new hash, so stale scores need no invalidation. In the mock the
volatile fields (price, availability) have a short life: the surge appears at
details, the hold expires in 15 minutes. So the validation agent is the
"re-verify volatile fields of the top-k before answering" step from the doc,
and it must run on the live page, not on stored facts.

### 2.8 Folder name

Done 2026-10-06: the folder is `agent/` with `payment/` as a subfolder.

---

## 3. Decisions needed before code

1. Prototype scope: search inside one hotel site only (2.1). Yes or no.
2. Scoring: deterministic with LLM-set weights (2.3). Yes or no.
3. Validation runs on the shared browser, one candidate at a time (2.4).
4. Chat server change for mid-run messages (2.5), or polling.
5. Model per agent (2.3 table), with cost per booking estimated.
