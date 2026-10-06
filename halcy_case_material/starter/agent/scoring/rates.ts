// A room's rates each have their own price and terms, and the search must
// record every one with the name the page gives it. Two ways it goes wrong:
// the rates sit behind a control the search did not open, so a room is
// recorded with no rate name; or the search fills the gap with a name of its
// own ("Standard"). Both make a candidate incomplete, and the search is told
// to open the room's rates.

import type { Candidate } from "../store.ts";

/** Names a search writes when the page gave none. */
const GENERIC = /^(standard|regular|default|normal|base|basic|room only|room rate|best available( rate)?|bar)$/i;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Ids of offered rooms whose rate is missing or not the page's own: no rate
 * name; a generic name for the only rate recorded for that room; or a name
 * that does not appear in the text of the page the candidate came from.
 */
export function missingRates(candidates: Candidate[], pageOf: (c: Candidate) => string | undefined = () => undefined): string[] {
  const offered = candidates.filter((c) => c.features.sold_out?.value !== true && typeof c.features.price_total?.value === "number");
  const ratesPerRoom = new Map<string, number>();
  for (const c of offered) {
    const room = String(c.features.room_name?.value ?? c.id);
    ratesPerRoom.set(room, (ratesPerRoom.get(room) ?? 0) + 1);
  }
  return offered
    .filter((c) => {
      const rate = c.features.rate_name?.value;
      if (typeof rate !== "string" || !rate.trim()) return true;
      const onlyRate = ratesPerRoom.get(String(c.features.room_name?.value ?? c.id)) === 1;
      if (onlyRate && GENERIC.test(rate.trim())) return true;
      const page = pageOf(c);
      return page !== undefined && !norm(page).includes(norm(rate));
    })
    .map((c) => c.id);
}

/** One sentence for the search agent, or null. */
export function missingRatesNote(ids: string[]): string | null {
  if (!ids.length) return null;
  return `Incomplete: ${ids.join(", ")} have no rate name, or one the page does not use. Rate names are copied from the page, never made up. The rates are probably behind a control on the room (a button, a link, a dialog or an expandable row): open each, record one candidate per rate with the page's own rate name, price and terms, and score again.`;
}
