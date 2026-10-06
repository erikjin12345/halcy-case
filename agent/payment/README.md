# agent/payment

Planning folder for the payment module: the part of the agent that takes over
once the booking has reached the payment step on the hotel's site, and that
makes sure Halcy never touches the card or the money. No code yet, planning
only. Conventions are in `../CLAUDE.md`, the agent design is in
`../ARCHITECTURE.md`.

## Goals of the module

1. **Show the traveller exactly what applies before they approve.** Amount
   charged now, amount paid at the hotel, to whom, and the cancellation terms.
   All taken from the hotel's payment page, not from the search results.
2. **Hand over to the traveller for card, terms and bank verification.** Halcy
   never fills card fields, never reads card fields, never reads bank codes.
3. **Detect the outcome and report back.** Confirmed (with reference),
   declined, expired hold, abandoned, or traveller gone quiet.
4. **Leave evidence.** A run log that shows what the agent saw, what the
   traveller approved, and that the agent was blind during the hand-off.

## What the module must never do

- Read or write inside iframes from the payment provider's origin.
- Take screenshots while card fields are visible without masking them.
- Read `/__phone` or the hotel's terminal output.
- Use `/__admin/bookings` to decide whether the booking went through.
- Tick the terms checkbox for the traveller (see `TRAPS.md`, trap 9).

## Files

- `TRAPS.md`: how each trap in the mock hotel affects the module and how we
  can get around it. Read it first.

## Where the code goes later

Most likely under `halcy_case_material/starter/agent/payment/`. This folder
is for planning and decisions, not source code. Decisions are recorded in
`../README.md`.
