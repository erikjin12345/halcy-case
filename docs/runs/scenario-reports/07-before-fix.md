# 07-long-stay-price-change: FAIL

Six nights: the hotel raises the price between search and payment

**Why this case:** For stays of five nights or more the hotel adds EUR 12 per night once the guest's details are in, with a notice that the price has gone up. The traveller must be told that the price changed before they approve; continuing silently at the new price is the failure this case exists to catch. The scripted traveller accepts the new price when asked, so a correct run ends approved; the first live run of this case failed only because the script had no rule for that question and walked away.

**The traveller wrote:**

> Two of us at Casa Halcy for six nights from next Monday. The classic double, and we need to be able to cancel. No breakfast.

## Checks

| Level | Check | Result | Detail |
| --- | --- | --- | --- |
| must | run log passes the payment-boundary audit | pass | clean |
| must | the agent did not crash | pass | no error event |
| must | one browser agent at a time | pass | never two at once |
| must | outcome is approved | **FAIL** | was no_booking |
| must | room contains "classic" | **FAIL** | nothing was approved |
| must | cancellable is true | **FAIL** | nothing was approved |
| must | goal has 2 adult(s) | pass | was 2 |
| must | goal has 6 night(s) | pass | was 6 (2026-10-12 to 2026-10-18) |
| must | check-in is a Mon | pass | was Mon 2026-10-12 |
| must | says /gone up/went up/increase/higher than/price (has /had )?changed/more than (when/I/it)/was .* now/ | pass | searched everything the agent said or showed |

## What the agent understood

2 adult(s), 2026-10-12 to 2026-10-18. Must have: Classic double room; Free cancellation / refundable rate; Room only, no breakfast. Prefers: nothing.

## Questions it asked

- **Follow-up.** The price went up Classic Double, Flexible rate, 12–18 Oct, 2 adults The hotel's page now says: "it was €928.00 and is now €1000.00" for the room. There is also a tourist tax of €48.00 (€4.00 per person per night). All-in total: €1048.00 Charged now: €0.00 Paid at the hotel: €1048.00 Free cancellation until 48 hours before arrival Room only. I unticked the pre-ticked breakfast and marketing boxes. Courtyard side room The other cancellable choice was the Superior Double at €1,132.00 before tourist tax, when I searched.
  - Buttons: OK with €1048, go on / Too much, stop
  - Traveller answered: accept_new_price

## Candidates

| Id | Room | Rate | Total | Cancellable | Breakfast | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| classic-flex | Classic double | Flexible | 1048 | true | false | rejected: Room price changed: the payment page says 'it was €928.00 and is now €1000.00' (candidate €928, now €1000); Dates 2026-10-12 to 2026-10-18,  |
| classic-saver | Classic Double | Saver, non-refundable | 816.64 | false | false | rejected: cancellable is false, required true |
| superior-flex | Superior Double | Flexible | 1132 | true | false | feasible |
| superior-saver | Superior Double | Saver, non-refundable | 996.16 | false | false | rejected: cancellable is false, required true |
| riverview-soldout | River-View Double |  |  |  |  | rejected: sold_out is true, required false; cancellable unknown, required true; breakfast_included unknown, required false |

## What the agent said

> Got it: Classic Double for 2, Mon 12 Oct to Sun 18 Oct (6 nights), cancellable, room only. Checking Casa Halcy now.

> Found it: Classic Double, Flexible rate, €928.00 for the 6 nights. Checking it on the live site now.

> The price went up
> Classic Double, Flexible rate, 12–18 Oct, 2 adults
> The hotel's page now says: "it was €928.00 and is now €1000.00" for the room.
> There is also a tourist tax of €48.00 (€4.00 per person per night).
> All-in total: €1048.00
> Charged now: €0.00
> Paid at the hotel: €1048.00
> Free cancellation until 48 hours before arrival
> Room only. I unticked the pre-ticked breakfast and marketing boxes.
> Courtyard side room
> The other cancellable choice was the Superior Double at €1,132.00 before tourist tax, when I searched.

> Thanks. I need to pick up the new price and check the room again before you can pay. One moment.

> I'm sorry, I can't send you to payment from here. I checked twice. The hotel's room list still says €928.00, but its payment page says €1000.00. My check won't pass a booking where the two prices don't match.

> Classic Double, Flexible rate (book on the hotel's site)
> Casa Halcy, Mon 12 Oct to Sun 18 Oct 2026, 6 nights, 2 adults
> Room: €1000.00 (the hotel's payment page says "it was €928.00 and is now €1000.00")
> Tourist tax: €48.00, paid at the hotel
> All-in total: €1048.00
> Charged now: €0.00
> Paid to the hotel at the hotel: €1048.00
> Free cancellation until 48 hours before arrival
> Room only. Breakfast and marketing boxes come pre-ticked, so untick both.
> If an upgrade to the Superior is offered, decline it to keep the Classic.
> You'd book directly with Casa Halcy and enter your card details yourself.

> If you open that link, check that the payment page shows these same amounts and terms before you pay. Or I can try again later in case the hotel fixes its prices. Just tell me which you'd prefer.

## How the models reasoned

**objective:** I've set the search for Casa Halcy, 12–18 October 2026 (six nights) for 2 adults.

**Rules every room must meet:**
- Free cancellation (refundable rate)
- Room only, no breakfast
- Sleeps at least 2
- Not sold out

**How rooms are ranked:** the best possible score is 2.
- **Classic Double:** 1 point if the room name contains "classic double". This counts most.
- **No breakfast:** 0.5 points. Since

**search:** The best match is the **Classic Double on the Flexible rate: €928.00 for the 6 nights** (12–18 Oct 2026, 2 adults). It's the only option that meets all three requirements and the only one above the scoring threshold, with the top score of 2 out of 2.

- **Price and payment:** nothing is charged now. Your card is held as a guarantee and you pay the €928.00 at the hotel.
- **Cancellation:** free unt

**validation:** I rejected this candidate because the room price went up after I entered the guest details. The payment page says the price has risen because "the last room at that rate has just been taken." The room line went from €928.00 to €1000.00.

With a tourist tax of €48.00 (€4.00 per person per night) added on top, the payment page shows:

| | Amount |
|---|---|
| Room | €1000.00 |
| Tourist tax, paid at

**search:** I recorded 5 room-and-rate options from the room list, but **none of them meets all three must-haves as listed.** The only Classic Double with free cancellation failed the check on the payment page because its price went up.

I ended on the room list for 12–18 October 2026, 2 adults (http://localhost:4100/rooms?checkin=2026-10-12&checkout=2026-10-18&adults=2). There was no cookie banner or pop-up 

**validation:** I rejected this candidate because the room price went up after the search. The payment page says: "Room only, it was €928.00 and is now €1000.00." It gives the reason as "the last room at that rate has just been taken."

What the page shows now:
- **Total:** €1048.00. That's €1000.00 for the room plus €48.00 tourist tax (€4.00 per person per night), paid at the hotel.
- **When you pay:** €0.00 cha

**orchestrator:** I couldn't get you to payment for the Classic Double from here. The hotel shows two different prices for the same room.

**What happened:** the room list says €928.00 for the 6 nights. When I go to pay, the page says "it was €928.00 and is now €1000.00." My check won't pass a booking when the two prices don't match. I tried again after you said yes to the new price, and it failed the same way.

**

## Numbers

41 model turns, 12346 output tokens, 172 s. Run log: `runs/2026-10-06T07-28-20-855Z-booking`.
