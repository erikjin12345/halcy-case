# Trade-offs

Choices where another option was on the table. "Cost" is what we accept by
choosing as we did. State as of 2026-10-06.

## Payment

| #   | We chose | Instead of | Why | Cost we accept |
| --- | -------- | ---------- | --- | -------------- |
| T1  | The payment step is a fixed sequence in code (`starter/agent/payment/handoff.ts`) | A model-driven agent for the payment page | No model context for a card number to land in, nothing to prompt-inject, and "booked" cannot be invented | No adaptation on an unfamiliar payment flow: the code waits and classifies, and anything unexpected ends as `unconfirmed` |
| T2  | The traveller pays in the visible browser window on the same screen | A live view of the page inside the chat | A live view streams the card digits through Halcy as pixels and keystrokes (`agent/payment/DESIGN.md` P7) | Only works when the traveller sits at the machine that runs the browser. True at the debrief, not in the product |
| T3  | Production plan: hotel site in a WebView in the app (`agent/WEBVIEW-PLAN.md`) | A system browser tab the app cannot read | Hotels tie the booking to the browser that started it, and Halcy needs a status back | The boundary is "the app does not read", proven by code and audit, not "the app cannot". Undecided per hotel; see the plan's section 6 |
| T4  | A model is told a status and nothing else; even the last four card digits are masked | Passing the hotel's confirmation text through | One rule that needs no judgement about which card detail is harmless | Halcy cannot tell the traveller which card was used; the confirmation message does not mention it |
| T5  | Masking errs on the side of too much (labels, Luhn content, masked prefixes near payment words) | Masking only what is certainly a card | A leaked digit breaks the rule; a masked year does not | A price written as asterisks, a space and four digits next to a payment word is masked, and the hand-off then refuses to start |
| T6  | The traveller ticks the hotel's booking conditions | The agent ticking them after a chat approval | The tick is the consent to the contract with the hotel; it should be the traveller's own act | One more click for the traveller |
| T7  | Refuse to hand over if the hold has under 5 minutes, the agreed amounts are no longer on the page, or there is no window | Handing over and hoping | The bank approves even after the hold expires; a changed price must be re-approved | The traveller is sent back to start over in cases that might have worked. The 5 minute and 60 second thresholds are guesses |
| T8  | `confirmed` only with a reference found verbatim on a hotel page that is not the payment page; the page beats the chat buttons | Trusting the model's reading or the traveller's "done" | A false "you're booked" is the worst message we can send | A real booking can be reported as `unconfirmed` when the hotel confirms in a way we do not recognise |
| T9  | After the hand-over, never say "nothing was charged" | Reassuring the traveller | Halcy did not watch, so it does not know | Messages after a failure are less comforting: "I can't see a booking; check with the hotel if you approved anything" |
| T10 | No screenshot after the hand-off | A picture of the confirmation in the run log | The confirmation page shows the last four digits | The run log proves the outcome with redacted text only |
| T11 | One model call in the payment step, on redacted text of the hotel's own page, checked by code | Pure pattern matching | Has to work on hotel sites we have never seen | The hotel's page text goes to the model provider; without the model only a confirmation is recognised, a decline becomes `unconfirmed` |
| T12 | Validation goes all the way to the payment page before the traveller is asked | Asking on the rooms-page price | Tax and the charged-now split only appear there | The hotel's 15-minute hold starts before the traveller has said yes; one candidate at a time |
| T13 | The browser code never enters a frame outside the hotel's site | Reading the payment form to help the traveller | "Who sees the card number" must have the answer "not Halcy's process" | The agent cannot say why a bank code was rejected or guide the traveller through the provider's form |

## Agent and models

| #   | We chose | Instead of | Why | Cost we accept |
| --- | -------- | ---------- | --- | -------------- |
| T14 | Every role on `claude-opus-5-5` (`agent/MODELS.md`) | Cheaper models per role from the start | First make it work; the saving is at most about $0.13 of $0.33 per booking | Highest cost and latency per booking until the comparison is measured |
| T15 | Scoring in code, a model only sets the weights | A model scoring each room | Explainable, repeatable, re-scoring without a new search | Wishes that do not map to a feature in the vocabulary are not scored |
| T16 | Search inside the one hotel the traveller names | Cross-hotel search, aggregators | The brief: one hotel, booked directly with the hotel | The product vision in `agent/ARCHITECTURE.md` 1.2 is not built |
| T17 | Text observation of the page, no vision | Screenshots to the model | Cheaper, faster, and nothing to mask | Content that exists only as an image or canvas is invisible to the agent |
| T18 | Tool calls of one turn run in order (`tools/serial.ts`) | Concurrent tool calls | Two concurrent clicks raced and left an add-on ticked | Slower turns |
| T19 | One provider, Anthropic's tool runner | A provider-neutral tool loop | Time | A second provider needs its own loop |
| T20 | In-memory state, one process, run locally (`docs/infrastructure.md`) | Database, cloud deployment | The hold and the browser session die with the run anyway; the mock only listens on localhost | A crash loses the run; the cloud layout is a design, not a deployment |

## Testing and process

| #   | We chose | Instead of | Why | Cost we accept |
| --- | -------- | ---------- | --- | -------------- |
| T21 | Live scenarios are run by hand, not in CI (`starter/agent/scenarios/`) | A model run on every pull request | Each run costs money and needs a key in CI | A change that makes the models behave worse passes CI |
| T22 | A script stands in for the traveller in automated payment runs | Waiting for a person each time | Repeatable evidence within the time limit | The stand-in types instantly and never hesitates; it is not committed |
| T23 | Several Claude sessions in parallel, pull request per piece, protected `main`, no required review | One session | Speed inside 8 hours | Coordination slips: a fix pushed after its PR was merged, PRs merged into the wrong base, one session stopping another's mock hotel |
| T24 | Two planning documents over the 200-line convention | Splitting them | The rule targets code | Longer reads (`docs/concerns.md` D1) |
