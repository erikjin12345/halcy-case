# Closing note

What we deliberately left out, what we are least sure about, and what we would
build next. The detail behind every line is in `limitations/` (rows L, T and N
are cited) and `concerns.md`. State on 2026-10-06.

## What we deliberately left out

- **Search across hotels and booking through an intermediary.** The brief
  names the hotel and wants the contract to be with it. An aggregator as the
  booking channel would also change who the seller is (T16).
- **A traveller who is not at the machine.** The traveller pays in the visible
  browser window on the same screen. A live view of that page inside the chat
  was designed and then rejected: it would send the card digits through Halcy
  as pixels and keystrokes (T2). The phone path, the hotel's site in a WebView
  in the app, is a plan with one step built (L29).
- **Anything that makes payment easier by touching it.** Halcy does not type a
  card, read the payment provider's frame, tick the hotel's conditions, or
  tell the traveller why their bank refused (T6, T13). It costs the traveller
  a click and Halcy some helpfulness.
- **Follow-up after an outcome we cannot establish.** `unconfirmed` ends with
  a question to the traveller. No later re-check, no matching of the hotel's
  email (L10).
- **Deployment and persistence.** One process on one machine, state in memory.
  The cloud layout is a design (T20, L27, L28).
- **Vision, a second model provider, live model runs in CI** (T17, T19, T21).
- **Changing the request while the agent is searching** (L21).

## What we are least sure about

1. **A hotel we have not seen.** Everything ran on one mock hotel. The debrief
   runs another. Generic patterns were a rule from the first hour, but a rule
   is not a run (L19, N8 to N10).
2. **Whether this shape may be the product's.** Halcy never holds money, and
   we are fairly confident that keeps it clear of the licence question. We are
   not confident that operating the browser a card is typed into is outside
   the card-data rules, or that the two questions separate as cleanly as we
   assume. That needs a specialist, not an engineer (N17, N18).
3. **"Does not" versus "cannot".** In the prototype the browser process could
   read every frame; code, tests and a run-log audit are what stop it (L15).
   That is evidence, not architecture.
4. **A person at the keyboard.** Every payment run used a script in place of
   the traveller. The stand-in types in six seconds and never hesitates (N1,
   N2, T22).
5. **The hotel's hold.** A bank can approve after the hotel has released the
   room. We reproduced it on the mock: the traveller is told the hotel
   released the room and to check with the hotel, and is never told nothing
   was charged. We can lower the odds (no hand-over under 5 minutes, a stop 60
   seconds before the end, one attempt at a fresh hold when the traveller was
   slow) but not remove them, and those numbers are guesses (T7, N16).
6. **What the open page does not show.** The last look before the hand-over
   reads the page as it stands. A room taken by someone else in the meantime
   is found only when the hotel refuses, after the card was typed (L33).
7. **The model choice.** Search now runs on Sonnet 5.5 because it matched
   Opus 5.5 on the three example asks at about half the search cost. That is
   two runs per ask on one hotel (N13, N15).
8. **How often a real hotel confirms in a way we do not recognise** (L4, T8).
   We chose a false "I can't see a booking" over a false "you're booked", and
   do not know the price of that choice outside the mock.

## What we would build next

In this order, because each one tells us whether the next is worth doing.

1. **More hotels to fail on.** Two or three mock hotels with different
   layouts: card fields on the hotel's own page, a payment page that takes
   over the whole tab, a confirmation with no reference on screen. Run the
   scenarios and the payment failure paths on each.
2. **The traveller's own run**, then the hand-off details it exposes: bring the
   window forward reliably, keep it open after the confirmation (L2, L3).
3. **Close the gaps that are held by a prompt or by luck.** No agent action on
   a detected payment page, in code (L17). Keep the price the search saw and
   the amounts the payment page showed apart, so a second validation compares
   like with like (L36). Amounts checked next to their labels (L8). A reload
   before the hand-over where the hotel's session survives one (L33). A test
   that no recorder is ever on (L16).
4. **A follow-up for `unconfirmed`**: reopen the page, check again later, ask
   for the hotel's email (L10).
5. **The phone path**, starting with the one-day check of what a WebView can
   and cannot read and how wallets behave in it (N19, N20), then the page
   script and the protocol, which need no app (`../agent/WEBVIEW-PLAN.md`).
6. **Measure before choosing.** Repeat each model cell, on more than one
   hotel, and sweep effort per role.
7. **Ask the people who would know**: card-data scope, licence, and hotels'
   terms on automated form filling (N17, N18, N21).

## Where the tools were wrong

The debrief asks what the AI tools got wrong. From the sessions' own logs:

- The first cost estimate was seven times too high ($2.2 against a measured
  $0.33): it assumed no caching.
- The first payment plan recommended the live view that was later rejected
  for showing Halcy the card.
- Two validation agents once drove the one browser at the same time and a run
  ended on the wrong rate. The scenario grader passed that run until it was
  fixed.
- A commit message said a check against the mock had passed when the run had
  reported the opposite. It was corrected in the next commit.
- A fix was pushed to a branch a minute after its pull request had been
  merged, and was missing from `main` until another session noticed.
- One session stopped the mock hotel another session was running against.
- A masking rule written to stop a leak was then narrowed in a way that
  reopened it; a second session caught it in review.
- The first validation overwrote the room's search price with the payment
  page's total. Asked to validate the same room again for a fresh hold, the
  agent rejected an unchanged room as a price change. It only showed up when
  the whole flow was run with a traveller who was slow to approve.
- An expired hold shows no clock, and the first hand-off code read "no clock"
  as "no time limit". It would have handed over a page whose room was already
  released. Found by running the case against the mock, not by a unit test.
