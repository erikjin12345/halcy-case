# Not verified

What we believe but have not run, measured or had checked. Move a row out
only with a run log, a test or a source to point at. State as of 2026-10-06
15:40 HKT. Rows that were moved out are listed at the end with their evidence.

## Not run at all

| #   | Claim | What exists instead | What would verify it |
| --- | ----- | ------------------- | -------------------- |
| N6  | Any ask other than example ask 1 through payment with the orchestrator in front, including a long stay with the price rise | Ask 3 reached the approval card in a run without a window, and the hand-off refused to start there, as designed | Runs with a window or the stand-in |
| N8  | Anything on a hotel site other than the two mocks | A second mock (Villa Aurora) ran the scenarios and the payment step | The debrief's hotel |
| N10 | Card fields on the hotel's own page are redacted in a real browser | Unit tests on observation objects | A mock variant with inline fields |
| N11 | A non-English hotel site or request | One Swedish scenario case exists | Its result, once run |
| N24 | The "price has changed" card when a fresh hold comes back with other figures | Unit tests | A mock that changes its price between two holds |
| N25 | A change the open page does not show (room taken by someone else, price changed on the server) is caught before the traveller types a card | Nothing: the last look reads the page as it stands and does not reload it | A mock that changes state behind an open payment page |

## Measured too thinly

| #   | Claim | Sample | Source |
| --- | ----- | ------ | ------ |
| N13 | $0.22 to $0.41 and 85 to 176 s per booking up to the approval card, with search on Sonnet 5.5 (the default) | Two scripted runs per example ask, on the mock: one on 6f5dd69, one on main after PR #16 and #19 | `agent/MODELS.md` section 5; `runs/scenarios/2026-10-06T05-14-58-249Z` and `2026-10-06T07-10-23-704Z` |
| N14 | 151 s from message to confirmed booking | One run, stand-in paying in 6 s | `runs/2026-10-06T04-56-27-570Z-booking-full-standin` |
| N15 | Sonnet 5.5 is good enough for search, which is now the default | Two scripted runs per example ask on the mock, 3 of 3 to the approval card both times, the second on main after PR #16 with the corrected grader. Compared with Opus once per ask: same candidates, same prices. Not run on a second hotel | `agent/MODELS.md` sections 5 and 6 |
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

## Moved out, with evidence

Run folders are under `halcy_case_material/runs/` (not in git; selected ones
go into the submission). All were run on 2026-10-06 against the mock hotel
with a real browser and the real classifier, and all pass `npm run audit:runs`.
A script stood in for the traveller in every run except the first row.

| Was | Claim | Outcome | Run folder |
| --- | ----- | ------- | ---------- |
| N1, N2 | A person pays in the visible window, and the chat reports the booking | The developer's own request (cheapest room for three, 20 to 24 October, both hotels searched in parallel), Casa Halcy Superior Double on the Saver rate, approved in the chat; the developer typed the card and the bank code in the window. Nothing was logged while blind except the wait; `confirmed`, "Booking reference CH-972001 ... charged now €658.24, paid at the hotel €48.00". The mock's own record matches; nothing charged without a booking. Still not done by a person: a decline, a wrong bank code, Villa Aurora | `2026-10-06T12-18-19-976Z-booking` (copied to `docs/runs/`) |
| N3  | Wrong bank code three times, then a retry | `declined` quoting "Too many wrong codes. The payment was cancelled.", then `confirmed` | `...T07-17-55-606Z-handoff-path-wrong-code` |
| N3  | The hold expires and the bank still approves (Saver rate) | `hold_expired` quoting the hotel; no claim about money; the mock lists the charge without a booking | `...T07-24-01-478Z-handoff-path-expired-late` |
| N3  | Silence until the deadline | Two reminders, then `timed_out` | `...T07-23-19-072Z-handoff-path-deadline` |
| N3  | Cancel pressed; tab closed | `cancelled`; `session_lost` | `...T07-17-34-676Z-handoff-path-cancel`, `...T07-17-43-959Z-handoff-path-closed` |
| N4  | A decline, then a second card that works | `declined` quoting the hotel, reload, `confirmed` | `...T07-18-10-395Z-handoff-path-decline-then-ok` |
| N5  | A rate that charges now | `confirmed`, "charged now €337.92, paid at the hotel €16.00" | `...T07-17-25-453Z-handoff-path-saver` |
| N7  | Amounts on the card as the hotel writes them | "Total: €400.00 / Charged now: €0.00" in every run above | same |
| new | A hold that expired before the hand-over | Hotel's wording quoted, fresh hold, `confirmed` | `...T07-27-43-215Z-handoff-path-expired-then-fresh` |
| N12 | A fresh hold through the real validation agent, behind the orchestrator, when the traveller is slow to approve | Hotel's "Your hold has expired" quoted, same room validated again, same figures, handed over, `confirmed` in 189 s. A first attempt failed and led to L36 | `...T07-35-26-649Z-booking-full-slow-approval-2` (failed attempt: `...T07-31-43-766Z-booking-full-slow-approval`) |
| N9  | A hotel that sends the whole tab to its payment provider and back (second mock hotel, Villa Aurora: hold stated as "for 10 minutes, until 15:57", card on the provider's own page, pounds) | Hold read from the page (9 minutes), `confirmed` with VA reference and "charged now GBP 186.00"; a decline returns the tab to the same review page and is read as `declined` in the hotel's words. A script stood in for validation as well as the traveller | `...T07-47-55-766Z-handoff-villa-ok`, `...T07-49-41-133Z-handoff-villa-decline` |
| new | A hold too short, twice | Refused, fresh hold asked for once, refused again | `...T07-27-41-593Z-handoff-path-short-hold` |

Two of these used a mock started with a 1-minute hold and shortened
thresholds in the hand-off, so that the case fits in a minute.
