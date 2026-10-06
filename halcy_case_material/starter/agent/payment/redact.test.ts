import { test } from "node:test";
import assert from "node:assert/strict";
import type { Observation, PageElement } from "../../browser.ts";
import { PaymentBoundary } from "../tools/boundary.ts";
import { BoundaryError, guardedDriver } from "../tools/guarded-driver.ts";
import { redactObservation, redactText, WITHHELD } from "./redact.ts";
import { fakeLog, fakeRaw, HOTEL } from "./testing.ts";

const CARD = "4242 4242 4242 4242";
const field = (id: string, name: string, value: string, type = "text"): PageElement => ({ id, frameUrl: `${HOTEL}/pay`, tag: "input", role: null, type, name, value, checked: null, disabled: false });

// A hotel that puts the card fields on its own page: the origin allowlist does not help here.
const inline: Observation = {
  url: `${HOTEL}/pay`,
  title: "Pay",
  text: [{ frameUrl: `${HOTEL}/pay`, text: `Total €420.00\nYou typed ${CARD}\nReference CH-123456` }],
  elements: [field("0:0", "Email", "maja.lind@example.com"), field("0:1", "Card number", CARD), field("0:2", CARD, CARD), field("0:3", "CVC", "123"), field("0:4", "Expiry (MM/YY)", "12/30"), field("0:5", "Password", "hunter2", "password")],
};

test("card, code and password fields on the hotel's own page are emptied, by label or by content", () => {
  const { seen, sensitive } = redactObservation(inline);
  const dump = JSON.stringify(seen);
  assert.equal(dump.includes("4242"), false, "no card number, in a value, a name or the text");
  assert.equal(dump.includes("hunter2"), false);
  assert.deepEqual([...sensitive], ["0:1", "0:2", "0:3", "0:4", "0:5"]);
  assert.equal(seen.elements[2].name, WITHHELD, "a field with no label is named by its value in the starter");
  assert.equal(seen.elements[0].value, "maja.lind@example.com", "ordinary fields are untouched");
  assert.ok(dump.includes("€420.00") && dump.includes("CH-123456"), "amounts and references stay");
});

test("the last four digits on a confirmation page are masked", () => {
  assert.equal(redactText("€420.00 was charged to the card ending 4242."), "€420.00 was charged to the card ending ••••.");
  assert.equal(redactText("Card ends in 0002, last four digits: 0002"), "Card ends in ••••, last four digits: ••••");
  assert.equal(redactText("Booking CH-424242 for 2026-11-13, 2 guests, room 1204"), "Booking CH-424242 for 2026-11-13, 2 guests, room 1204");
  // The formats real hotel and payment pages use: a masked prefix, then the digits.
  assert.equal(redactText("Paid with •••• 4242"), "Paid with •••• ••••");
  assert.equal(redactText("Card: **** **** **** 4242"), "Card: **** **** **** ••••");
  assert.equal(redactText("Visa xxxx-xxxx-xxxx-4242"), "Visa xxxx-xxxx-xxxx-••••");
  assert.equal(redactText("Card ****4242 (Mastercard XXXX XXXX XXXX 0002)"), "Card ****•••• (Mastercard XXXX XXXX XXXX ••••)");
  for (const kept of ["Total €4242", "Maxx 2024 offer", "2 x 2026 rate", "Ref **A1234"]) assert.equal(redactText(kept), kept);
});

test("a star rating or a footnote mark before a number is not a card, unless a card word is near", () => {
  // One run of asterisks or x, a space, four digits: left alone without a card word nearby.
  for (const kept of ["Rating: ***** 2024 winner", "Hotel **** 2025 award", "Total: ** 1200 per stay", "Size xxxx 1200 mm"]) assert.equal(redactText(kept), kept);
  // The same shape is masked when the text just before it says it is a card.
  assert.equal(redactText("Card: **** 4242"), "Card: **** ••••");
  assert.equal(redactText("Payment method\nVisa\n**** 2024"), "Payment method\nVisa\n**** ••••");
  assert.equal(redactText("Betalt med kort xxxx 4242"), "Betalt med kort xxxx ••••");
  assert.equal(redactText("Charged to **** 0002 on arrival"), "Charged to **** •••• on arrival");
  // Never weak, card word or not: bullets, several groups, a mask that touches the digits.
  assert.equal(redactText("•••• 2024"), "•••• ••••");
  assert.equal(redactText("**** **** 2024"), "**** **** ••••");
  assert.equal(redactText("****2024"), "****••••");
  assert.equal(redactText("xxxx-2024"), "xxxx-••••");
  // A card word further back than the context window does not count.
  assert.equal(redactText(`Visa is accepted. ${"Breakfast is served from seven. ".repeat(4)}Rated ***** 2024`).endsWith("***** 2024"), true);
});

test("the guarded driver redacts every observation and refuses to act on a sensitive field", async () => {
  const f = fakeRaw({}, `${HOTEL}/pay`);
  f.raw.observe = async () => inline;
  const driver = guardedDriver(f.raw, new PaymentBoundary(HOTEL, fakeLog().log));
  assert.equal(JSON.stringify(await driver.observe()).includes("4242"), false);
  await assert.rejects(driver.act({ kind: "fill", id: "0:1", value: "x" }), BoundaryError);
  await assert.rejects(driver.act({ kind: "click", id: "0:3" }), BoundaryError);
  assert.equal(f.calls.act, 0);
  await driver.act({ kind: "fill", id: "0:0", value: "a@b.c" });
  assert.equal(f.calls.act, 1, "ordinary fields can still be filled");
});
