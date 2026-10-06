// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { contradictions } from "./consistency.ts";

const flex = { rate_name: "Flexible", price_total: 444, price_now: 0, price_at_hotel: 444, cancellable: true };
const saver = { rate_name: "Saver", price_total: 390.72, price_now: 390.72, price_at_hotel: 0, cancellable: false };

test("the page of the same rate, with tourist tax added at the hotel, does not contradict", () => {
  assert.deepEqual(contradictions(flex, { price_total: 456, price_now: 0, price_at_hotel: 456, cancellable: true }), []);
  assert.deepEqual(contradictions(saver, { price_total: 402.72, price_now: 390.72, price_at_hotel: 12, cancellable: false }), []);
});

test("a pay-now rate with a paid add-on charged now does not contradict", () => {
  // Example ask 2: breakfast is charged now together with the room.
  assert.deepEqual(contradictions({ price_now: 320.32, cancellable: false }, { price_now: 416.32, price_at_hotel: 24, cancellable: false }), []);
});

test("validating the flexible rate on a page that shows the saver rate is caught", () => {
  // Seen in a scripted run of example ask 3: the page charged 390.72 now and the agent still reported accepted.
  const found = contradictions(flex, { price_total: 402.72, price_now: 390.72, price_at_hotel: 12, cancellable: false });
  assert.equal(found.length, 2);
  assert.match(found[0], /can be cancelled, but the page shows a rate that cannot/);
  assert.match(found[1], /charges nothing now, but the page charges 390.72 now/);
});

test("the reverse is caught too", () => {
  assert.equal(contradictions(saver, { price_now: 0, price_at_hotel: 456, cancellable: true }).length, 2);
});

test("facts the agent did not report are not held against the candidate", () => {
  assert.deepEqual(contradictions(flex, { price_total: 456 }), []);
  assert.deepEqual(contradictions({}, { price_now: 390.72, cancellable: false }), []);
});

test("a payment page that charges in another currency than the room list is caught", () => {
  const found = contradictions({ ...flex, currency: "€" }, { price_total: 4990, price_now: 0, cancellable: true, currency: "SEK" });
  assert.deepEqual(found, ["the candidate was priced in €, but the page charges in SEK"]);
});

test("the same currency written two ways does not contradict", () => {
  assert.deepEqual(contradictions({ ...flex, currency: "€" }, { price_now: 0, cancellable: true, currency: "EUR" }), []);
  assert.deepEqual(contradictions({ ...flex, currency: "EUR" }, { price_now: 0, cancellable: true }), []);
});
