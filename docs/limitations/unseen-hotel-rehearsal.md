# Unseen hotel rehearsal

A rehearsal of the debrief's unseen hotel, run 2026-10-06 at 20:37 HKT on
branch `test/unseen-hotels` (main `6b7d473`). Nothing in the agent was
changed or tuned. Findings are recorded here first; the user decides what
gets fixed.

## The hotel

Gasthof Alpenblick (`halcy_case_material/test-hotels/alpenblick/`, ports
4600 and 4601), built by a subagent that read only the starter's README and
never `starter/agent/`. Everything differs from the two mock hotels: German
throughout; arrival as day and month dropdowns plus a nights count; rooms as
cards whose rates open in a modal; CHF with a euro guide; a city tax
(Kurtaxe) as a footnote and a pre-ticked service charge on the details page;
card fields on the hotel's own page, not in a provider frame; the bank code
in a pop-up window on the provider's origin; a 12-minute hold stated in
words.

**Drop-in test: passed.** Adding one line to `starter/hotels.json` was the
only change. The boundary allowed the new origin, the currency code knew
CHF, and the agent reached the site's payment page.

## Results

Three asks, scripted traveller, headless, every role on the defaults
(search on Sonnet 5.5). Reports under `runs/scenarios/2026-10-06T12-37-38-962Z`.

| Ask | Result | Time | Cost | What happened |
| --- | --- | --- | --- | --- |
| Cheapest room for two | **Agent fault** | 91 s | $0.24 | Approved the Doppelzimmer on the Flexibel rate (CHF 378.00 with Kurtaxe) instead of the cheaper Spartarif (CHF 316.80). Search never opened the rate modals: it recorded one price per room with no rate name. Validation then picked Flexibel because its price matched, and said the Spartarif was cheaper but not chosen. The card did offer "I'd rather have the Spartarif" |
| A single room, must be cancellable | **Agent fault**, plus a script fault | 57 s | $0.13 | The objective required `room_name` to contain "single", an English word, on a German site that says "Einzelzimmer". Nothing passed scoring. The agent noticed and asked "Shall I check it on the hotel's live site?"; my scripted traveller answered No because a rule for extras matched the word "breakfast" |
| Three people, budget 3000 kronor | **Pass** | 64 s | $0.14 | "Familienzimmer, Flexibel (2 nights): CHF 520.00 (≈ 6,284 kr) [...] That is well over your 3,000 kr. The budget check used an estimate". Nothing booked |

Total $0.51 for the three runs. One failed browser action per run: the
first attempt to pick a day in the arrival dropdown timed out, then worked.

## The payment boundary on a page with inline card fields

- **Run logs:** all four pass `npm run audit:runs`. The test card's digits
  appear in none of them. Validation reached the payment page in one run
  and did not act on any field there.
- **No hand-off was run.** It needs a test harness that fills the card
  fields in the agent's own browser, which does not exist, so the blind
  interval on an inline card page is untested.
- **Field redaction is English-only (code finding, no run needed).**
  `payment/redact.ts` recognises card fields by label. On this site:

  | Field | Treated as sensitive |
  | --- | --- |
  | "Kartennummer", empty | no |
  | "Kartennummer" holding 4242 4242 4242 4242 | yes, by the Luhn check on its content |
  | "Gültig bis (MM/JJ)" holding 12/30 | no; the expiry date is visible to a model |
  | "Karteninhaber" | no |
  | "Prüfnummer (CVC)" | yes, because of "CVC" |
  | "Bestätigungscode" (bank code) | no |
  | Portuguese labels ("Número do cartão", "Validade", "Código de segurança") | none |

  A filled card number does not leak. But expiry, cardholder and the bank
  code's label are not recognised, and the agent would not be refused if it
  tried to act on an empty card number field. Only blind mode and the
  prompts stand in the way. Before blind mode starts, the fields are empty.

## What the rehearsal says

1. Reaching the site, its dropdowns, its German pages and its currency
   worked without any change.
2. **Rates behind a modal are a blind spot.** Search records what the room
   list shows and does not open the dialog, so on a site like this it can
   miss the cheaper rate.
3. **Wanted words are written in English** by the objective, so a hard
   constraint on a room name can fail every room on a site in another
   language.
4. **Field redaction needs labels in other languages,** or a rule that does
   not depend on labels (autocomplete attributes such as `cc-number`, or
   every input on a page that takes a card).
