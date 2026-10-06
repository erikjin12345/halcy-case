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

2 adult(s), 2026-10-13 to 2026-10-15. Must have: free cancellation / refundable rate; no extras (room only). Prefers: cheapest total price.

## Questions it asked

- **Follow-up.** Villa Aurora charges in GBP Your 3000 SEK limit wasn't applied, because the hotel prices in pounds and I don't convert currencies. Cancellable, room-only options for 13–15 Oct, 2 adults: Garden Room, Standard: GBP 190, paid on arrival, free cancellation up to 3 days before arrival Plus a visitor levy paid at the hotel: GBP 2.50 per person per night (GBP 10 for your stay) Tower Room, Standard: GBP 280 Family Suite, Standard: GBP 330 Can you give me a limit in GBP, or should I go on without one?
  - Buttons: I'll type a GBP limit / Go on without a limit
  - Traveller answered: set_gbp
- **Follow-up.** Sure, type your limit in GBP whenever you're ready.
  - Traveller answered: That is fine, go ahead.
- **Follow-up.** Just to be sure about the limit I didn't get a GBP figure. Should I go ahead without a price limit, or use a specific amount in GBP? Either way, the cheapest cancellable room is the Garden Room at GBP 190, plus a GBP 10 levy paid at the hotel.
  - Buttons: Go on without a limit / Limit GBP 200 / I'll type another amount
  - Traveller answered: no_limit
- **Approval card.** Continue to payment? Garden Room, 13 to 15 Oct, total GBP 215.00, all of it paid at the hotel. The hotel is holding the room for about 10 minutes.
  - Buttons: Continue to payment / Don't book
  - Traveller answered: continue

**The script had no rule for these, so the traveller's answer was the fallback. Read them before trusting the verdict:**

- Villa Aurora charges in GBP Your 3000 SEK limit wasn't applied, because the hotel prices in pounds and I don't convert currencies. Cancellable, room-only options for 13–15 Oct, 2 adults: Garden Room, Standard: GBP 190, paid on arrival, free cancellation up to 3 days before arrival Plus a visitor levy paid at the hotel: GBP 2.50 per person per night (GBP 10 for your stay) Tower Room, Standard: GBP 280 Family Suite, Standard: GBP 330 Can you give me a limit in GBP, or should I go on without one? -> set_gbp
- Just to be sure about the limit I didn't get a GBP figure. Should I go ahead without a price limit, or use a specific amount in GBP? Either way, the cheapest cancellable room is the Garden Room at GBP 190, plus a GBP 10 levy paid at the hotel. -> no_limit

## Candidates

| Id | Room | Rate | Total | Cancellable | Breakfast | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| garden-std | Garden Room | Standard | 190 | true | false | **approved by the traveller** |
| garden-adv | Garden Room | Advance purchase | 171 | false | false | rejected: cancellable is false, required true |
| tower-std | Tower Room | Standard | 280 | true | false | feasible |
| tower-adv | Tower Room | Advance purchase | 252 | false | false | rejected: cancellable is false, required true |
| suite-std | Family Suite | Standard | 330 | true | false | feasible |
| suite-adv | Family Suite | Advance purchase | 297 | false | false | rejected: cancellable is false, required true |

## What the agent said

> Got it: Villa Aurora, 2 adults, Tue 13 to Thu 15 October (2 nights), cancellable, no extras, up to 3000 SEK in total. Searching now.

> Villa Aurora charges in GBP
> Your 3000 SEK limit wasn't applied, because the hotel prices in pounds and I don't convert currencies.
> Cancellable, room-only options for 13–15 Oct, 2 adults:
> Garden Room, Standard: GBP 190, paid on arrival, free cancellation up to 3 days before arrival
> Plus a visitor levy paid at the hotel: GBP 2.50 per person per night (GBP 10 for your stay)
> Tower Room, Standard: GBP 280
> Family Suite, Standard: GBP 330
> Can you give me a limit in GBP, or should I go on without one?

> Sure, type your limit in GBP whenever you're ready.

