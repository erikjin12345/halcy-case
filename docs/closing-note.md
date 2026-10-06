# Closing note

State on 2026-10-06. Row numbers (L, T, N) point into `limitations/`.

## What we deliberately left out

- **Search across hotels, and intermediaries as the booking channel.** The
  brief names the hotel and wants the contract with it (T16).
- **A traveller away from the machine.** They pay in the visible browser
  window. A live view inside the chat was rejected because it would pass the
  card through Halcy (T2); the phone path is a plan (L29).
- **Anything that eases payment by touching it.** Halcy never types a card,
  reads the provider's frame or ticks the hotel's conditions (T6, T13).
- **Follow-up on an unknown outcome**, deployment, persistence, vision, a
  second model provider (L10, T17, T19, T20).

## What we are least sure about

1. **A hotel we have not seen.** A second mock with a full-page checkout took
   the payment step through a booking and a decline, with scripts in place of
   the agents, and exposed a hold format we could not read (fixed). The
   debrief runs a third (L19, N8).
2. **Whether this shape may be the product's.** Halcy never holds money. Whether
   operating the browser a card is typed into is outside the card-data rules
   needs a specialist (N17, N18).
3. **"Does not" versus "cannot".** The browser process could read every frame;
   code, tests and a run-log audit stop it (L15).
4. **A person at the keyboard.** Every payment run used a script as the
   traveller (N1, N2, T22).
5. **The hotel's hold.** A bank can approve after the hotel released the room.
   We lower the odds, with guessed thresholds, but cannot remove them (T7, N16).
6. **What the open page does not show**, such as a room taken meanwhile, is
   found only when the hotel refuses (L33).
7. **The model choice** rests on two runs per ask on one hotel (N13, N15).

## What we would build next

1. More mock hotels to fail on, with the scenarios and payment paths run on
   each.
2. The traveller's own run, and the window details it exposes (L2, L3).
3. Close what a prompt or luck holds: no agent action on a payment page (L17),
   search price kept apart from payment-page amounts (L36), amounts checked
   next to their labels (L8).
4. A follow-up for `unconfirmed` (L10).
5. The phone path, starting with what a WebView can read (N19, N20).
6. Ask the people who would know: card-data scope, licence, hotels' terms
   (N17, N18, N21).

## Where the tools were wrong

- The first cost estimate was seven times too high: it assumed no caching.
- The first payment plan recommended the live view later rejected for showing
  Halcy the card.
- Two agents drove one browser at once and a run ended on the wrong rate; the
  grader passed it until fixed.
- A commit message claimed a check had passed when the run said otherwise.
- The hand-off read "no clock" as "no time limit" and would have handed over a
  released room. Running the case against the mock found it, not a unit test.
