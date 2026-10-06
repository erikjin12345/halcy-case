// Room facts the feature list has no name for ("a balcony", "a bathtub", "a
// quiet room") live in one free-text feature, `room_details`: what the hotel's
// page says about the room, as written. Matching is the same substring match
// as for `view`, with one guard against "no balcony" matching "balcony".
//
// A hard requirement on free text cannot be failed by silence. A page that
// never mentions a balcony has not said the room has none. So the requirement
// rejects rooms only when the site states it for at least one room; when no
// room states it, nothing is rejected and the traveller must be told.

import type { Candidate } from "../store.ts";
import type { FeatureName, Objective } from "../types.ts";

export const FREE_TEXT: FeatureName[] = ["room_details"];

/** Words that, just before the wanted word, say the room does not have it. */
const NEGATION = /\b(no|not|without|non)[ -]+(a |an |any )?$/;

/** True when the text says the wanted thing somewhere, and not only as absent ("no balcony"). */
export function says(text: string, want: string): boolean {
  const t = text.toLowerCase();
  const w = want.toLowerCase().trim();
  if (!w) return false;
  for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) {
    if (!NEGATION.test(t.slice(Math.max(0, i - 16), i))) return true;
  }
  return false;
}

/** Hard free-text requirements that no recorded room states either way. */
export function unstated(candidates: Candidate[], o: Objective): { feature: FeatureName; wanted: string }[] {
  const out: { feature: FeatureName; wanted: string }[] = [];
  for (const feature of FREE_TEXT) {
    const wanted = o.hard[feature];
    if (typeof wanted !== "string") continue;
    const stated = candidates.some((c) => {
      const v = c.features[feature]?.value;
      return typeof v === "string" && says(v, wanted);
    });
    if (!stated) out.push({ feature, wanted });
  }
  return out;
}

/** One sentence for the orchestrator, or null. */
export function unstatedNote(gaps: { wanted: string }[]): string | null {
  if (!gaps.length) return null;
  const list = gaps.map((g) => `"${g.wanted}"`).join(", ");
  return `The traveller required ${list}, and the hotel's site does not say it for any room. It was NOT used to reject rooms and is NOT confirmed. Before asking for approval, tell the traveller the site does not say, and ask whether to go on without it.`;
}
