# Halcy agentic checkout: design

How Halcy turns a chat message into a hotel booking by driving the hotel's own
website, with the traveller paying the hotel directly. It answers the three
questions in `halcy_case_material/BRIEF.md`. Longer material is linked.

**State on 2026-10-06.** The prototype takes the three example asks on the
mock hotel to the approval card, repeatedly, and has completed one full
booking through payment, and the payment failure paths, with a script
standing in for the traveller. A second mock hotel has had its first runs. No
person has yet paid in the window, and nothing has run on a real hotel site.
What is and is not shown is listed in `limitations/`.

## 1. Architecture

One Node process holds the chat server, four model-driven roles, a scorer in
code, the payment hand-off and one Chromium browser. The mock hotel and its
payment provider run as a second local process on two origins.

```mermaid
flowchart LR
  T([Traveller]) <--> C[Chat]
  C <--> O["Orchestrator<br/>Opus 5.5"]
  O --> J["Objective<br/>Opus 5.5, one call"]
  O --> S["Search<br/>Sonnet 5.5"]
  O --> V["Validation<br/>Opus 5.5"]
  J --> K[("Scoring in code<br/>Store")]
  S --> K
  V --> K
  S --> D[Guarded driver]
  V --> D
  O -- approved --> H["Hand-off<br/>code, no model loop"]
  H --> D
  D --> B["Browser: hotel's site"]
  B -.- P["Payment provider's frame<br/>never read"]
```

Code is under `halcy_case_material/starter/agent/`. Scoring is code, not a
model, so a ranking can be explained and repeated. Every read and action goes
through a guarded driver: an origin allowlist, a blind mode, and no entry
into frames outside the hotel's site.

**One booking, step by step.**

1. The traveller writes in the chat. A card number typed by mistake is removed
   before anything reads the message.
2. The orchestrator resolves the dates, asks one question if something
   essential is missing, and records a structured goal.
3. The objective role sets weights and hard constraints. Search opens the
   hotel's site, clears the cookie banner, drives the date picker and guest
   counter, and records each room-and-rate combination. Code scores them.
4. The orchestrator validates one candidate: it selects it, declines the
   upsell, unticks add-ons the traveller did not ask for, fills the
   traveller's own details, and stops on the payment page. That page is the
   first to show tourist tax and the charged-now split, so its figures are
   the ones the traveller is shown.
5. The traveller sees one card and presses "Continue to payment" or not.
6. Code checks that the browser is on the candidate validated last, that the
   validation was accepted, that at least 5 minutes of the hotel's hold remain
   and that the agreed amounts are still on the page. Then it goes blind: no
   read, action or screenshot until the traveller is done.
7. The traveller types the card, ticks the hotel's conditions and confirms
   with their bank, in the hotel's page.
8. The wait ends when the tab is back on the hotel's site on another page, a
   chat button is pressed, the window closes or the deadline passes. A bank
   check that takes over the whole tab is not an outcome. Code then reads the
   hotel's page once, with card fields and the last four digits redacted, and
   decides a status.
9. The traveller gets a templated message: booked with a reference, declined
   in the hotel's words, or "I can't see a booking".

Production layout, not deployed: the same roles in a Cloud Run worker and the
hotel's site in a WebView inside the Halcy app, so the hotel session is the
phone's own (`infrastructure.md`, `../agent/WEBVIEW-PLAN.md`).

## 2. Question 1: model selection

**Rule: a heavy model where an error is expensive and the volume low; a
cheaper one where the volume is high and the error is caught downstream.**

| Role | Model | Why | When it is wrong |
| --- | --- | --- | --- |
| Orchestrator | Opus 5.5, medium effort | Its words go straight to the traveller; nobody checks them after | Approval needs a button press and is refused in code for a candidate that was not validated last and accepted; delegated browser agents are queued in code |
| Objective | Opus 5.5, low effort | A need scored as a wish wastes a search; it is one short call, so a cheaper model saves a fraction of a cent | Validation checks the candidate against the goal |
| Search | Sonnet 5.5, medium effort | The largest role, about 40% of cost, and validation re-checks its result on the live page | The candidate is rejected and the traveller is told why |
| Validation | Opus 5.5, low effort | It reads the price the traveller approves | Code overrules an acceptance when the page is on a different rate; the hand-off re-checks the amounts on the page |
| Scoring | No model | Must be explainable and repeatable | n/a |
| Hand-off | Code, plus one extraction call (Opus 5.5) on redacted text after blind mode has ended | No model context exists while the card is typed | Code overrules the proposal: no "confirmed" without a reference found on the page |

