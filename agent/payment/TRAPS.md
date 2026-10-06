# The traps in the mock hotel and what they do to the payment module

Line references point to `halcy_case_material/mock-hotel/server.mjs`.
Traps are ordered by how hard they hit the module's goals (see `README.md`).
The first four decide the design. The rest must be handled but do not change
the architecture.

Important throughout: at the debrief the agent runs on a hotel we have not
seen. Nothing below may be solved by hard-coding against Casa Halcy's HTML.
Every solution must be a pattern the agent can recognise, not a selector.

---

## A. Traps that decide the design

### 1. The booking can only be completed in the browser that started it

**Where:** `sameBrowser` at line 160 checks both the session cookie and the
User-Agent. Used on the payment page (line 431) and in `/api/book` (line 726).

**Effect on the goal:** The simplest hand-off, "send a link to the traveller's
phone", does not work. The payment page in another browser shows "Session not
found". So the whole idea of the traveller entering the card themselves has to
happen in the *agent's* browser, or the agent's browser has to *be* the
traveller's.

**Possible ways around:**

| Option | How | For | Against |
| --- | --- | --- | --- |
| **Live view in the chat (recommended)** | The agent's Playwright page is streamed to the chat (screencast or frequent screenshots) and the traveller's clicks and keystrokes are relayed back to the same page. The agent stops observing during the hand-off. | Works on any hotel. Halcy never sees card data if we disable observe and mask screenshots. | Needs a new channel in the chat server (input relay). Latency. We must prove the agent was blind. |
| Move the session to the traveller | Export the cookie and set the same UA in the traveller's browser. | The traveller uses their own device. | Requires setting cookies in the traveller's browser, which we cannot do from a chat. Real hotels flag this as a hijacked session. Wrong direction in principle. |
| Run the whole agent in the traveller's browser | The agent drives a tab on the traveller's device (extension or WebView in the app). | The session is genuinely the traveller's. | Outside the 8-hour budget. Worth naming as "next step" in the closing note. |
| The agent fills in the card | The traveller types the card number in the chat. | Trivial. | **Forbidden.** Halcy would then handle card data. Disqualifies the whole solution. |

**Decision to make:** live view. It is the only route that both handles unknown
hotels and keeps Halcy out of the card data. Note in the design document why
link hand-off does not work, because that is the question they will ask.

### 2. The card fields sit in an iframe that `observe` reads straight through

**Where:** `browser.ts` iterates `page.frames()` and reads every frame,
including the MockPay iframe on port 4101. The fields are called `number`,
`exp`, `cvc` (line 554 onwards in the mock).

**Effect on the goal:** With the starter as it is, the card number ends up in
`events.jsonl` as soon as someone types in the field while the agent is
observing. That is Halcy "seeing the card number", which is exactly what
question 2 is about.

**Solution:**

- **Origin allowlist in observe.** The module only observes frames whose
  origin is the hotel's own. Frames from other origins are reported as
  `[payment provider: not read]` with only the origin name. Generic: does not
  require knowing it is called MockPay.
- **Blind mode during the hand-off.** From the moment the traveller takes
  over until the hotel page navigates away from the payment page, the agent
  makes no `observe` calls at all. It only waits for a URL change or for the
  traveller to say "done" in the chat.
- **Masked screenshots.** Either no screenshot at all during the hand-off, or
  a screenshot with the iframe region covered (Playwright `mask` option). The
  latter is better for the run log, because we can show we were on the payment
  page without showing the fields.
- **Log the decision.** Events `handoff.blind.start` and `handoff.blind.end` in
  the run log, so a reviewer can see exactly which interval the agent did not
  look.

### 3. The bank approves even when the hotel's hold has expired

**Where:** The comment at line 830, `chargedWithoutBooking` at line 643, hold
time `HOLD_MINUTES = 15` at line 19.

**Effect on the goal:** The worst possible outcome for "the traveller is never
surprised": the money is taken (Saver rate) but no booking is created, because
`/api/book` rejects the expired hold. The traveller has paid the hotel without
getting a room. With the Flexible rate nothing is charged, but the card is
stored as a guarantee by someone who has no booking.

**Solution:**

- **Read the timer before the hand-off.** The payment page shows the remaining
  time (`#timer`, line 212). If it is below a threshold (proposal: 5 minutes),
  do not hand off; start again from search so a new hold is created.
- **Tell the traveller the time.** "You have 11 minutes" in the chat card. This
  is also the answer to "they go quiet halfway through".
- **Prefer the Flexible rate when the traveller is indifferent.** Zero is
  charged now, so the damage from an expired hold is limited to a stored card
  guarantee. Example request 1 requires cancellable anyway, so there it is a
  given.
- **Verify afterwards.** After the hand-off: if the page does not land on a
  confirmation page with a reference, say so clearly and ask the traveller to
  contact the hotel. Never say "booked" without having read the reference.
