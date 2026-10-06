# Run logs for the submission

Copied from `halcy_case_material/runs/` (which is not in git). Each folder has
`events.jsonl`: every model turn, page observation, action, chat message and
payment event of one run, with card-like numbers scrubbed. Every folder here
passes `npm run audit:runs` (no observation inside the blind interval, no
card number, no visit to the mock's test-only pages). All runs are against
the mock hotels on 2026-10-06. Where a script stood in for the traveller or for
validation, the line says so.

| Folder | What it shows | Backs |
| --- | --- | --- |
| `2026-10-06T07-35-26-649Z-booking-full-slow-approval-2` | Whole flow behind the real orchestrator: request, search, validation, approval, hand-off, confirmed booking. The traveller (a script) took 55 s on a 1-minute hold, so the hotel's "Your hold has expired" is quoted, the same room is validated again and paid | `design.md` section 1; closing note "least sure" 5 |
| `2026-10-06T07-17-55-606Z-handoff-path-wrong-code` | Wrong bank code three times: declined in the hotel's words, retry, confirmed | `design.md` section 4, the bank wants to confirm |
| `2026-10-06T07-18-10-395Z-handoff-path-decline-then-ok` | Declined card, then a second card that works | `design.md` section 4, the card is declined |
| `2026-10-06T07-24-01-478Z-handoff-path-expired-late` | The hold runs out during payment and the bank still approves (pay-now rate): the traveller is told the hotel released the room and to check with the hotel, never that nothing was charged | `design.md` section 5; closing note "least sure" 5 |
| `2026-10-06T07-23-19-072Z-handoff-path-deadline` | The traveller goes quiet during payment: two reminders, then timed out | `design.md` section 4, they go quiet |
| `2026-10-06T07-28-20-855Z-booking` | Scenario 07 before the fix: a long stay whose price rises on the payment page cannot be approved, because validation rejects the accepted new price again | report in `scenario-reports/07-before-fix.md` |
| `2026-10-06T07-46-08-423Z-booking` | Scenario 07 after the fix (PR #29): the price rise is shown as old and new, the traveller accepts, the room is validated at the new price and approved | report in `scenario-reports/07-after-fix.md` |
| `2026-10-06T08-03-12-163Z-booking` | Second hotel (Villa Aurora), budget given in kronor while the hotel charges pounds, after PR #35: every candidate recorded in GBP, no conversion, approved with the amounts in GBP | report in `scenario-reports/24-aurora-budget-in-kronor.md`; closing note "least sure" 1 |
| `2026-10-06T08-01-40-524Z-booking` | Second hotel, five nights: code refuses a recorded total that is not on the page ("700 is not on the page you read") and the agent then records a figure the page does show. Refuse-and-recover by the agent; it predates the code accepting a per-night total, which is unit-tested only | report in `scenario-reports/22-aurora-long-stay.md` |
| `2026-10-06T07-47-55-766Z-handoff-villa-ok` | Second hotel's payment: the whole tab goes to the provider's own page and back; hold read from "for 10 minutes, until 15:57"; confirmed. Scripts stood in for validation and the traveller | `limitations/not-verified.md` N9 |
| `2026-10-06T07-49-41-133Z-handoff-villa-decline` | Same, declined: the tab comes back to the same review page and the decline is read in the hotel's words | `limitations/not-verified.md` N9 |
| `2026-10-06T07-17-25-959Z-booking` | Scenario 10: the traveller types a card number into the chat; it is removed before anything reads it, and they are told to type it only on the hotel's page | report in `scenario-reports/10-card-typed-in-chat.md`; `design.md` section 1 step 1 |

No person has paid in a visible window in any of these. The report for scenario 10 quotes the traveller's message as the test case wrote it, with the mock's public test card number; the run log itself has it scrubbed.
