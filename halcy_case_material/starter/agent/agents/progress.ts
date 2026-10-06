// One line for the traveller when a hotel's search is done, written by code
// from what search recorded, so it costs no model turn. The hotel's own
// figures and currency only.

import { money } from "./price-change.ts";
import type { RunState } from "../types.ts";

export function searchProgress(state: RunState): string | null {
  const hotel = state.goal?.hotel.name;
  if (!hotel || !state.objectiveHash) return null;
  const nights = state.goal ? Math.round((Date.parse(state.goal.checkout) - Date.parse(state.goal.checkin)) / 86_400_000) : NaN;
  const stay = Number.isFinite(nights) && nights > 0 ? ` for ${nights} night${nights === 1 ? "" : "s"}` : "";
  const ranked = state.store.ranked(state.objectiveHash).filter((e) => e.feasible);
  for (const e of ranked) {
    const c = state.store.candidate(e.candidateId);
    if (!c || c.hotel !== hotel) continue;
    const name = c.features.room_name?.value;
    const price = c.features.price_total?.value;
    const currency = c.features.currency?.value;
    if (typeof name !== "string" || typeof price !== "number") continue;
    return `${hotel} checked: the best match there is the ${name}, ${money(price, typeof currency === "string" ? currency : undefined)}${stay}, before any tax the hotel adds.`;
  }
  return `${hotel} checked: nothing there fits what you asked for.`;
}
