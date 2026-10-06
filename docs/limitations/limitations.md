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
| L7  | The hold clock is read only as `mm:ss` on a line that mentions a hold | "15 minutes" in words or a progress bar is not understood; the wait then defaults to 10 minutes | More patterns, or a model read before the hand-over |
| L8  | The amount check asks whether each agreed number is somewhere on the page, not next to its label | A page where "charged now" and "paid at the hotel" swapped, or the figure appears elsewhere, passes | Label-bound extraction checked against the page |
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
| L37 | That a room price has changed is noticed by the validation model, which reports the room line as `price_room`; code compares that figure only once the traveller has accepted a new price. A second change after an acceptance is asked about again by rule, but the mock raises its price once, so that has only been unit-tested | A validation that misreads the room line could accept a changed price unasked. The hand-off's check that the agreed amounts are on the page is the backstop | Compare the found price with the reported room line in code for every validation, once it is settled how sites that list per-night prices are recorded |
| L38 | A charge the room list states is only counted at search when the search model records it in `fees_known`; charges that first appear later are counted only after validation | A room can rank as fitting the limit and then be over it on the payment page; the traveller is then asked, never booked silently | Read stated charges per hotel layout in code |

## Infrastructure

| #   | Limitation | Seen as | What would lift it |
| --- | ---------- | ------- | ------------------ |
| L27 | Nothing is deployed; chat, agent, browser and mock hotel run on one machine | Demo on the developer's laptop only | `docs/infrastructure.md` section 2 |
| L28 | Chat history and agent state are in memory | A restart loses the conversation and the run | A store behind the existing `Store` interface |
| L29 | The mobile path is a plan with one step built (the `PageDriver` seam) | No app, no WebView, no protocol | `agent/WEBVIEW-PLAN.md` phases 1 to 5 |
