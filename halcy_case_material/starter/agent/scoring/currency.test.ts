// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { currenciesOf, sameCurrency } from "./currency.ts";

test("a symbol and its code are the same currency", () => {
  assert.equal(sameCurrency("€", "EUR"), true);
  assert.equal(sameCurrency("eur", "€"), true);
  assert.equal(sameCurrency("£", "GBP"), true);
  assert.equal(sameCurrency("euros", "EUR"), true);
});

test("different currencies are different, however they are written", () => {
  assert.equal(sameCurrency("SEK", "EUR"), false);
  assert.equal(sameCurrency("kr", "€"), false);
  assert.equal(sameCurrency("USD", "EUR"), false);
  assert.equal(sameCurrency("SEK", "NOK"), false);
});

test("an ambiguous symbol is compatible with every currency it can mean", () => {
  // "$" on a page does not say which dollar. It is not treated as a mismatch with USD or CAD.
  assert.equal(sameCurrency("$", "USD"), true);
  assert.equal(sameCurrency("$", "CAD"), true);
  assert.equal(sameCurrency("kr", "SEK"), true);
  assert.equal(sameCurrency("kr.", "DKK"), true);
  assert.equal(sameCurrency("US$", "CAD"), false);
});

test("an unknown form means only itself", () => {
  assert.deepEqual(currenciesOf("XTS"), ["XTS"]);
  assert.equal(sameCurrency("XTS", "xts"), true);
  assert.equal(sameCurrency("XTS", "EUR"), false);
  assert.deepEqual(currenciesOf("  "), []);
});