Measured on the three example asks with a scripted traveller, cost and wall
time from message to approval card (`../agent/MODELS.md` section 5):

| Ask | Every role on Opus 5.5 | Sonnet 5.5 on search, run 1 | Run 2 |
| --- | --- | --- | --- |
| 1 | $0.31, 116 s | $0.22, 85 s | $0.27, 96 s |
| 2 | $0.47, 181 s | $0.41, 176 s | $0.38, 166 s |
| 3 | $0.40, 123 s | $0.27, 125 s | $0.28, 108 s |

Sonnet on search reached the card 6 of 6, and in the first run of each
set-up both recorded the same candidates at the mock's exact prices. The Opus
figure for ask 3 is a re-run: the first time, two validations ran at once on
the one browser and the traveller was wrongly told the flexible rate could
not be booked. That was our harness, not a model, and is why browser agents
are now queued in code. Prompt caching carries the cost: 85% of input tokens
are cache reads.

**What we would measure:** bookings that reach the approval card; right room
and rate per case; validation rejections and failed actions; turns and wall
time, since the hold is 15 minutes; cost per completed booking, not per
request; and all of it on a hotel never seen. The bar for a cheaper model is
"no worse": about $0.10 per booking is at stake and one failed booking
outweighs many of those. Today's evidence is one or two runs per cell on one
hotel. `MODEL_SEARCH=claude-opus-5-5` reverts the choice.

## 3. Question 2: staying out of payments

**The rule: no model and no Halcy log receives payment data. A model is told
the payment status, nothing else.** The payment step is therefore code, not an
agent, and Halcy never holds, moves or collects money.

```mermaid
flowchart TB
  T([Traveller])
  A["Halcy: chat, agents, hand-off code"]
  subgraph W["Browser window on the traveller's screen"]
    HP["Hotel's page"]
    PF["Payment provider's frame"]
  end
  PSP[Payment provider]
  BANK["Traveller's bank"]
  HOTEL[Hotel]
  T -- "request, then approval of the amounts" --> A
  A -- "dates, room, guest details" --> HP
  T -- "card number, expiry, CVC, bank code" --> PF
  T -- "ticks the booking conditions" --> HP
  PF -- "card data" --> PSP
  PSP -- "asks to authorise" --> BANK
  BANK -- "one-time code" --> T
  BANK -- "money, or a guarantee" --> PSP
  PSP -- "money and a token" --> HOTEL
  HP -- "text of the hotel's own pages, redacted, never the provider's frame" --> A
  A -- "result message with the hotel's reference and amounts" --> T
  A -- "chat and hotel page text, redacted, never card data" --> M[Model provider]
```

A model is told a payment status and nothing else. The model provider does
receive the chat, the traveller's name, email and phone, and the text of the
hotel's own pages.

| Party | Card number, CVC | Bank code | Money | Proof the traveller agreed |
| --- | --- | --- | --- | --- |
| Traveller | types it | receives and types it | pays | ticks the conditions, passes the bank check |
| Payment provider | receives it | no | processes the charge | no |
| Traveller's bank | already has it | issues and checks it | approves | record of the bank check |
| Hotel | provider's token | no | receives it, now or at the desk | conditions accepted, booking record |
| Halcy code | never | never | never | the approval card: what was shown, when, which button |
| Halcy models | never | never | never | none |

**Who holds the money and when.** On a pay-now rate the bank moves it to the
hotel through the hotel's provider at booking. On a pay-at-the-hotel rate
nothing moves; the card is a guarantee held by the hotel. Halcy is in neither
path. The traveller's contract is with the hotel, and every message says so.

**Why the design keeps Halcy out, in layers.** The driver never enters a frame
outside the hotel's site. During the hand-off nothing is observed, acted on
or screenshotted. Card-like fields on the hotel's own page are redacted by
field. The run log refuses page events inside the blind interval and scrubs
card-like numbers, and an audit fails any run log that breaks this. Only a
status returns to a model, and "booked" is said only when code finds the
reference verbatim on a hotel page that is not the payment page. The
traveller ticks the conditions; the agent does not.

