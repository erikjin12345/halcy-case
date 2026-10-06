import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import { missingRates, missingRatesNote } from "./rates.ts";

function store(rows: [string, Record<string, unknown>][]) {
  const s = memoryStore();
  for (const [id, f] of rows) s.observe(id, "h", f, "list");
  return s.candidates();
}

test("a priced room without a rate name is incomplete; a sold-out room is not", () => {
  const c = store([
    ["deluxe", { room_name: "Deluxe", price_total: 300 }],
    ["loft", { room_name: "Loft", sold_out: true, price_total: 200 }],
  ]);
  assert.deepEqual(missingRates(c), ["deluxe"]);
  assert.equal(missingRatesNote([]), null);
});

test("a made-up generic name for a room's only rate is incomplete", () => {
  const c = store([
    ["harbour", { room_name: "Harbour Room", rate_name: "Standard", price_total: 410 }],
    ["garden-a", { room_name: "Garden Room", rate_name: "Standard", price_total: 300 }],
    ["garden-b", { room_name: "Garden Room", rate_name: "Non-refundable", price_total: 270 }],
  ]);
  assert.deepEqual(missingRates(c), ["harbour"], "a Standard next to another rate of the same room is a real rate");
  assert.match(missingRatesNote(["harbour"])!, /never made up/);
});

test("a rate name the source page does not contain is incomplete", () => {
  const c = store([
    ["a", { room_name: "Harbour Room", rate_name: "Member Saver", price_total: 380 }],
    ["b", { room_name: "Harbour Room", rate_name: "Semi-flex", price_total: 410 }],
  ]);
  const page = "Harbour Room  Semi-flex  EUR 410  Cancel up to 3 days before";
  assert.deepEqual(missingRates(c, () => page), ["a"]);
  assert.deepEqual(missingRates(c, () => undefined), [], "without the page text, only the other rules apply");
});
