// What validation could not confirm goes to the traveller. "The site does not
// say" is a claim about the whole site; the agent has only seen some pages.
// So a claim of absence stands only if a page whose address names the topic
// area (location, directions, facilities, FAQ, ...) was opened during that
// validation. Otherwise it is reworded to what is true: not found on the
// pages that were checked.

/** Pages a hotel puts its own facts on. Matched against the paths visited. */
export const INFO_PAGE = /locat|getting|direction|how-to|find-us|area|neighbo|facilit|amenit|faq|question|about|info|service|transport|parking|access/i;

/** Wording that claims the site lacks something, as opposed to not having found it. */
const ABSENCE =
  /\b(the )?(hotel'?s? )?(web)?site (does not|doesn'?t|did not|didn'?t|does'?nt) (say|state|mention|list|show|give)|\b(is|are) not (stated|mentioned|listed|given) (on|by) the (hotel'?s? )?(web)?site|\bno (information|mention|details?) (on|about|of)\b[^.]*\b(on|in) the (hotel'?s? )?(web)?site|\bthe (hotel'?s? )?(web)?site (has|gives|offers) no\b/i;

export function claimsAbsence(text: string): boolean {
  return ABSENCE.test(text);
}

/** Rewords absence claims unless an information page was opened. Returns the items and whether any changed. */
export function honestUnverified(items: string[], visitedPaths: string[]): { items: string[]; reworded: boolean } {
  if (visitedPaths.some((p) => INFO_PAGE.test(p))) return { items, reworded: false };
  let reworded = false;
  const out = items.map((item) => {
    if (!claimsAbsence(item)) return item;
    reworded = true;
    const topic = item.split(/[:—–-]\s|\.\s/)[0].trim();
    return `${topic}: I did not find this on the pages I checked (${visitedPaths.length ? visitedPaths.join(", ") : "the booking pages"}); the hotel's site may say it elsewhere.`;
  });
  return { items: out, reworded };
}
