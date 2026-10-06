// A room recorded with a price but no rate name usually means the search saw
// the room list and not the rates behind it (a "Book" or "See rates" button,
// a dialog, an expandable row). Each rate has its own price and terms, so
// such a candidate is incomplete: the search is told to open the rates.

import type { Candidate } from "../store.ts";

/** Ids of offered rooms recorded with a price and no rate name. */
export function missingRates(candidates: Candidate[]): string[] {
  return candidates
    .filter((c) => c.features.sold_out?.value !== true)
    .filter((c) => typeof c.features.price_total?.value === "number" && typeof c.features.rate_name?.value !== "string")
    .map((c) => c.id);
}

/** One sentence for the search agent, or null. */
export function missingRatesNote(ids: string[]): string | null {
  if (!ids.length) return null;
  return `Incomplete: ${ids.join(", ")} have a price but no rate name. The rates are probably behind a control on the room (a button, a link, a dialog or an expandable row). Open each one, record one candidate per rate with its own rate name, price and terms, and score again.`;
}