**The honest limit.** In the prototype the boundary is "does not", not
"cannot": the browser process could read every frame, and it is code, tests
and the audit that stop it (`limitations/limitations.md` L15). Terms and pay
buttons are kept from the agent by a prompt, not yet by code (L17).

**What would pull Halcy in.** Collecting the money and paying the hotel (the
clear licence case). Relaying keystrokes or streaming the payment page to the
traveller, which is why the live-view hand-off was rejected. Storing a card
for reuse. Typing a card the traveller sent in the chat. Ticking the hotel's
conditions for the traveller. Booking through an intermediary that becomes
the seller.

**Where we are unsure** (`limitations/not-verified.md` N17 to N21). Whether
operating the browser a card is typed into counts as handling card data.
Whether holding money and touching card data are, as we assume, separate
questions with separate answers. Whether a script in a WebView's main frame
is truly unable to read a provider's frame on both phone platforms. Whether
wallets and saved cards work in an embedded view. Whether a given hotel's
terms allow automated form filling. Each needs someone who would know.

## 4. Question 3: the user journey

The traveller does four things: writes the request, answers at most a
question or two, approves one card, and pays in the hotel's page.

| Step | What the traveller sees |
| --- | --- |
| Clarify | "Quick check before I search: how many adults are staying?" with buttons |
| Progress | "The River-View Double is sold out for those dates. Next best is the Superior Double on the Flexible rate. I'm checking it on the live site now." |
| Approval card | Room, dates, "Room €404.00", "Tourist tax, paid at the hotel: €16.00", "Total €420.00", "Charged now: €0.00", "Paid at the hotel, to Casa Halcy: €420.00", cancellation terms, what differs from the request, what the site does not say, and that their bank sets the exchange rate |
| Hand-off card | "Over to you: pay at Casa Halcy." The amounts as the hotel writes them, what the bank should ask them to approve ("if it shows anything else, stop"), minutes left on the hold |
| Result | "You're booked with Casa Halcy. Booking reference CH-711228. ... Your booking and your contract are with Casa Halcy." |

**When things go wrong.** All five have been run; the last column says how.

| Case | What happens | What the traveller sees | Run |
| --- | --- | --- | --- |
| The room is gone | Recorded as sold out and rejected with that reason. A fallback the traveller named is taken; otherwise they are asked | "River view is sold out for those dates", then the next best or a question | Every run of ask 1 |
| The price moved | A tax or fee on a later page is a new line and a new total. A changed room price is a rejection, and the traveller is asked again with both figures. Before the hand-off, code refuses if an agreed amount is no longer on the page _[pending: holding the room again once and re-checking is in review]_ | "The hotel's payment page says the room 'was €928.00 and is now €1000.00'. ... Do you want this at the new price?" with Yes and No | Tax: every run. Room price: scenario 07 |
| The card is declined | Halcy cannot see the provider's frame; it reads the hotel's page afterwards. Up to three attempts | "The payment did not go through. Casa Halcy's page says: 'Your card was declined by your bank.' Nothing is booked", then "Try another card?" | Mock, stand-in: declined, then a second card confirmed |
| The bank wants to confirm | Inside the provider's frame, in the same window. Halcy is blind and never sees the code; the hand-off card said beforehand what the bank should show. Only after three wrong codes does the hotel's own page show an error | The bank's own screen. After three wrong codes: "... 'Too many wrong codes. The payment was cancelled.' Nothing is booked" | Mock, stand-in: confirmed; three wrong codes, then a retry |
| They go quiet | Before approval the wait ends after 10 minutes. During payment: a reminder at half time, a last one 3 minutes before the deadline, a stop 60 seconds before the hold ends | "I've stopped because I didn't hear back. Nothing is booked and nothing has been charged." During payment: "I didn't hear back in time ... I can't see a booking on Casa Halcy's site" | Before approval: once, at the first question. During payment: mock with a 1-minute hold |

Two rules shape the wording. After the hand-over Halcy never says "nothing was
charged", because it did not watch. And a status it cannot establish is
reported as unknown, with a question, not guessed.

## 5. Failure modes of the system

