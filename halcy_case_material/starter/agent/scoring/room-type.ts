// Room types are named in the hotel's language. A traveller who asks for "a
// single room" means the same thing as "Einzelzimmer" or "chambre simple", so
// a wanted room type matches any common way of writing it, not only the
// English word. And a required room type that no recorded room matches is
// never an empty result: it is left out of the hard checks, and the
// orchestrator asks the traveller, naming what the site offers.

import type { Candidate } from "../store.ts";
import type { Objective } from "../types.ts";

/** Common ways hotel sites write a room type. Lower case; matched as substrings. */
const ROOM_TYPES: string[][] = [
  ["single", "einzelzimmer", "einzel", "chambre simple", "chambre individuelle", "habitación individual", "habitacion individual", "camera singola", "quarto individual", "enkelrum", "enkeltværelse", "enkeltrom", "eenpersoonskamer"],
  ["double", "doppelzimmer", "doppel", "chambre double", "habitación doble", "habitacion doble", "camera doppia", "camera matrimoniale", "quarto duplo", "dubbelrum", "dobbeltværelse", "dobbeltrom", "tweepersoonskamer"],
  ["twin", "zweibettzimmer", "chambre à deux lits", "chambre twin", "habitación con dos camas", "camera con due letti", "quarto twin", "twinrum"],
  ["triple", "dreibettzimmer", "chambre triple", "habitación triple", "camera tripla", "quarto triplo", "trebäddsrum"],
  ["family", "familienzimmer", "chambre familiale", "habitación familiar", "camera familiare", "quarto familiar", "familjerum", "familieværelse", "familierom", "familiekamer"],
  ["suite", "suite", "suíte"],
];

/** Words around a room type that do not change it: "a single room" is "single". */
const FILLER = /\b(a|an|the|room|rooms|bedroom|zimmer|chambre|habitación|habitacion|camera|quarto|rum)\b/g;

/**
 * Every way of writing the wanted type when the wish is a room type and
 * nothing else; otherwise just the phrase itself. "classic double" names one
 * room, so it does not widen to every double.
 */
export function spellings(wanted: string): string[] {
  const w = wanted.toLowerCase().trim();
  const core = w.replace(FILLER, " ").replace(/\s+/g, " ").trim();
  const group = ROOM_TYPES.find((g) => g.includes(w) || g.includes(core));
  return group ? [w, ...group] : [w];
}

/** True when the room name says the wanted room type in any common spelling. */
export function isRoomType(roomName: string, wanted: string): boolean {
  const name = roomName.toLowerCase();
  return spellings(wanted).some((s) => s.length > 0 && name.includes(s));
}

/** A required room type that no recorded room matches, with the room names the site does offer. */
export function unmatchedRoomType(candidates: Candidate[], o: Objective): { wanted: string; offered: string[] } | null {
  const wanted = o.hard.room_name;
  if (typeof wanted !== "string") return null;
  const names = [...new Set(candidates.map((c) => c.features.room_name?.value).filter((v): v is string => typeof v === "string"))];
  if (!names.length || names.some((n) => isRoomType(n, wanted))) return null;
  return { wanted, offered: names };
}

/** One sentence for the orchestrator, or null. */
export function roomTypeNote(gap: { wanted: string; offered: string[] } | null): string | null {
  if (!gap) return null;
  return `The traveller asked for "${gap.wanted}", and no room on the site is called that in any common spelling. It was NOT used to reject rooms. The site offers: ${gap.offered.join("; ")}. Before validating, tell the traveller what the site offers and ask which one they mean.`;
}
