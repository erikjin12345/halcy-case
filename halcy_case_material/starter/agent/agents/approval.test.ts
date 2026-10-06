// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { newRunState, type ValidationResult } from "../types.ts";
import { approvalBlocker, latestValidation } from "./approval.ts";

const v = (candidateId: string, accepted: boolean, reason = "x"): ValidationResult => ({ candidateId, accepted, reasons: [reason], observed: {} });

test("a candidate that was never validated cannot be approved", () => {
  assert.match(approvalBlocker(newRunState(), "superior-flex")!, /has not been validated/);
});

test("a rejected validation blocks approval and says why", () => {
  const state = newRunState();
  state.validations.push(v("classic-flex", false, "room price changed from €444 to €480"));
  assert.match(approvalBlocker(state, "classic-flex")!, /rejected: room price changed/);
});

test("an accepted validation allows approval, also with unverified items", () => {
  const state = newRunState();
  state.validations.push({ ...v("classic-flex", true), unverified: ["reception hours at 23:00: not stated on any page"] });
  assert.equal(approvalBlocker(state, "classic-flex"), null);
});

test("the latest validation of a candidate decides", () => {
  const state = newRunState();
  state.validations.push(v("a", true), v("b", true), v("a", false, "sold out since"));
  assert.equal(latestValidation(state, "a")!.accepted, false);
  assert.notEqual(approvalBlocker(state, "a"), null);
});

test("only the candidate validated last can be approved: the browser is on its page", () => {
  const state = newRunState();
  state.validations.push(v("flex", true), v("saver", true));
  assert.match(approvalBlocker(state, "flex")!, /the browser is on saver/);
  assert.equal(approvalBlocker(state, "saver"), null);
  state.validations.push(v("flex", true));
  assert.equal(approvalBlocker(state, "flex"), null);
});

// --- a price rise the traveller accepts ---------------------------------

import { memoryStore } from "../store.ts";
import { latestAcceptance, priceChangeOffer } from "./approval.ts";

function sixNights() {
  const state = newRunState(memoryStore());
  state.store.observe("classic-flex", "Casa Halcy", { price_total: 928, currency: "€", cancellable: true }, "rooms page");
  // The payment page shows the room at 1000 and a total of 1048 with tourist tax.
  const rejected: ValidationResult = { candidateId: "classic-flex", accepted: false, reasons: ["Room price changed: 928 to 1000"], observed: { price_room: 1000, price_total: 1048, price_now: 0, price_at_hotel: 1048, currency: "€" } };
  state.validations.push(rejected);
  return state;
}
const accept = (state: ReturnType<typeof sixNights>) => state.priceAcceptances.push({ candidateId: "classic-flex", was: 928, now: 1000, total: 1048, currency: "€", at: "t" });
const revalidated = (room: number, total = room + 48): ValidationResult => ({ candidateId: "classic-flex", accepted: true, reasons: ["ok"], observed: { price_room: room, price_total: total, price_now: 0, price_at_hotel: total } });

test("the offer is the found price against the room price on the page, not the total", () => {
  const offer = priceChangeOffer(sixNights(), "classic-flex");
  assert.deepEqual(offer, { was: 928, now: 1000, total: 1048, chargedNow: 0, atHotel: 1048, currency: "€" });
});

test("nothing is offered when the price did not change, or was not reported", () => {
  const same = sixNights();
  same.validations[0].observed.price_room = 928;
  assert.match(priceChangeOffer(same, "classic-flex") as string, /has not changed/);
  const missing = sixNights();
  delete missing.validations[0].observed.price_room;
  assert.match(priceChangeOffer(missing, "classic-flex") as string, /did not report observed.price_room/);
});

test("a rejected validation still blocks approval after the traveller accepts", () => {
  const state = sixNights();
  accept(state);
  assert.match(approvalBlocker(state, "classic-flex")!, /was rejected/);
});

test("after acceptance, a validation that finds the accepted price allows approval", () => {
  const state = sixNights();
  accept(state);
  state.validations.push(revalidated(1000));
  assert.equal(approvalBlocker(state, "classic-flex"), null);
  assert.equal(latestAcceptance(state, "classic-flex")!.now, 1000);
});

