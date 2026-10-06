# Not verified

What we believe but have not run, measured or had checked. Move a row out
only with a run log, a test or a source to point at. State as of 2026-10-06
15:40 HKT. Rows that were moved out are listed at the end with their evidence.

## Not run at all

| #   | Claim | What exists instead | What would verify it |
| --- | ----- | ------------------- | -------------------- |
| N1  | A person can pay in the visible window and the chat reports the booking | Runs with a script standing in for the traveller, browser without a window | The developer plays the traveller with `npm run chat:booking` |
| N2  | The hand-off works with a real window (`bringToFront`, the window being found) | All automated runs forced `visible` with a headless browser | Same as N1 |
| N6  | Any ask other than example ask 1 through payment with the orchestrator in front, including a long stay with the price rise | Ask 3 reached the approval card in a run without a window, and the hand-off refused to start there, as designed | Runs with a window or the stand-in |
| N8  | Anything on a hotel site other than Casa Halcy | Nothing | A second mock; the debrief |
| N9  | A hotel that sends the whole tab to a payment provider or the bank and back | A unit test with fake navigations | A mock variant with a redirect |
| N10 | Card fields on the hotel's own page are redacted in a real browser | Unit tests on observation objects | A mock variant with inline fields |
| N11 | A non-English hotel site or request | One Swedish scenario case exists | Its result, once run |
| N12 | A fresh hold through the real validation agent (`index.ts` calls `runValidation` again when the hold ran down) | Unit tests with a fake; against the mock with a script in place of the validation agent | A full run where the traveller is slow to approve |
| N22 | The "price has changed" card when a fresh hold comes back with other figures | Unit tests | A mock that changes its price between two holds |
| N23 | A change the open page does not show (room taken by someone else, price changed on the server) is caught before the traveller types a card | Nothing: the last look reads the page as it stands and does not reload it | A mock that changes state behind an open payment page |

## Measured too thinly

| #   | Claim | Sample | Source |
| --- | ----- | ------ | ------ |
| N13 | Cost and time per booking up to the approval card: $0.31 to $0.47 and 116 to 181 s on Opus 5.5 | Three example asks, one run each | `agent/MODELS.md` section 5 |
| N14 | 151 s from message to confirmed booking | One run, stand-in paying in 6 s | `runs/2026-10-06T04-56-27-570Z-booking-full-standin` |
| N15 | Sonnet 5.5 does the search job as well as Opus 5.5 at about half the search cost | Three asks, one run each, one hotel; the default is unchanged | `agent/MODELS.md` section 6 |
| N16 | The 5 minute and 60 second hold thresholds are right | Never tuned | Runs with a slow traveller |

## Not checked by someone who would know

| #   | Claim | Why it matters |
| --- | ----- | -------------- |
| N17 | Operating the browser the card is typed into does not count as handling card data | Decides whether the prototype's shape could ever be the product's (`agent/payment/DESIGN.md` section 6) |
| N18 | Holding money (payments licence) and touching card data (card-industry security rules) are separate questions with separate answers | The design document's answer to question 2 rests on keeping them apart |
| N19 | A script injected only into a WebView's main frame cannot read a frame from another origin, on iOS and Android | The WebView plan's boundary depends on it |
| N20 | Wallet payments and saved cards work, or fail gracefully, in an embedded view | Decides WebView versus system browser tab per hotel |
| N21 | Automated form filling is allowed by a given hotel's terms | Some sites forbid it (`docs/research/mobile-browser-limitation.md`) |

## Moved out, with evidence

Run folders are under `halcy_case_material/runs/` (not in git; selected ones
go into the submission). All were run on 2026-10-06 against the mock hotel
with a real browser, the real classifier and a script standing in for the
traveller, and all pass `npm run audit:runs`.

| Was | Claim | Outcome | Run folder |
| --- | ----- | ------- | ---------- |
| N3  | Wrong bank code three times, then a retry | `declined` quoting "Too many wrong codes. The payment was cancelled.", then `confirmed` | `...T07-17-55-606Z-handoff-path-wrong-code` |
| N3  | The hold expires and the bank still approves (Saver rate) | `hold_expired` quoting the hotel; no claim about money; the mock lists the charge without a booking | `...T07-24-01-478Z-handoff-path-expired-late` |
| N3  | Silence until the deadline | Two reminders, then `timed_out` | `...T07-23-19-072Z-handoff-path-deadline` |
| N3  | Cancel pressed; tab closed | `cancelled`; `session_lost` | `...T07-17-34-676Z-handoff-path-cancel`, `...T07-17-43-959Z-handoff-path-closed` |
| N4  | A decline, then a second card that works | `declined` quoting the hotel, reload, `confirmed` | `...T07-18-10-395Z-handoff-path-decline-then-ok` |
| N5  | A rate that charges now | `confirmed`, "charged now €337.92, paid at the hotel €16.00" | `...T07-17-25-453Z-handoff-path-saver` |
| N7  | Amounts on the card as the hotel writes them | "Total: €400.00 / Charged now: €0.00" in every run above | same |
| new | A hold that expired before the hand-over | Hotel's wording quoted, fresh hold, `confirmed` | `...T07-27-43-215Z-handoff-path-expired-then-fresh` |
| new | A hold too short, twice | Refused, fresh hold asked for once, refused again | `...T07-27-41-593Z-handoff-path-short-hold` |

Two of these used a mock started with a 1-minute hold and shortened
thresholds in the hand-off, so that the case fits in a minute.
