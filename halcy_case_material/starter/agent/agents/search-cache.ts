// Search results kept for the rest of a chat session. A search is about one
// hotel, dates and party; preferences, budget and "cheapest or nicest" only
// change how the same rooms are scored. So when only those change, the stored
// candidates are re-scored in code and the site is not searched again.
// Prices and availability go stale, so an entry is used for a short while
// only. Validation always re-reads the live page, so a cached price never
// reaches approval unchecked.

import type { RunState, SearchGoal } from "../types.ts";

/** How long a search's prices and availability are trusted. */
export const SEARCH_FRESH_MS = Number(process.env.SEARCH_FRESH_MS ?? 10 * 60 * 1000);

export interface CachedSearch {
  at: number;
  summary: string;
}

/** What a search depends on: the hotel, the dates and who is coming. Nothing else. */
export function searchKey(goal: SearchGoal): string {
  return JSON.stringify([goal.hotel.name, goal.checkin, goal.checkout, goal.adults, [...(goal.children ?? [])].sort((x, y) => x - y)]);
}

/** A fresh enough earlier search for this goal, or undefined. */
export function cachedSearch(state: RunState, goal: SearchGoal, now = Date.now()): CachedSearch | undefined {
  const hit = state.searchCache[searchKey(goal)];
  return hit && now - hit.at <= SEARCH_FRESH_MS ? hit : undefined;
}

export function rememberSearch(state: RunState, goal: SearchGoal, summary: string, now = Date.now()): void {
  state.searchCache[searchKey(goal)] = { at: now, summary };
}