test("a further change after acceptance blocks approval and can be offered again", () => {
  const state = sixNights();
  accept(state);
  state.validations.push(revalidated(1050));
  assert.match(approvalBlocker(state, "classic-flex")!, /accepted a room price of 1000, but the page now shows 1050/);
  // The next question is measured against what the traveller last accepted, not the original price.
  assert.deepEqual((priceChangeOffer(state, "classic-flex") as { was: number; now: number }).was, 1000);
});

test("after acceptance, a validation that does not report the room price cannot be approved", () => {
  const state = sixNights();
  accept(state);
  const v = revalidated(1000);
  delete v.observed.price_room;
  state.validations.push(v);
  assert.match(approvalBlocker(state, "classic-flex")!, /did not report the room price/);
});

test("a changed total with the same room price is not silently approved", () => {
  const state = sixNights();
  accept(state);
  state.validations.push(revalidated(1000, 1090));
  assert.match(approvalBlocker(state, "classic-flex")!, /accepted a total of 1048, but the page now shows 1090/);
});

// --- the traveller's limit holds for the all-in total --------------------

import { overLimit } from "./approval.ts";

function withLimit(limit: number, limitCurrency: string | undefined, total: number) {
  const state = newRunState(memoryStore());
  state.objective = { weights: {}, hard: { price_total: limit }, wants: {}, currency: limitCurrency, threshold: 0, maxSearchMs: 1, extraAfterPassMs: 0 };
  state.store.observe("classic-flex", "Casa Halcy", { price_total: 296, currency: "€" }, "rooms page");
  state.validations.push({ candidateId: "classic-flex", accepted: true, reasons: ["ok"], observed: { price_room: 296, price_total: total, price_now: 0, price_at_hotel: total, currency: "€" } });
  return state;
}

test("under the limit at the list price and over it once taxes are in: approval is refused", () => {
  // Seen live: room 296.00, tourist tax 16.00 on the payment page, limit 300.
  const state = withLimit(300, "EUR", 312);
  assert.deepEqual(overLimit(state, "classic-flex"), { total: 312, limit: 300, over: 12, room: 296, chargedNow: 0, atHotel: 312, currency: "€" });
  assert.match(approvalBlocker(state, "classic-flex")!, /312, which is 12 over the traveller's limit of 300/);
});

test("a total within the limit is not held back", () => {
  assert.equal(overLimit(withLimit(300, "EUR", 300), "classic-flex"), null);
  assert.equal(approvalBlocker(withLimit(320, "EUR", 312), "classic-flex"), null);
});

test("once the traveller accepts that exact total, approval is allowed", () => {
  const state = withLimit(300, "EUR", 312);
  state.overLimitAcceptances.push({ candidateId: "classic-flex", total: 312, limit: 300, currency: "€", at: "t" });
  assert.equal(overLimit(state, "classic-flex"), null);
  assert.equal(approvalBlocker(state, "classic-flex"), null);
});

test("a different total after that acceptance is asked about again", () => {
  const state = withLimit(300, "EUR", 312);
  state.overLimitAcceptances.push({ candidateId: "classic-flex", total: 312, limit: 300, currency: "€", at: "t" });
  state.validations.push({ candidateId: "classic-flex", accepted: true, reasons: ["ok"], observed: { price_room: 296, price_total: 320, currency: "€" } });
  assert.equal(overLimit(state, "classic-flex")!.over, 20);
  assert.match(approvalBlocker(state, "classic-flex")!, /320, which is 20 over/);
});

test("a limit in another currency is never compared with the total", () => {
  const state = withLimit(3000, "SEK", 312);
  assert.equal(overLimit(state, "classic-flex"), null);
  assert.equal(approvalBlocker(state, "classic-flex"), null);
});

test("the limit can come from the goal when the objective holds none", () => {
  const state = withLimit(300, "EUR", 312);
  state.objective = { ...state.objective!, hard: {}, currency: undefined };
  state.goal = { hotel: { name: "Casa Halcy", url: "http://h" }, checkin: "a", checkout: "b", adults: 2, mustHave: [], preferences: [], budget: { currency: "EUR", maxTotal: 300 } };
  assert.equal(overLimit(state, "classic-flex")!.over, 12);
});
