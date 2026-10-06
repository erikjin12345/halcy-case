# mock-hotel-2: Villa Aurora

A second mock hotel, for running the agent on a booking site it was not built
against. The brief says the debrief does exactly that. Zero dependencies.

```bash
npm run hotel2    # http://localhost:4500, payment provider on 4501
```

Ports come from `HOTEL2_PORT` and `PAY2_PORT`. State is in memory. The test
cards are the mock's usual two. `http://localhost:4501/__phone` is the guest's
phone and `http://localhost:4500/__admin/bookings` lists confirmed bookings;
the agent must read neither.

## How it differs from Casa Halcy

| Area | Casa Halcy | Villa Aurora |
| ---- | ---------- | ------------ |
| Dates | Calendar widget, read-only fields | Native date field for arrival, a list for the number of nights |
| Guests | Plus and minus buttons | A list |
| Obstacles | Full-page cookie banner, upgrade pop-up | None |
| Rooms and rates | One "Select" per rate | A table; rates are radio buttons inside one form per room |
| Currency | Euro everywhere | Charges in pounds (`GBP 140.00`); the room list shows a rounded euro guide (`about EUR 164`) unless switched to GBP |
| Prices | Total for the stay | Per night up front, stay totals in the rate labels |
| Tax | Tourist tax first shown on the payment page | Visitor levy stated as a footnote on the first results page |
| Surprise at the end | Price rise on long stays | A cleaning fee that first appears on the review page |
| Pre-ticked add-on | Breakfast and marketing | Cancellation insurance |
| Why a room is refused | Sold out on weekend nights | Too many guests, or a stay longer than the room allows |
| A room that goes | Never after it is listed | The Tower Room for exactly three nights is listed, then "just reserved by another guest" on reserving |
| Last hotel page before paying | The payment page itself | A review page; the next click leaves the site |
| Card fields | In the provider's frame inside the hotel's page | On the provider's own page; the whole tab goes there and comes back |
| Hold | 15 minutes, a running `mm:ss` clock | 10 minutes, stated once as "for 10 minutes, until 14:35" |
| Confirmation | "card ending 4242" | "•••• 4242" |

## Rules worth knowing when writing a case

All amounts are pounds. Garden Room 95 a night, sleeps 2. Tower Room 140,
sleeps 2, sea view, stays of up to 3 nights only, and taken by someone else
on reserving when the stay is exactly 3 nights. Family Suite 165, sleeps 4, the only room with a balcony.
Standard rate: pay on arrival, free cancellation up to 3 days before. Advance
purchase: 10% off the room, paid today, no refund. Cleaning fee 15 per stay,
first shown on the review page. Visitor levy 2.50 per person per night, paid
at the hotel. Insurance 9 per stay, ticked by default. Breakfast basket 12 per
person per night, not ticked. Euro guide: pounds times 1.17, rounded.

`/location` says the nearest stop is Pier Gardens on tram line 2, four minutes
on foot. Casa Halcy's site says nothing about transport.

It is a test site, not a second target: nothing in the agent may be written
for it, any more than for Casa Halcy.
