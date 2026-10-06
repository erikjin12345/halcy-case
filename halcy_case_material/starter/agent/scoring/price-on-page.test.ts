// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPriceOnPage, currenciesOnPage, chargeCurrencyStated } from "./price-on-page.ts";

// Sentences as the second mock hotel writes them, and as Casa Halcy does.
const AURORA = [
  "Garden double · 2 nights",
  "£140.00 for the stay (about €164 as a guide)",
  "Visitor levy £10.00 per stay, not included",
  "Prices are shown in euros as a guide only. We charge in pounds sterling.",
].join("\n");
const AURORA_EURO_FIRST = ["Garden double", "approx. €164", "£140.00 for 2 nights", "We charge in GBP."].join("\n");
const CASA = ["Classic double", "Flexible €336.00", "Saver, non-refundable €295.68", "2 nights, room only"].join("\n");
const TWO_UNMARKED = ["Loft €200.00", "Loft £170.00"].join("\n");

test("the currency is read from the page, next to the recorded figure", () => {
  assert.deepEqual(checkPriceOnPage(AURORA, 140), { ok: true, currency: "£" });
  assert.deepEqual(checkPriceOnPage(CASA, 295.68), { ok: true, currency: "€" });
});

test("a guide figure is never accepted as the price", () => {
  const r = checkPriceOnPage(AURORA, 164);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /only as a guide/);
  assert.equal(checkPriceOnPage(AURORA_EURO_FIRST, 164).ok, false);
  assert.deepEqual(checkPriceOnPage(AURORA_EURO_FIRST, 140), { ok: true, currency: "£" });
});

test("a figure that is not on the page is refused", () => {
  const r = checkPriceOnPage(CASA, 300);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /not on the page you read/);
});

test("two currencies and no statement of which is charged: no choice is made", () => {
  assert.deepEqual(currenciesOnPage(TWO_UNMARKED), ["€", "£"]);
  const r = checkPriceOnPage(TWO_UNMARKED, 200);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /does not say which is charged/);
  // The model naming the charge currency settles it, and code still checks the figure is written in it.
  assert.deepEqual(checkPriceOnPage(TWO_UNMARKED, 170, "GBP"), { ok: true, currency: "£" });
  assert.equal(checkPriceOnPage(TWO_UNMARKED, 200, "GBP").ok, false);
});

test("a single-currency page is unaffected", () => {
  assert.deepEqual(currenciesOnPage(CASA), ["€"]);
  assert.equal(chargeCurrencyStated(CASA), undefined);
  assert.deepEqual(checkPriceOnPage(CASA, 336), { ok: true, currency: "€" });
});

test("the charge sentence is recognised in words and in codes", () => {
  assert.equal(chargeCurrencyStated(AURORA), "pounds");
  assert.equal(chargeCurrencyStated(AURORA_EURO_FIRST), "GBP");
});

test("a stay priced per night: the total is accepted when the night price is on the page", () => {
  const page = "Loft · £175.00 per night\nWe charge in pounds sterling.";
  assert.deepEqual(checkPriceOnPage(page, 700, undefined, 4), { ok: true, currency: "£" });
  assert.equal(checkPriceOnPage(page, 710, undefined, 4).ok, false);
  assert.equal(checkPriceOnPage(page, 700).ok, false);
});
