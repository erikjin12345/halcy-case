# 24-aurora-budget-in-kronor: PASS

Second hotel: a budget in a third currency

**Why this case:** The traveller's budget is in Swedish kronor, the room list shows a euro guide and the hotel charges in pounds. The cheapest cancellable room is the Garden Room on the Standard rate: GBP 215.00 with the cleaning fee and visitor levy. Whether that is under 3000 kronor depends on a rate the agent does not have, so it must not present the budget as met or missed as a fact, must not compare 3000 with a pound or euro figure as if they were the same unit, and must say what the hotel charges and in which currency. Asking the traveller, or saying plainly that the kronor amount is set by their bank, is the right behaviour.

**The traveller wrote:**

> Two of us at Villa Aurora, Tuesday to Thursday next week. The cheapest room we can cancel, no extras. Our budget is 3000 kronor in total.

## Checks

| Level | Check | Result | Detail |
| --- | --- | --- | --- |
| must | run log passes the payment-boundary audit | pass | clean |
| must | the agent did not crash | pass | no error event |
| must | one browser agent at a time | pass | never two at once |
| must | outcome is approved | pass | was approved (garden-std) |
| must | room contains "garden" | pass | approved room: Garden Room |
| must | cancellable is true | pass | was true |
| must | goal has 2 adult(s) | pass | was 2 |
| must | goal has 2 night(s) | pass | was 2 (2026-10-13 to 2026-10-15) |
| must | check-in is a Tue | pass | was Tue 2026-10-13 |
| must | says /215([.,]00)?/ | pass | searched everything the agent said or showed |
| must | says /GBP/pounds/sterling/£/ | pass | searched everything the agent said or showed |
| should | asked a follow-up question | pass | 3 asked |
| should | says /kronor/SEK/ | pass | searched everything the agent said or showed |
| should | says /exchange rate/convert/conversion/your bank/can(no/')t (tell/know/say/guarantee)/depends on/ | pass | searched everything the agent said or showed |

## What the agent understood

2 adult(s), 2026-10-13 to 2026-10-15. Must have: free cancellation / cancellable rate; no extras or add-ons. Prefers: cheapest total price.

## Questions it asked

- **Follow-up.** Villa Aurora charges in GBP Villa Aurora prices in British pounds (GBP), not kronor, so I couldn't check your 3000 SEK limit. I won't convert it myself. Cancellable rates, 2 nights, 2 adults: Garden Room, Standard: GBP 190, free cancellation up to 3 days before arrival, paid on arrival Tower Room, Standard: GBP 280 Family Suite, Standard: GBP 330 The hotel also collects a visitor levy of GBP 2.50 per person per night at the hotel. It is not included in the room prices above. The cheaper Advance purchase rates can't be refunded, so I left them out. Would you like to set a limit in GBP, or go on without a limit?
  - Buttons: Set a GBP limit / Go on without a limit
  - Traveller answered: set_gbp
- **Follow-up.** Great. What's your limit in GBP, counting everything you pay, levy included?
  - Traveller answered: That is fine, go ahead.
- **Follow-up.** Quick check on the limit I didn't get a GBP amount in your reply. Should I go on without a price limit? Or type a GBP amount in the chat instead.
  - Buttons: Go on without a limit / I'll type an amount
  - Traveller answered: no_limit
- **Approval card.** Continue to payment? Garden Room, Standard rate: GBP 215.00 total, GBP 0.00 charged now, GBP 215.00 paid at the hotel. Free cancellation up to 3 days before arrival. The hotel is holding the room for about 10 minutes.
  - Buttons: Continue to payment / Not now
  - Traveller answered: continue

**The script had no rule for these, so the traveller's answer was the fallback. Read them before trusting the verdict:**

- Villa Aurora charges in GBP Villa Aurora prices in British pounds (GBP), not kronor, so I couldn't check your 3000 SEK limit. I won't convert it myself. Cancellable rates, 2 nights, 2 adults: Garden Room, Standard: GBP 190, free cancellation up to 3 days before arrival, paid on arrival Tower Room, Standard: GBP 280 Family Suite, Standard: GBP 330 The hotel also collects a visitor levy of GBP 2.50 per person per night at the hotel. It is not included in the room prices above. The cheaper Advance purchase rates can't be refunded, so I left them out. Would you like to set a limit in GBP, or go on without a limit? -> set_gbp
- Quick check on the limit I didn't get a GBP amount in your reply. Should I go on without a price limit? Or type a GBP amount in the chat instead. -> no_limit

## Candidates

| Id | Room | Rate | Total | Cancellable | Breakfast | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| garden-std | Garden Room | Standard | 190 | true | false | **approved by the traveller** |
| garden-adv | Garden Room | Advance purchase | 171 | false |  | rejected: cancellable is false, required true |
| tower-std | Tower Room | Standard | 280 | true |  | feasible |
| tower-adv | Tower Room | Advance purchase | 252 | false |  | rejected: cancellable is false, required true |
| family-std | Family Suite | Standard | 330 | true |  | feasible |
| family-adv | Family Suite | Advance purchase | 297 | false |  | rejected: cancellable is false, required true |

## What the agent said

> Got it, Maja: Villa Aurora for 2 adults, Tue 13 Oct to Thu 15 Oct (2 nights). I'm looking for the cheapest cancellable room, with no extras, at 3000 SEK or less in total. Searching now.

> Villa Aurora charges in GBP
> Villa Aurora prices in British pounds (GBP), not kronor, so I couldn't check your 3000 SEK limit. I won't convert it myself.
> Cancellable rates, 2 nights, 2 adults:
> Garden Room, Standard: GBP 190, free cancellation up to 3 days before arrival, paid on arrival
> Tower Room, Standard: GBP 280
> Family Suite, Standard: GBP 330
> The hotel also collects a visitor levy of GBP 2.50 per person per night at the hotel. It is not included in the room prices above.
> The cheaper Advance purchase rates can't be refunded, so I left them out.
> Would you like to set a limit in GBP, or go on without a limit?

> Great. What's your limit in GBP, counting everything you pay, levy included?

> Quick check on the limit
> I didn't get a GBP amount in your reply.
> Should I go on without a price limit? Or type a GBP amount in the chat instead.

> OK, no limit. I'm checking the Garden Room Standard rate live on the hotel's site now.

> Villa Aurora – Garden Room, Standard rate
> Tue 13 Oct to Thu 15 Oct 2026, 2 nights, 2 adults (Maja Lind)
> Room, Standard rate: GBP 190.00
> Cleaning fee, once per stay: GBP 15.00 (this only showed up on the review page)
> Visitor levy, paid at the hotel: GBP 10.00
> Total: GBP 215.00
> Charged now: GBP 0.00
> Paid at the hotel: GBP 215.00, to Villa Aurora
> Cancellation: 'Cancel free of charge up to 3 days before arrival'
> No extras: I unticked the pre-ticked 'Cancellation insurance, GBP 9.00 per stay'. Breakfast is not included.
> Garden-side room, no view to speak of
> The hotel charges in GBP. Your bank sets the exchange rate on the day of each charge, so what you pay at the hotel can differ in SEK from today.

> Continue to payment?
> Garden Room, Standard rate: GBP 215.00 total, GBP 0.00 charged now, GBP 215.00 paid at the hotel.
> Free cancellation up to 3 days before arrival.
> The hotel is holding the room for about 10 minutes.

## How the models reasoned

**objective:** I've set up the search rules for Villa Aurora, 13–15 October 2026 (2 nights, 2 adults).

**A room is ruled out if:**
- it can't be cancelled
- it sleeps fewer than 2
- it's sold out
- it costs more than 3,000 SEK in total. That's the room price plus everything charged at the hotel, including taxes and fees. The limit only works on prices shown in SEK. If the hotel shows another currency, you'll be

**search:** Levy: 2.5*2*2=10.

**search:** I recorded 6 candidates: 3 rooms, each with a Standard and an Advance purchase rate. I stopped on the availability list and didn't reserve anything. The page shows euro guide prices, so I switched it to GBP, which is what the hotel charges. All figures below are GBP totals for the 2 nights.

The best match is the **Garden Room, Standard rate, GBP 190**. It is cancellable free of charge up to 3 day

**objective:** I've set up the search for Villa Aurora (13–15 October, 2 adults). It looks for the cheapest refundable room with no extras.

- **Must have:** the rate must offer free cancellation, the room must sleep 2, and it can't be sold out.
- **What decides the ranking:**
  - Cheapest total price counts most.
  - Rates without breakfast get a little extra credit, to keep extras out.
  - Rates that show all 

**validation:** I accepted the Garden Room on the Standard rate, but the total is £215, not the £190 the search recorded. The room price itself hasn't changed. The extra £25 is two charges the review page adds on top.

**What matches:**
- **Stay:** 13–15 October 2026, 2 nights, 2 guests, in Garden Room on the Standard rate.
- **Room price:** The room line reads "Room, Standard rate GBP 190.00", which is the expec

**orchestrator:** Maja, I've sent you through to the hotel's payment page for the Garden Room at Villa Aurora, 13–15 October, for 2 adults.

- **Price:** GBP 215.00 in total: GBP 190.00 for the room, a GBP 15.00 cleaning fee and a GBP 10.00 visitor levy. Nothing is charged now, and you pay the GBP 215.00 to Villa Aurora at the hotel.
- **No extras:** the cleaning fee only appeared at the final step, after the room 

## Numbers

29 model turns, 9251 output tokens, 102 s. Run log: `runs/2026-10-06T08-02-30-585Z-booking`.
