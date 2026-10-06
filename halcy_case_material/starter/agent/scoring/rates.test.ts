import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import { missingRates, missingRatesNote } from "./rates.ts";

test("a priced room without a rate name is flagged as incomplete; a sold-out room is not", () => {
  const s = memoryStore();
  s.observe("deluxe", "h", { room_name: "Deluxe", price_total: 300 }, "list");
  s.observe("deluxe-flex", "h", { room_name: "Deluxe", rate_name: "Flexible", price_total: 300 }, "list");
  s.observe("garden", "h", { room_name: "Garden", sold_out: true }, "list");
  s.observe("loft", "h", { room_name: "Loft", sold_out: true, price_total: 200 }, "list");
  assert.deepEqual(missingRates(s.candidates()), ["deluxe"]);
  assert.match(missingRatesNote(["deluxe"])!, /deluxe have a price but no rate name\. .*Open each one/);
  assert.equal(missingRatesNote([]), null);
});
