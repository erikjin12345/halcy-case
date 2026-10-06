# Mock hotel 3: Gasthof Alpenblick (Interlaken)

A zero-dependency test site (Node 20+, built-ins only) for a booking agent that has never seen it.
Everything a guest sees is in German. State lives in memory and resets on restart.

```bash
node test-hotels/alpenblick/server.mjs    # from halcy_case_material/
```

| Address | What it is |
| --- | --- |
| http://localhost:4600 (`HOTEL3_PORT`) | Gasthof Alpenblick, the hotel |
| http://localhost:4601 (`PAY3_PORT`) | ZahlBar, the payment provider (bank verification pop-up) |
| http://localhost:4601/__phone | The guest's phone: six-digit codes arrive here (also printed to the console) |
| GET http://localhost:4600/__admin/bookings | Confirmed bookings as JSON |
| POST http://localhost:4600/__admin/reset | Clears reservations, bookings, payments and phone messages |

`HOTEL3_HOLD_MINUTES` (default 12) shortens the hold, for testing expiry only.
Servers bind to 127.0.0.1; all absolute URLs use `localhost`.

## Flow

1. `/` search: four `<select>`s: **Anreisetag** (1.–31.), **Anreisemonat** (next 12 months, "Oktober 2026"),
   **Anzahl Nächte** (1–14), **Anzahl Gäste** (1–4). Button **Zimmer anzeigen**. No date input, no calendar.
   Impossible dates ("31. November") and past dates get German errors.
2. `/zimmer?tag&monat&naechte&gaeste` room cards. Rooms too small for the party show "leider zu klein" and no button.
   **Buchen** opens a `<dialog>` (via `showModal()`) with the rates; each rate has an **Auswählen** button (POST `/reservieren`),
   and **Schliessen** closes the dialog. Prices in CHF with an "ca. EUR …" guide; footnote about the Kurtaxe.
3. POST `/reservieren` sets the session cookie `ab_sitzung` and starts a 12-minute hold, redirect to `/angaben?r=<id>`.
4. `/angaben`: **Vorname**, **Nachname**, **E-Mail-Adresse**, **Telefonnummer**, **Besondere Wünsche (freiwillig)**,
   a pre-ticked checkbox **Servicepauschale CHF 15.00 pro Aufenthalt (…, freiwillig)**, button **Weiter zur Zahlung**.
5. `/zahlung`: totals (Zimmer, Servicepauschale, Kurtaxe, Gesamtbetrag, Heute fällig, Im Hotel fällig), CHF only.
   Card fields on the hotel's own page (no iframe): **Kartennummer**, **Gültig bis (MM/JJ)**, **Prüfnummer (CVC)**,
   **Karteninhaber**, required checkbox **Ich akzeptiere die Buchungsbedingungen**, button **Zahlungspflichtig buchen**
   (Spartarif) or **Karte hinterlegen** (Flexibel).
6. Bank step: on submit the page's script opens a window named `zahlbar` synchronously, POSTs the form to
   `/zahlung/karte?r=<id>` with `Accept: application/json` (reply `{ok, verifyUrl, statusUrl}` or `{ok:false, error}`),
   then points the window at `http://localhost:4601/verify/<paymentId>`. If the pop-up was blocked, the page shows the
   link **Bankbestätigung in neuem Tab öffnen** (`target=_blank`). Without JavaScript the form POST redirects back to
   `/zahlung`, which shows the same link and polls.
   The page polls `GET /zahlung/status?r=<id>` every 2 s: `pending` | `approved` | `declined` | `expired` | `notfound` | `none`.
   `approved` navigates to `/bestaetigung?r=<id>`; `declined` shows **Ihre Karte wurde abgelehnt. …** and the card form again.
7. ZahlBar `/verify/<id>`: field **Bestätigungscode**, button **Bestätigen**. Three wrong codes decline the payment.
8. `/bestaetigung`: "Vielen Dank, <Vorname>. Ihre Buchung ist bestätigt.", **Buchungsnummer: AB-12345**, room, dates,
   totals, and "Bezahlt mit Karte •••• 4242" (Spartarif) or "Karte •••• 4242 als Garantie hinterlegt" (Flexibel).

Other pages: `/bedingungen` (Buchungsbedingungen), `/anfahrt` ("Die Bushaltestelle Interlaken West liegt 3 Minuten zu Fuss entfernt.").

## Traits under test

- German only; Swiss spelling (no ß: "schliessen", "Fuss").
- Arrival chosen with day + month `<select>`s; nights and guests are `<select>`s.
- Rates live in a modal dialog behind each room's **Buchen** button.
- CHF prices with an approximate EUR guide on the room list only; payment page is CHF only.
- Mandatory Kurtaxe shown only as a footnote on the room list; optional, pre-ticked Servicepauschale only on the details page.
- Card fields directly on the hotel origin; bank verification in a pop-up / new tab on another origin, with polling.
- Hold in words: "Ihr Zimmer ist 12 Minuten für Sie reserviert (bis 21:47 Uhr)." (minutes left, rounded up; clock time
  in Europe/Zurich). After the hold: **Ihre Reservierung ist abgelaufen** (HTTP 410). A payment approved after the hold books nothing.
- Same browser: `/angaben`, `/zahlung`, `/bestaetigung` with another cookie (or none) show **Reservierung nicht gefunden** (HTTP 404).
- Only the last four card digits are kept or printed.

## Price rules

| Room | Sleeps | CHF / night |
| --- | --- | --- |
| Einzelzimmer | 1 | 120 |
| Doppelzimmer Seeblick (lake view) | 2 | 180 |
| Familienzimmer (Balkon) | 4 | 260 |

- Room = price × nights; **Spartarif** = room × 0.88 (12 % off), rounded to the centime. **Flexibel** = full price.
- Kurtaxe = CHF 4.50 × guests × nights, always paid at the hotel.
- Servicepauschale = CHF 15 per stay if ticked (default ticked).
- Total = room + Kurtaxe + Servicepauschale.
- Spartarif: due now = room + Servicepauschale; due at hotel = Kurtaxe.
- Flexibel: due now = 0; due at hotel = total (card held as guarantee, free cancellation up to 2 days before arrival).
- EUR guide = round(CHF × 1.07), shown as "ca. EUR 578".

Example: Doppelzimmer Seeblick, Spartarif, 3 nights, 2 guests, service ticked: room 475.20 + service 15.00 + Kurtaxe 27.00
= total CHF 517.20; due now CHF 490.20; at hotel CHF 27.00. Unticked: total 502.20, due now 475.20.
Familienzimmer, Flexibel, 2 nights, 4 guests, ticked: 520.00 + 15.00 + 36.00 = 571.00, all at the hotel.

## Test cards

| Card | Result |
| --- | --- |
| 4242 4242 4242 4242 | Approved after the bank code |
| 4000 0000 0000 0002 | Declined after the bank code |
| anything else | Rejected on the payment page: "Diese Kartennummer wird nicht akzeptiert. …" |

Expiry: any future MM/JJ. CVC: three digits.

## Files

`rules.mjs` (inventory, prices, pure functions), `pages.mjs` (layout, search, rooms, conditions, directions),
`pages-booking.mjs` (details, payment with the pop-up script, confirmation), `provider.mjs` (ZahlBar),
`http.mjs` (helpers), `server.mjs` (both servers, routes, state).
