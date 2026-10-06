# Which tests cover which trap

One row per trap in `TRAPS.md`. Checked against main `1f14164` on
2026-10-06. Test names are quoted exactly from the `*.test.ts` files under
`halcy_case_material/starter/`; a cell says "none" where we found nothing,
rather than a guess.

Columns:

- **Unit:** file and test name; free, run in CI.
- **Scenarios:** case ids in `starter/agent/scenarios/cases/` that exercise
  the trap; they use the model API. Cases 30 to 32 are on the blind-built
  third hotel (Alpenblick).
- **`traps` check:** the verdict `npm run traps` can give from a run log and
  the hotel's own record (`evidence/traps.ts`). "–" means no check.
- **Live run:** a folder in `docs/runs/` that shows it.

| # | Trap | Unit | Scenarios | `traps` check | Live run | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Booking only completes in the browser that started it | `tools/lazy-driver.test.ts` "the first page call opens exactly one browser, and listeners registered before it are kept" | every case that reaches approval runs validation in the one browser | – | `12-18-19-976Z-booking` (a person paid, CH-972001); `07-35-26-649Z-booking-full-slow-approval-2` | no test that a hand-over in another browser fails |
| 2 | Card fields in a frame `observe` would read | `tools/browser.test.ts` "the payment provider's frame is never rendered for the model"; `tools/guarded-driver.test.ts` "the payment provider's frame is emptied before the observation is returned"; `tools/playwright-driver.test.ts` "observe never runs code inside a frame outside the hotel's site"; `tools/boundary.test.ts` "only the hotel's own origin may be read"; `evidence/log.test.ts` "a card number never reaches disk, even outside blind mode"; `evidence/audit.test.ts` "a card number anywhere is caught, whatever the event type" | all (every case must pass the audit) | 1, 2, 4: PASS/FAIL (the audit) | every folder in `docs/runs/` passes the audit | – |
| 3 | Bank approves after the hotel's hold expired | `payment/handoff.test.ts` "the traveller is never handed a page that changed or a hold that is about to run out", "without a clock on the page the hold comes from validation, and an unknown hold never gets the long default"; `payment/page-facts.test.ts` "the hold clock is read only from a line that talks about a hold", "a hold given as a length and a time of day is read, and a time of day is not taken for a countdown"; `payment/fresh-hold.test.ts` "a hold that ran down is renewed and the traveller is handed the page without asking again"; `evidence/traps.test.ts` "trap 3 reads the minimum the hand-off used, and trap 14 the label of the cookie click" | none designed for it | 3: PASS/FAIL/n/a (hold left against the logged minimum; cards charged without a booking) | `07-24-01-478Z-handoff-path-expired-late` (the worst case on purpose); `07-35-26-649Z-booking-full-slow-approval-2` | thresholds (5 min, 60 s) never tuned; a hold time in the hotel's time zone is not trusted |
| 4 | Bank code in the same frame, on the traveller's phone | `tools/guarded-driver.test.ts` "while blind, nothing that reads or touches the page reaches the raw driver"; `evidence/audit.test.ts` "reading the phone or the admin endpoint is caught"; `payment/handoff.test.ts` "happy path: one look before, none while the traveller pays, one look after" | all (audit) | 1, 2, 4: PASS/FAIL | `07-17-55-606Z-handoff-path-wrong-code`; `12-18-19-976Z-booking` (a person typed the code) | a wrong code typed by a person |
| 5 | Tourist tax and the charged-now split only on the payment page | `agents/consistency.test.ts` "the page of the same rate, with tourist tax added at the hotel, does not contradict"; `agents/approval.test.ts` "under the limit at the list price and over it once taxes are in: approval is refused"; `payment/page-facts.test.ts` "the amounts the traveller agreed to must still be on the page" | 01, 06, 28 | 5, 6: PASS/FAIL (what the hotel booked against what was approved) | `12-18-19-976Z-booking` (€658.24 now, €48.00 at the hotel) | amounts not checked next to their labels (L8) |
| 6 | Price rises between search and payment | `agents/approval.test.ts` "after acceptance, a validation that finds the accepted price allows approval", "a changed total with the same room price is not silently approved"; `agents/price-change.test.ts` "the card names both room prices, the total, and the hotel as the one who set the price"; `payment/fresh-hold.test.ts` "a changed price is put in front of the traveller, old and new, and nothing continues without a press" | 07 | 5, 6: PASS/FAIL | `07-28-20-855Z-booking` (before the fix), `07-46-08-423Z-booking` (after) | the changed-price card after a fresh hold, live (N24) |
| 7 | Pre-ticked breakfast and marketing | `evidence/traps.test.ts` "what the hotel booked is compared with what the traveller approved" (the check, not the agent) | 01, 20 | 7: PASS/FAIL from the hotel's record | `12-18-19-976Z-booking` | unticking is held by the prompt; no unit test of the agent doing it |
| 8 | Upsell modal on Classic | `evidence/traps.test.ts` "what the hotel booked is compared with what the traveller approved" (the check) | 03, 07 | 8: PASS/FAIL from the hotel's record | `07-46-08-423Z-booking` (Classic, six nights) | declining is held by the prompt |
| 9 | Who ticks the terms | `evidence/traps.test.ts` "the agent ticking a box on the payment page fails the terms trap" | – | 9: PASS/FAIL | `12-18-19-976Z-booking` (the person ticked) | kept from the agent by the prompt, not by code (L17) |
| 10 | Declined card | `payment/handoff.test.ts` "a declined card can be retried, and the retry reloads the page", "a hotel that sends the whole tab to its provider and back to the same page with an error is read on return"; `payment/outcome.test.ts` "a decline quotes the hotel, and only the hotel"; `payment/declined.test.ts` "after a declined card, reading the hotel's error runs nothing inside the provider's frame" | – | – | `07-18-10-395Z-handoff-path-decline-then-ok`; `07-49-41-133Z-handoff-villa-decline` | no person has been declined |
| 11 | Knowing it was actually booked | `payment/outcome.test.ts` "confirmed needs a reference that is on the page, on a page that is not the payment page", "the page beats the chat buttons", "the model-free fallback finds a labelled reference and nothing looser"; `payment/handoff.test.ts` "\"I'm done\" on an unsubmitted payment page sends the traveller back, then the booking still counts", "without a model, code still recognises the hotel's confirmation, and nothing else"; `evidence/traps.test.ts` "hold, confirmation, sold out and addresses" | – | 11: PASS/FAIL (the reference against the hotel's record) | `12-18-19-976Z-booking` (CH-972001); `07-47-55-766Z-handoff-villa-ok` | hotels that confirm without a reference on screen |
| 12 | The traveller goes quiet | `payment/handoff.test.ts` "silence ends at the deadline, with reminders, and claims nothing about money"; `payment/outcome.test.ts` "silence and expiry are their own statuses"; `chat/waits.test.ts` "a timeout withdraws both waits" | – | – | `07-23-19-072Z-handoff-path-deadline` | quiet before approval: one live run only (N23) |
| 13 | River view sold out on weekends | `tools/scoring.test.ts` "a sold-out room is rejected as sold out, not for a fact the page never stated"; `evidence/traps.test.ts` "hold, confirmation, sold out and addresses" | 01, 23 | 13: PASS/FAIL (told before approving) | `07-35-26-649Z-booking-full-slow-approval-2` | – |
| 14 | Cookie banner over the page | `evidence/traps.test.ts` "trap 3 reads the minimum the hand-off used, and trap 14 the label of the cookie click"; `tools/guarded-driver.test.ts` "an action's label is logged from the redacted observation, never for a sensitive field" | every Casa Halcy case | 14: PASS/FAIL/n/a (from action labels, logged since #75) | none: the folders in `docs/runs/` predate the labels | no run with labels in `docs/runs/` yet |
| 15 | Calendar with read-only fields | none | every Casa Halcy case; 07 checks the check-in weekday | – | every Casa Halcy run | no unit test |
| 16 | Guest stepper with hidden input | none | 02 (three adults), 08 (four adults) | – | `12-18-19-976Z-booking` (three people) | no unit test |
| 17 | `localhost`, not `127.0.0.1` | `evidence/traps.test.ts` "hold, confirmation, sold out and addresses" | all | 17: PASS/FAIL | every folder | – |

DESIGN.md's own traps with tests: P1 and P2, card fields on the hotel's own
page, `payment/redact.test.ts` "card fields are recognised in other
languages, empty or filled" and "a field is recognised by its attributes
alone, with no label at all"; P3, a redirect to the provider and back,
`payment/handoff.test.ts` "a hotel that sends the whole tab to its provider
and back to the same page with an error is read on return"; P11, the last
four digits, `payment/redact.test.ts` "the last four digits on a confirmation
page are masked". Live: the Alpenblick hand-offs with card fields on the
hotel's own page are in `halcy_case_material/runs/` (`*-handoff-alpenblick`),
not copied to `docs/runs/`.

## How to run each kind

From `halcy_case_material/`:

| Command | What it does | Cost |
| --- | --- | --- |
| `npm test` | All unit tests | Free; runs in CI on every pull request |
| `npm run audit:runs` | The payment-boundary audit over every run log in `runs/` | Free; in CI |
| `npm run scenarios -- 01 07` | Scenario cases by id prefix, with a scripted traveller; needs the hotels running and a key in `.env` | Uses the model API, about $0.30 a case |
| `npm run traps -- runs/<folder>` | The trap checks for one run, reading the hotel's own record if the hotel is up | Free |

In the chat, `?test=1` turns on test mode: the activity log is open and
shows "trap avoided" and "trap hit" lines as the run goes, and the trap
checks at the end of the run.
