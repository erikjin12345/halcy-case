// One line for the traveller when a hotel's search is done, written by code
// from what search recorded, so it costs no model turn. The hotel's own
// figure first, then an ECB estimate in the traveller's currency when it differs.

import { money } from "./price-change.ts";
import type { RunState } from "../types.ts";
import { estimateNote, shortEstimate, type Rates } from "../scoring/fx.ts";

/** The line for the chat: hotel, room, price, nights. Nothing else. */
export function searchProgress(state: RunState, fx?: { to?: string; rates: Rates | null }): string | null {
  return progressLines(state, fx)?.chat ?? null;
}

/** The chat line, and the longer version for the trace beside the chat. */
export function progressLines(state: RunState, fx?: { to?: string; rates: Rates | null }): { chat: string; trace: string } | null {
  const hotel = state.goal?.hotel.name;
  if (!hotel || !state.objectiveHash) return null;
  const nights = state.goal ? Math.round((Date.parse(state.goal.checkout) - Date.parse(state.goal.checkin)) / 86_400_000) : NaN;
  const stay = Number.isFinite(nights) && nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "";
  const ranked = state.store.ranked(state.objectiveHash).filter((e) => e.feasible);
  for (const e of ranked) {
    const c = state.store.candidate(e.candidateId);
    if (!c || c.hotel !== hotel) continue;
    const name = c.features.room_name?.value;
    const price = c.features.price_total?.value;
    const currency = c.features.currency?.value;
    if (typeof name !== "string" || typeof price !== "number") continue;
    const est = fx && typeof currency === "string" ? shortEstimate(price, currency, fx.to, fx.rates) : null;
    const amount = `${money(price, typeof currency === "string" ? currency : undefined)}${est ? ` ${est}` : ""}`;
    const note = est && fx?.rates ? ` ${estimateNote(fx.rates)}.` : "";
    return {
      chat: `${hotel}: ${name}, ${amount}${stay ? `, ${stay}` : ""}.${note}`,
      trace: `${hotel} searched. Best feasible match by score: ${name} (${c.id}), ${amount}${stay ? ` for ${stay}` : ""}, room price before any tax the hotel adds later. Score ${e.score}.`,
    };
  }
  return { chat: `${hotel}: nothing that fits.`, trace: `${hotel} searched. No candidate passed the hard constraints.` };
}