> Just to be sure about the limit
> I didn't get a GBP figure.
> Should I go ahead without a price limit, or use a specific amount in GBP?
> Either way, the cheapest cancellable room is the Garden Room at GBP 190, plus a GBP 10 levy paid at the hotel.

> Okay, no limit. I'll update the search and then check the Garden Room on the hotel's site.

> The Garden Room is still the best fit. I'm checking it on the hotel's live site now, which can take a moment.

> Villa Aurora: Garden Room, Standard rate
> 13 to 15 October 2026, 2 nights, 2 adults, room only
> Room, Standard rate: GBP 190.00
> Cleaning fee, once per stay: GBP 15.00 (this only showed up on the review page)
> Visitor levy, paid at the hotel: GBP 10.00
> Total: GBP 215.00
> Charged now: GBP 0.00
> Paid at the hotel, to Villa Aurora: GBP 215.00
> Cancellation: 'Cancel free of charge up to 3 days before arrival'
> A pre-ticked 'Cancellation insurance, GBP 9.00 per stay' was unticked. Breakfast is not included.
> The hotel charges in GBP. Your bank sets the exchange rate on the day of each charge, so what you pay at the hotel later can differ in SEK.

> Continue to payment?
> Garden Room, 13 to 15 Oct, total GBP 215.00, all of it paid at the hotel.
> The hotel is holding the room for about 10 minutes.

## How the models reasoned

**objective:** I've set up the search for Villa Aurora, 13–15 October 2026 (2 nights, 2 adults).

**Must-haves (any room that fails one is ruled out):**
- Free cancellation (refundable rate).
- Available and sleeps at least 2.
- Total of 3,000 SEK or less. That covers what you pay now and at the hotel, including any taxes or fees you can't avoid.

**Ranking:**
- The cheapest total counts most.
- Rates without br

**search:** Levy: 2.50×2×2=10.

**search:** I recorded 6 candidates (3 rooms, each with a Standard and an Advance purchase rate). I ended on the availability page, `/availability?arrival=2026-10-13&nights=2&guests=2&cur=GBP`.

The hotel charges in GBP. The page first showed euro guide prices, so I switched the display to GBP and recorded those figures.

**Best fit: Garden Room, Standard.**
- It costs GBP 190 for the stay, paid on arrival.
-

**objective:** I've set up how the search will score rooms at Villa Aurora for 13–15 October 2026, for 2 adults.

- **Must have:** the rate must offer free cancellation, the room must sleep 2, and it can't be sold out.
- **What ranks rooms:** the lowest total price counts most. A rate without breakfast gets a smaller extra boost, since you asked for room only.
- **Good enough:** the top possible score is 1.5 and

**search:** Levy: 2.5*2*2=10.

**search:** I recorded 6 candidates: three rooms, each with a Standard and an Advance purchase rate. The best fit is the Garden Room on the Standard rate. It costs GBP 190 for the 2 nights, is free to cancel up to 3 days before arrival, and is room only. That was the top score, 1.5 out of 1.5.

The page's default prices were euro guide figures. The hotel charges in GBP, so I switched the display to GBP and re

**validation:** I accepted this candidate: the Garden Room, Standard rate, still matches what the search recorded and what you asked for. The total to pay comes to £215.00, not £190, because of two charges the review page adds.

- **Dates and guests:** 13 to 15 October 2026, 2 nights, 2 guests. These match your request.
- **Room price:** The review page shows "Room, Standard rate GBP 190.00", which is the expecte

**orchestrator:** I booked the Garden Room at Villa Aurora for 13 to 15 October, 2 adults, room only, and you chose to continue to payment. The total is GBP 215.00. Nothing is charged now, and you pay all of it at the hotel.

- **Currency:** Villa Aurora charges in pounds, so your 3000 SEK limit couldn't be applied. You chose to go ahead without a limit, and I didn't convert any prices.
- **A fee that appeared late

## Numbers

37 model turns, 11340 output tokens, 117 s. Run log: `runs/2026-10-06T08-03-12-163Z-booking`.
