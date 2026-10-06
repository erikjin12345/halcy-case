# Limitations

What the prototype does not do. "Seen as" is what the traveller or a reviewer
would notice. State as of 2026-10-06; code under
`halcy_case_material/starter/agent/`.

## Payment hand-off

| #   | Limitation | Seen as | What would lift it |
| --- | ---------- | ------- | ------------------ |
| L1  | The traveller must sit at the machine that runs the browser | No remote or phone traveller | The WebView path (`agent/WEBVIEW-PLAN.md`) |
| L2  | The code raises the hotel's tab, not necessarily the window above other apps | The traveller may have to find the browser window | A platform call, or the WebView path |
| L3  | The browser closes when the run ends, seconds after the hotel's confirmation appears | The traveller cannot re-read the hotel's confirmation page; the reference is in the chat only | Keep the window until the next chat message |
| L4  | A status needs the main tab to come back to the hotel's site and show a confirmation with a reference | Hotels that confirm in a pop-up, a new tab or only by email end as `unconfirmed` or `timed_out` | Per-pattern handling; a later re-check |
| L5  | New tabs and pop-ups are never followed, and a stray tab is not closed | A payment that finishes in a pop-up is not seen; two tabs may be visible | Tracking pages opened by the traveller without reading them |
| L6  | Errors inside the payment provider's frame are never read | Halcy cannot say why a bank code was refused; a decline is only known if the hotel's own page says so or the traveller presses "It didn't work" | Nothing, by design (trade-off T13) |
| L7  | The hold clock is read only as `mm:ss` on a line that mentions a hold, and an expired hold only from English wording (expired, released) | "15 minutes" in words or a progress bar is not understood; the wait then defaults to 10 minutes | More patterns, or a model read before the hand-over |
| L8  | The amount check asks whether each agreed number is somewhere on the page, not next to its label | A page where "charged now" and "paid at the hotel" swapped, or the figure appears elsewhere, passes. When a figure is gone, the message names it and quotes the labelled line if there is one | Label-bound extraction checked against the page |
| L33 | The last look before the hand-over reads the open page; it does not reload it | A room taken by someone else or a price changed on the hotel's server is only found when the hotel refuses at the end, after the traveller has typed the card | Reload before the hand-over where the hotel keeps the session across a reload |
| L34 | A fresh hold is asked for once, by running the validation agent again | About a minute of waiting and one more model run; a second refusal ends the run | A cheaper code path per hotel |
| L35 | The hotel's quoted message can carry text from a link next to it | "...The payment was cancelled. Try another card" | Quote the sentence, not the line |
| L36 | The second validation only works because it is told, in a note, that the candidate's price is the payment-page total. The first validation overwrites the candidate's search price with that total, so without the note the rooms page's lower pre-tax price reads as a change and the room is rejected | Seen once against the mock: "I could not confirm the same room again" for a room that had not changed | Keep the search price and the payment-page amounts apart in the candidate (`agents/validation.ts`) |
| L9  | A retry after a decline reloads the payment address | On a hotel where a reload loses the session the retry fails | Use the page's own "try again" control |
| L10 | `unconfirmed` and `session_lost` have no automatic follow-up | The traveller is asked whether the hotel's email arrived; nothing checks again later | A re-check, reopening the page, email matching with permission |
| L11 | Only card numbers are scrubbed from chat messages | A bank code typed into the chat reaches the history and the model | Withhold short all-digit messages during the hand-off |
| L12 | The hand-off card's buttons stay pressable after the wait has ended | Pressing them does nothing | A way for the chat to retire a card |
| L13 | Sensitive fields are recognised by label wording (mostly English) or by a Luhn-valid value | An unlabelled expiry or security-code field on a hotel's own page could be read; so could a card field labelled in a language we have no pattern for, until it holds a full number | Collect the `autocomplete` attribute in `observe`; more languages |
| L14 | Screenshots mask embedded frames only | Card fields placed directly on a hotel's page would be visible in a screenshot taken outside blind mode | Mask sensitive fields too |
| L15 | The Playwright process could read every frame; it is code, tests and the run-log audit that stop it | The boundary is "does not", not "cannot" | The WebView or system-tab paths |
| L16 | No test that trace, HAR or video recording is off | A future change could enable one unnoticed | A test on `openBrowser` (`DESIGN.md` P5) |
| L17 | Terms and pay buttons are kept from the agent by the validation prompt, not by code | A model error could tick the conditions | Refuse actions on a detected payment page in the driver |
| L18 | A frame that navigates off the hotel's site between the check and the read has code run in it once; the result is dropped | Nothing visible | Accept, or pause frame navigation during a read |

## Agents

| #   | Limitation | Seen as | What would lift it |
| --- | ---------- | ------- | ------------------ |
| L19 | Everything has only ever run on Casa Halcy | Behaviour on another hotel's site is unknown; the debrief runs one | A second mock with a different layout |
| L20 | 85 to 176 seconds from the message to the approval card on the three example asks (search on Sonnet 5.5, the rest on Opus 5.5) | A long wait in a chat; the hotel's hold is 15 minutes | Cheaper or faster model for search; fewer turns |
| L21 | A message sent while the agent is working is only read when the agent next asks | The traveller cannot interrupt or correct a search in progress | A shared message queue (`docs/concerns.md` C2) |
| L22 | One browser, one candidate validated at a time; validating a second abandons the first hold | Comparing two rooms at the payment-page price is slow | Parallel sessions, where a hotel allows it |
| L23 | Validation staying on the payment page is asked for in the prompt | If it wanders, the hold runs down; the hand-off's checks catch a changed page | Enforce in code |
| L24 | Every hotel in `hotels.json` is allowed for reading, not only the one being booked | Nothing in the mock | Allow the goal's hotel only |
| L25 | One conversation, one traveller, one run at a time | No group chat, no two bookings at once | Sessions in the chat server |
| L26 | The traveller's name, email and phone are sent to the model provider and written to the run log | Nothing in the mock; a policy question in production | Minimise and document |
| L30 | Halcy shows prices only in the hotel's currency and converts nothing | A traveller who thinks in another currency gets the hotel's amounts and one line saying their bank sets the rate on the day of each charge | A rate source we could cite, shown as a labelled approximation next to the price |
| L31 | Currencies are recognised from a short list of symbols, codes and words; "$" and "kr" each stand for several currencies and are treated as compatible with all of them | A room list in "$" and a payment page in CAD are not flagged as different | Read the currency code from the page's markup where it exists |
| L32 | An offer to "pay in your own currency" made inside the payment provider's frame is never seen | Halcy cannot warn about the provider's own exchange rate; the hand-off card only says what the bank should show | Nothing, by design (trade-off T13) |

## Infrastructure

| #   | Limitation | Seen as | What would lift it |
| --- | ---------- | ------- | ------------------ |
| L27 | Nothing is deployed; chat, agent, browser and mock hotel run on one machine | Demo on the developer's laptop only | `docs/infrastructure.md` section 2 |
| L28 | Chat history and agent state are in memory | A restart loses the conversation and the run | A store behind the existing `Store` interface |
| L29 | The mobile path is a plan with one step built (the `PageDriver` seam) | No app, no WebView, no protocol | `agent/WEBVIEW-PLAN.md` phases 1 to 5 |
