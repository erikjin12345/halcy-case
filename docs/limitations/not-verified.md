# Not verified

What we believe but have not run, measured or had checked. Move a row out
only with a run log, a test or a source to point at. State as of 2026-10-06
13:30 HKT.

## Not run at all

| #   | Claim | What exists instead | What would verify it |
| --- | ----- | ------------------- | -------------------- |
| N1  | A person can pay in the visible window and the chat reports the booking | Runs with a script standing in for the traveller, browser without a window | The developer plays the traveller with `npm run chat:booking` |
| N2  | The hand-off works with a real window (`bringToFront`, the window being found) | All automated runs forced `visible` with a headless browser | Same as N1 |
| N3  | Wrong bank code three times, expired hold, closed window, Cancel, silence until the deadline | Unit tests with fakes | Each one against the mock |
| N4  | A decline followed by a second card that succeeds | Unit test with fakes; against the mock only decline then stop | One run with both test cards |
| N5  | A rate that charges now (Saver) through the hand-off | Only the Flexible rate (0 now, card as guarantee) was paid | One Saver run |
| N6  | Any ask other than example ask 1 through payment, including a long stay with the price rise | Ask 3 reached the approval card in a run without a window, and the hand-off refused to start there, as designed | Runs with a window or the stand-in |
| N7  | The card shows amounts as the hotel writes them (PR #14) | A unit test; seen wrong once before the fix | Any run after the merge |
| N8  | Anything on a hotel site other than Casa Halcy | Nothing | A second mock; the debrief |
| N9  | A hotel that sends the whole tab to a payment provider or the bank and back | A unit test with fake navigations | A mock variant with a redirect |
| N10 | Card fields on the hotel's own page are redacted in a real browser | Unit tests on observation objects | A mock variant with inline fields |
| N11 | A non-English hotel site or request | One Swedish scenario case exists | Its result, once run |
| N12 | Changes in PR #16 (one agent on the browser at a time, validation overruled by code) | Typecheck and unit tests | A live run |

## Measured too thinly

| #   | Claim | Sample | Source |
| --- | ----- | ------ | ------ |
| N13 | $0.33 and about 155 s per booking up to the approval card, all Opus 5.5 | One run, before later fixes | `agent/MODELS.md` section 5 |
| N14 | 151 s from message to confirmed booking | One run, stand-in paying in 6 s | `runs/2026-10-06T04-56-27-570Z-booking-full-standin` |
| N15 | A cheaper model for search is good enough | Being measured: three scenarios on Opus, then Sonnet for search | `agent/MODELS.md` section 6, when updated |
| N16 | The 5 minute and 60 second hold thresholds are right | Never tuned | Runs with a slow traveller |

## Not checked by someone who would know

| #   | Claim | Why it matters |
| --- | ----- | -------------- |
| N17 | Operating the browser the card is typed into does not count as handling card data | Decides whether the prototype's shape could ever be the product's (`agent/payment/DESIGN.md` section 6) |
| N18 | Holding money (payments licence) and touching card data (card-industry security rules) are separate questions with separate answers | The design document's answer to question 2 rests on keeping them apart |
| N19 | A script injected only into a WebView's main frame cannot read a frame from another origin, on iOS and Android | The WebView plan's boundary depends on it |
| N20 | Wallet payments and saved cards work, or fail gracefully, in an embedded view | Decides WebView versus system browser tab per hotel |
| N21 | Automated form filling is allowed by a given hotel's terms | Some sites forbid it (`docs/research/mobile-browser-limitation.md`) |
| N22 | The agents handle a hotel whose payment page charges in another currency than its room list | The code check is unit-tested. One live run on the mock showed the other half: a limit in SEK against EUR prices was left out, the traveller was told the hotel prices in euros and asked for a limit in euros, the new limit was applied, and the card carried the exchange-rate line. The mock never changes currency between pages, so the rejection itself has not been seen live. The second mock hotel will be the first real test |
| N23 | A traveller who goes quiet at the approval card, with the hotel already holding the room, is told what the hold means | One live run with the wait shortened to 20 s (`REPLY_TIMEOUT_MS`): quiet at the first question, the agent said it had stopped, that nothing was booked or charged and that no room was being held. Quiet at the approval card, after validation has started a hold, has not been run |
