# Concerns register

Everything Claude has flagged during the work, in one place, so the closing
note ("what you're least sure about") can be written from it. One line of
status each. Update when a concern is resolved or accepted.

Status: **open** (no decision), **accepted** (we live with it, say so in the
closing note), **resolved** (decision taken, see where).

## A. Payment boundary

| # | Concern | Source | Status |
|---|---------|--------|--------|
| A1 | The starter's `observe` reads every frame, including the payment provider's iframe. Card numbers would land in `events.jsonl`. | `agent/payment/TRAPS.md` 2 | resolved in code: `tools/boundary.ts` + `tools/browser.ts` filter frames and mask iframes; the hand-off flow itself is still open |
| A2 | Relaying the traveller's keystrokes through Halcy's process (live view) is close to "Halcy handles card data". | `infrastructure.md` 4 | resolved: the live view is dropped; the traveller types in the visible browser window, no keystroke passes Halcy code (`agent/payment/DESIGN.md` P7). Production trade-off is in `agent/WEBVIEW-PLAN.md` section 6 |
| A3 | Who ticks the terms checkbox decides who proved consent. | `agent/payment/TRAPS.md` 9 | resolved in the build: the agent never ticks it; the traveller does, in the hotel's window, during the hand-off |
| A4 | The bank approves even after the hotel's hold expired: money taken, no booking. | `agent/payment/TRAPS.md` 3 | partly: no hand-off with under 5 minutes of hold (a fresh hold is asked for once instead), the wait ends 60 s before expiry, and the traveller is told to stop before it. Reproduced against the mock: when it happens anyway the traveller is told the hotel released the room and to check with the hotel, never that nothing was charged. The thresholds are guesses and the risk cannot be removed from outside the hotel |
| A5 | Proving blind mode to a reviewer needs a log shape we have not built yet. | `agent/payment/TRAPS.md` open questions | resolved: `GuardedLog`, `audit:runs`, and the `handoff.*` events; two hand-off runs against the mock pass the audit |
| A6 | A hotel that renders card fields on its own page, no iframe, defeats the origin allowlist. | `agent/payment/TRAPS.md` open questions | resolved for reading: fields are redacted by label and content on any origin (`payment/redact.ts`, PR #11). Screenshots of such a page are still only prevented by blind mode |

## B. Scope versus the brief

| # | Concern | Source | Status |
|---|---------|--------|--------|
| B1 | The hotel is given by name; cross-hotel search (Booking.com, scraping) is product vision, not the 8-hour build. | `agent/ARCHITECTURE.md` 2.1 | resolved: one hotel site, see `agent/README.md` decisions |
| B2 | A middle provider as booking channel would move the contract and the money away from the hotel. Metadata only. | `agent/ARCHITECTURE.md` 2.2 | accepted: write the sentence in the design doc |
| B3 | "No real hotels in your prototype" rules out any Booking.com call during the build. | `BRIEF.md` constraints | accepted |

## C. Architecture and runtime

| # | Concern | Source | Status |
|---|---------|--------|--------|
| C1 | Validation needs the same browser as search, and reaching the payment page creates a 15-minute hold per candidate. | `agent/ARCHITECTURE.md` 2.4 | resolved: `agents/validation.ts` takes one candidateId on the shared page |
| C2 | The chat server delivers mid-run messages only through `chat.reply()`; "continuously update the goal" needs polling or a server change. | `agent/ARCHITECTURE.md` 2.5 | open: decision 4 |
| C3 | Search time limits must be expressed against the hold clock once a hold exists. | `agent/ARCHITECTURE.md` 2.6 | open |
| C4 | `chat.choose` and `chat.reply` wait forever; a quiet traveller leaves a browser open until the hold dies. | `agent/payment/TRAPS.md` 12 | partly: `tools/chat.ts` races waits against a timeout; the chat server still keeps a dead `waitingPress` |
| C5 | LLM-only scoring is not reproducible or comparable across goal changes. | `agent/ARCHITECTURE.md` 2.3, research doc | resolved: `scoring/objective.ts` is deterministic; model only calls `set_objective` |
| C6 | Cloud Run throttles CPU after the response; the agent loop must run inside one request behind Cloud Tasks. Not a prototype issue. | `infrastructure.md` 2 | accepted for the design doc |
| C7 | A cloud browser draws bot checks and CAPTCHAs on real hotel sites. | research doc, `infrastructure.md` 4 | accepted: WebView is the production path |

## D. Process

| # | Concern | Source | Status |
|---|---------|--------|--------|
| D1 | `agent/payment/TRAPS.md` is 333 lines and `agent/payment/DESIGN.md` about 260, over the 200-line convention. | `agent/CLAUDE.md` | accepted: the rule targets code; split at sections A to D if asked |
| D2 | Time: 8-hour cap, deadline 18:52 HKT. Infra and docs can eat the build time. | `TIME-LOG.md` | ongoing |
| D3 | The debrief adds an unseen hotel. Anything that only works on Casa Halcy is a hidden failure. | `BRIEF.md` | ongoing: convention in `agent/CLAUDE.md` |
