// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import { newRunState, type SearchGoal } from "../types.ts";
import { cachedSearch, rememberSearch, SEARCH_FRESH_MS, searchKey } from "./search-cache.ts";

const goal: SearchGoal = { hotel: { name: "Casa Halcy", url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-24", adults: 3, mustHave: ["cancellable"], preferences: ["cheapest"] };

test("a search depends on hotel, dates and party, not on preferences or budget", () => {
  const nicer = { ...goal, preferences: ["nicest"], mustHave: [], budget: { currency: "EUR", maxTotal: 500 } };
  assert.equal(searchKey(goal), searchKey(nicer));
  assert.notEqual(searchKey(goal), searchKey({ ...goal, adults: 2 }));
  assert.notEqual(searchKey(goal), searchKey({ ...goal, checkout: "2026-10-25" }));
  assert.notEqual(searchKey(goal), searchKey({ ...goal, hotel: { name: "Villa Aurora", url: "http://v" } }));
  assert.equal(searchKey({ ...goal, children: [9, 4] }), searchKey({ ...goal, children: [4, 9] }));
});

test("a changed preference reuses the earlier search; past the freshness limit it does not", () => {
  const state = newRunState(memoryStore());
  rememberSearch(state, goal, "5 rooms", 1_000);
  assert.equal(cachedSearch(state, { ...goal, preferences: ["breakfast"] }, 1_000 + 60_000)?.summary, "5 rooms");
  assert.equal(cachedSearch(state, goal, 1_000 + SEARCH_FRESH_MS + 1), undefined);
  assert.equal(cachedSearch(state, { ...goal, adults: 2 }, 2_000), undefined);
});

test("forgetting a search makes the next run_search read the site again, for that hotel only", async () => {
  const { forgetSearch } = await import("./search-cache.ts");
  const state = newRunState(memoryStore());
  const other = { ...goal, hotel: { name: "Villa Aurora", url: "http://v" } };
  rememberSearch(state, goal, "rooms without their rates", 1_000);
  rememberSearch(state, other, "other hotel", 1_000);
  forgetSearch(state, { ...goal, preferences: ["cheapest rate"] });
  assert.equal(cachedSearch(state, goal, 2_000), undefined, "a fresh search is not blocked by the earlier list");
  assert.equal(cachedSearch(state, other, 2_000)?.summary, "other hotel");
});
