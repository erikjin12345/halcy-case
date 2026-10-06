import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunLog } from "../../log.ts";
import { memoryStore } from "../store.ts";
import { newRunState, type SearchGoal } from "../types.ts";
import { hotelLog, pool, workerState } from "./search-parallel.ts";

const goal = (name: string): SearchGoal => ({ hotel: { name, url: `http://${name}.test` }, checkin: "2026-11-13", checkout: "2026-11-15", adults: 2, mustHave: [], preferences: [] });

test("each search has its own goal and pages, and shares the store and everything else", () => {
  const base = newRunState(memoryStore());
  base.goal = goal("orchestrator's");
  base.searchHint = "switch to GBP";
  const a = workerState(base, goal("casa"));
  const b = workerState(base, goal("villa"));
  a.pages["/"] = "Casa front page";
  b.pages["/"] = "Villa front page";
  a.searchHint = undefined;
  a.objectiveHash = "h1";
  b.chargeCurrency = "GBP";
  assert.equal(a.goal?.hotel.name, "casa");
  assert.equal(b.goal?.hotel.name, "villa");
  assert.equal(base.goal?.hotel.name, "orchestrator's", "the orchestrator's goal is untouched");
  assert.deepEqual([a.pages["/"], b.pages["/"], base.pages["/"]], ["Casa front page", "Villa front page", undefined]);
  assert.equal(b.searchHint, "switch to GBP", "one search clearing its hint does not clear another's");
  assert.equal(base.objectiveHash, "h1", "other fields write through");
  assert.equal(a.store, base.store);
  assert.deepEqual([a.chargeCurrency, b.chargeCurrency, base.chargeCurrency], [undefined, "GBP", undefined], "one hotel's charge currency never reaches another");
});

test("every event from a search carries its hotel", () => {
  const events: Record<string, unknown>[] = [];
  const log = { event: (type: string, data: Record<string, unknown> = {}) => void events.push({ type, ...data }), dir: "x" } as unknown as RunLog;
  hotelLog(log, "Casa Halcy").event("observe", { url: "/" });
  assert.deepEqual(events, [{ type: "observe", hotel: "Casa Halcy", url: "/" }]);
  assert.equal(hotelLog(log, "x").dir, "x");
});

test("the pool runs at most `limit` at a time and keeps the order", async () => {
  let running = 0;
  let peak = 0;
  const out = await pool([30, 10, 20, 5, 15], 3, async (ms) => {
    peak = Math.max(peak, ++running);
    await new Promise((r) => setTimeout(r, ms));
    running--;
    return ms * 2;
  });
  assert.deepEqual(out, [60, 20, 40, 10, 30]);
  assert.equal(peak, 3);
});
