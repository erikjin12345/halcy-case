import { test } from "node:test";
import assert from "node:assert/strict";
import { appearsOnPage, holdSecondsFrom, missingAmounts, parseMoney, shownAs } from "./page-facts.ts";

test("the hold clock is read only from a line that talks about a hold", () => {
  assert.equal(holdSecondsFrom("Payment\nWe're holding this room for you for 14:32\nTotal €420.00"), 872);
  assert.equal(holdSecondsFrom("Your reservation expires in 4:05"), 245);
  assert.equal(holdSecondsFrom("Check-in from 15:00, check-out by 11:00"), undefined);
  assert.equal(holdSecondsFrom("Your hold has expired"), undefined);
});

test("money is parsed in the formats hotels use", () => {
  assert.equal(parseMoney("€420.00"), 420);
  assert.equal(parseMoney("1,234.56"), 1234.56);
  assert.equal(parseMoney("1.234,56 €"), 1234.56);
  assert.equal(parseMoney("358,00"), 358);
  assert.equal(parseMoney("1,234"), 1234);
  assert.equal(parseMoney("EUR"), undefined);
});

test("the amounts the traveller agreed to must still be on the page", () => {
  const page = "Superior, flexible rate\nRoom €412.00\nTourist tax €8.00\nTotal €420.00\nCharged now €0.00\nPaid at the hotel €420.00";
  assert.deepEqual(missingAmounts(page, [420, 0, "€420.00", undefined]), []);
  assert.deepEqual(missingAmounts(page.replaceAll("420", "470"), [420, 0, 420]), [420, 420]);
});

test("an amount is shown the way the hotel writes it", () => {
  const page = "Room €404.00\nTotal €420.00\nCharged now €0.00\nDeposit 1.234,50 EUR\nUSD 99";
  assert.equal(shownAs(page, 420), "€420.00");
  assert.equal(shownAs(page, 0), "€0.00");
  assert.equal(shownAs(page, "1234.5"), "1.234,50 EUR");
  assert.equal(shownAs(page, 99), "USD 99");
  assert.equal(shownAs(page, 555), undefined);
});

test("a quote counts only if the page shows it", () => {
  assert.equal(appearsOnPage("Your card was\n declined by your bank.", "Your card was declined by your bank."), true);
  assert.equal(appearsOnPage("Payment", "You are booked"), false);
  assert.equal(appearsOnPage("anything", "  "), false);
});