- **Deadline on waiting.** `chat.choose` and `chat.reply` in the starter wait
  forever. The module needs its own timeout tied to the hold time.

### 4. The 3-D Secure code goes to the traveller's phone, inside the same iframe

**Where:** MockPay navigates the iframe to `/challenge` (line 562), the code is
written to `/__phone` (line 837) and to the terminal.

**Effect on the goal:** Reinforces traps 1 and 2. Verification happens in the
same iframe, in the same browser. The traveller must stay in the live view
until the code is entered. The agent may not read the code, which also means
it cannot help if the traveller types it wrong.

**Solution:**

- The hand-off covers the whole sequence card + terms + bank code, not just the
  card.
- Three wrong codes give "Too many wrong codes" and the intent fails
  (line 819). The page issues a fresh intent on reload (line 440). The module
  must recognise the error text *after* blind mode ends and offer "try again",
  which reloads the payment page and hands over anew. The hold timer keeps
  running meanwhile, so trap 3 still applies.

---

## B. Traps that affect what the traveller approves

### 5. Tourist tax and "paid at the hotel" only appear on the payment page

**Where:** `summaryTable` with `showTax: true` is used only on the payment and
confirmation pages (line 448). The rooms page shows a "room only" subtotal.

**Effect:** If the module asks for approval based on the rooms page price, the
tourist tax and the "charged now / paid at hotel" split are missing. That
breaks "never surprised".

**Solution:** The module takes its approval basis from the *payment page*, not
earlier. The chat card must have exactly the three lines the hotel shows:
total, charged now, paid at the hotel. Plus cancellation terms in plain words.
The approval is logged with the amounts, so we can show what the traveller
said yes to.

### 6. The price may have gone up between search and payment

**Where:** `LONG_STAY_NIGHTS = 5` and `LONG_STAY_SURGE = 12` at lines 67 and
68, computed at `POST /details` line 684, shown as a `.notice` on the payment
page.

**Effect:** The amount the traveller saw in the search results is no longer
right.

**Solution:** The module always compares the amounts on the payment page with
what was shown earlier in the conversation. On a difference: new approval
showing both old and new price, never silent continuation. Generic pattern:
look for a mismatch between two numbers, not for the text "has gone up".

### 7. Pre-ticked breakfast and marketing

**Where:** Lines 420 and 421, both `checked` by default.

**Effect:** Example request 1 explicitly says "no breakfast". Leaving the box
ticked makes the price 16 euro per person per night higher than asked.
Nobody asked for marketing.

**Solution:** The agent treats every pre-ticked add-on as a question: did the
traveller ask for this? If no, untick. If unclear, ask in the chat. Marketing
is always unticked. The module then verifies on the payment page that the
breakfast line is absent or present depending on what was ordered.

### 8. Upsell modal when choosing Classic

**Where:** Line 375 and the script below it. The click on "Select" for classic
is intercepted and a modal appears with "Yes, upgrade" and "No thanks".

**Effect:** A misclick gives a more expensive room. Example request 3 wants
Classic specifically.

**Solution:** Generic rule for modals: if a dialog appears after a click,
choose the option that keeps what was already chosen, unless the traveller
asked otherwise. Then verify on the details page that the room name is the
expected one.

### 9. The terms checkbox: who ticks it?

**Where:** `#terms` at line 462. Without it MockPay blocks submission
(`can-submit-reply`), and `/api/book` requires `terms: true`.

**Effect:** Question 2 is partly about "who proves the traveller agreed". If
the agent ticks the box, it is Halcy that accepted the terms on the
traveller's behalf.

**Solution:** The box is left to the traveller in the hand-off. The module
shows the terms link in the chat card before the hand-off so the traveller can
read. If we still choose to let the agent tick it (faster journey), it must be
preceded by an explicit button press in the chat with logged timestamp and
exact wording. That is a trade-off to write up in the design document, not
something to choose silently.

---

## C. Traps that affect outcome detection

### 10. Declined card

**Where:** Test card `4000 0000 0000 0002`, lines 798 and 826. The error
appears in `#pay-error` on the hotel page via postMessage, after the 3DS step
has passed.

**Effect:** The traveller did everything right and still failed. The hold is
still alive.