| What can go wrong | How it is detected | What the traveller sees |
| --- | --- | --- |
| Validation ends on the wrong rate | Code: a pay-at-hotel candidate is not accepted on a page that charges now, nor a refundable one on a non-refundable page | The candidate is not offered for payment |
| The payment page charges in another currency than the room list | The currency is recorded as written, re-read by validation, compared in code | Not offered; both currencies stated. Unit-tested, not seen live |
| Too little of the hold left, or the page changed while the card was read | Hold clock and agreed amounts re-read before going blind | "I haven't handed you Casa Halcy's payment page: ..." with the reason |
| The hold runs out during payment and the bank still approves | The hotel's page says the room was released | "Casa Halcy has released the room ... If you confirmed a payment or entered a bank code, check with Casa Halcy." Halcy cannot prevent this; the 5-minute floor, the reminders and the early stop lower the odds |
| The hotel confirms in a way we do not recognise | No reference found verbatim | "I can't see a confirmation on Casa Halcy's site. Did a confirmation email arrive?" |
| The window is closed, or still on another site when the wait ends | Driver events | "I lost the booking window", check with the hotel |
| The model provider fails or declines | Typed API errors, the refusal stop reason | "Something went wrong on my side", nothing booked. During payment a code-only reader still recognises a confirmation |
| A hotel page carries instructions for the agent | Page text reaches models as tool results or quoted data; card fields and the provider's frame cannot be acted on | Nothing. Not tested with a hostile page |
| A site unlike any we have seen | Search stops after three failed attempts at a step | Told the site could not be driven; nothing booked |

**Exchange rates.** The hotel charges in its own currency and the traveller's
bank converts on the day of each charge, so the part paid at the hotel later
can differ in the traveller's currency. Halcy shows the hotel's amounts and
converts nothing. A limit given in another currency is not compared with the
hotel's prices: asked for "not more than 3000 kronor", the agent answered
"Casa Halcy prices in euros, not kronor, so I couldn't check your 3,000 SEK
limit" and asked for one in euros. An offer to "pay in your own currency"
inside the provider's frame is something Halcy never sees.

## 6. How we would know it works before launch

**What exists.** 13 scenario cases with a scripted traveller and a grader that
reads the run log. Every case must pass the payment-boundary audit, log no
error and never have two agents on the browser at once, plus its own checks.
About 110 unit tests. CI runs typecheck, tests and the run-log audit; live
model runs are started by hand because they cost money.

**Results so far.** All 13 cases have met at least one real run on the mock;
twelve pass as graded, among them a budget cap, four adults in one room and
an unknown hotel (no booking in either), a card number typed into the chat
(refused, audit clean), "can I pay Halcy" (refused: the hotel is the seller)
and a request in Swedish. Case 07 failed on the script, not the agent; the
re-run is pending. The runner stops at the approval card. The payment step
has one full booking behind the real orchestrator (151 s, a stand-in paying)
and, against the mock with a stand-in, every failure path in section 4 plus a
pay-now rate, Cancel, a closed tab and an expired hold. Every run log passes
the audit.

**A second hotel.** A second mock with different markup, a native date field,
rates as radio buttons, prices per night, a fee that first appears on the
review page and payment by redirect. In its first version two of three asks
reached approval with the right room and rate in about 90 seconds each, on a
site the agent had not seen. _[pending: the third ask, and the version that
charges in another currency.]_

**What a pass is worth.** The grader has been wrong once: it passed a run in
which the traveller ended on the wrong rate, because the case did not check
the rate. And up to the approval card it reads what the agents recorded, not
what the hotel would charge. The mock keeps its own record of bookings, which
a test harness, unlike the agent, may read; comparing the two comes first.

**Still missing.** A person paying in the visible window. Silence at the
approval card, when the hotel is already holding the room. Repeats, to tell a
difference from noise. Real hotel sites.

**Launch gates**, on at least five hotel sites not used in development: the
amount on the approval card equals the amount the hotel recorded, per
booking, which is "never surprised" as a number; bookings that reach the card
with the right room and rate; questions asked per booking; no run log failing
the boundary audit; no "confirmed" without a reference the hotel can find; a
known rate of "unconfirmed", each with a follow-up; time to the card well
inside the shortest hold; cost per completed booking. Then a supervised
period in which a person reads every run log.

Further reading: `limitations/` (limitations, trade-offs, not verified),
`../agent/payment/TRAPS.md`, `../agent/payment/DESIGN.md`,
`../agent/MODELS.md`.