**Solution:** When blind mode ends and the URL is still the payment page: read
the error message (it is on the hotel's origin, so allowed), repeat it in the
hotel's words in the chat, and offer "try another card", which reloads the
page (fresh intent, line 440) and hands over again. Show remaining hold time.

### 11. Knowing it was actually booked

**Where:** The confirmation page `/confirmation/<ref>` with reference
`CH-xxxxxx`. The payment page redirects there if the hold already has a
booking (line 429).

**Effect:** The module may not use `/__admin/bookings`. The only allowed
evidence is what the hotel site shows.

**Solution:** After the hand-off the module waits for a URL change away from
the payment page. Then observe resumes (hotel origin) and the model extracts
the reference, the amount charged, the last four digits and the email the
confirmation went to. A screenshot of the confirmation page goes in the run
log. The chat card shows the reference and "your contract is with Casa Halcy",
never Halcy as the seller.

### 12. The traveller goes quiet

**Where:** Not a trap in the mock but in the starter: `chat.choose` and
`chat.reply` in `starter/chat/server.ts` wait without a deadline, and `inbox`
is cleared when the agent finishes.

**Effect:** The agent hangs with an open browser until the hold expires, and
does not know it.

**Solution:** Every wait in the module gets a deadline tied to the hold time.
On silence: a reminder in the chat at half time, abort and summary when the
hold expires ("nothing is booked, nothing is charged, say the word and I start
over"). The browser is closed. This probably requires a change in the chat
server so an aborted wait does not leave a dead `waitingPress`.

---

## D. Traps before payment that the module inherits

These sit in the navigation part of the agent, not in the payment module, but
if handled wrong the wrong thing arrives at the payment page. The module
should therefore verify its input rather than trust it.

### 13. River view is sold out every Friday and Saturday night

**Where:** `soldOut` at line 46. `/details` silently sends back to the rooms
page if the room is sold out (lines 399 and 677).

**Effect:** Example request 1 (weekend, river view) can never get what it
asked for. The agent must fall back to "whatever's nicest" and say so.

**Module's role:** Before the approval card is shown: check that the room name
on the payment page matches what the traveller was told. The card should say
"river view was sold out, this is the superior" if that is the case.

### 14. Cookie banner covering the whole page

**Where:** `COOKIE_BANNER` at line 238, `#cookies` with `position: fixed;
inset: 0`.

**Effect:** Every click underneath fails or hits the wrong thing. Only on the
search page in the mock, but real hotels have it everywhere.

**Solution:** A generic "clear obstacles" step before every action: if a
dialog covers the page, choose the least permissive option that closes it. Not
"Accept all" by default.

### 15. Calendar with read-only fields and hidden inputs

**Where:** Lines 287 to 291. The display fields are `readonly`, the real values
sit in `type="hidden"` inputs that `observe` filters out. The calendar days
have `data-date` and are picked up by `observe` thanks to the `[data-date]`
selector.

**Effect:** `fill` on the date field does nothing. The agent has to open the
calendar, page to the right month and click the days in the right order
(check-in first, check-out second).

**Solution:** A date strategy in the navigation agent: try `fill`, if the value
does not change, open the widget and click. Computing "second full weekend of
next month" must be done in code, not by the model, and verified against what
the rooms page then shows.

### 16. Guest stepper with hidden input

**Where:** `#minus` and `#plus` at line 295, `adults` is `hidden`.

**Effect:** As in 15: only clicks work. Default is 2 adults. Example request 2
needs 3, which rules out classic and river (`maxGuests: 2`).

### 17. Addresses: `localhost`, not `127.0.0.1`

**Where:** The `postMessage` checks in the payment page and MockPay compare the
origin as a string against `http://localhost:4101`.

**Effect:** If the agent opens `127.0.0.1` the payment step does not work at
all, with no error message. A practical trap for us, not for the traveller.

---

## Summary: what the module must do, in order

1. Verify that we are on a payment page on the hotel's origin and that nothing
   other than the payment provider's iframe is outside the allowlist.
2. Read the hold time. Too little left: start over.
3. Extract total, charged now, paid at hotel, terms, room, dates, add-ons.
   Compare with what the traveller saw earlier. Mismatch: new approval.
4. Show the approval card with exactly those numbers, the terms link and the
   remaining time.
5. On yes: start blind mode, log it, open the live view, relay input.
6. Wait for a URL change or the deadline. No observe calls meanwhile.
7. End blind mode, log it. Read the outcome from the hotel's origin:
   confirmation, error on the payment page, expired hold, or nothing.
8. Report in the hotel's words with the reference. On failure: offer a restart
   with a clear status of what was charged (normally nothing).

## Open questions to decide

- Live view: screencast via Playwright CDP or a screenshot every half second?
  The latter is simpler and probably enough for the debrief.
- Should the traveller tick the terms themselves (safer evidence) or the agent
  after chat approval (faster)? See trap 9.
- How do we prove blind mode to the reviewer? Proposal: the run log contains
  no observe events between `handoff.blind.start` and `handoff.blind.end`, and
  screenshots in that interval have the iframe masked.
- What if an unknown hotel puts the card fields directly on its own page,
  without an iframe? Then the origin allowlist fails. Likely answer: blind mode
  applies to the whole payment page regardless of frames.
