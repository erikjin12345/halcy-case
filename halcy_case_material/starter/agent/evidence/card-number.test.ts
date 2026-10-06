import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeCard, luhn, redactCardNumbers, REDACTED } from "./card-number.ts";

test("the mock's test cards are detected in every common spelling", () => {
  for (const s of ["4242424242424242", "4242 4242 4242 4242", "4242-4242-4242-4242", "4000 0000 0000 0002"]) {
    assert.ok(looksLikeCard(`number: ${s}`), s);
  }
});

test("ordinary numbers are not card numbers", () => {
  assert.equal(luhn("1234567890123"), false);
  assert.equal(looksLikeCard("€239.00 for 2 nights, ref CH-4f2a9c, +351 21 123 4567"), false);
  assert.equal(looksLikeCard("2026-10-06T11:42:00.000Z"), false);
});

test("redactCardNumbers walks nested data and reports it", () => {
  const input = { observation: { text: [{ frameUrl: "http://localhost:4101/fields", text: "Card 4242 4242 4242 4242 exp 12/30" }] }, n: 1 };
  const { data, redacted } = redactCardNumbers(input);
  assert.equal(redacted, true);
  assert.equal(data.observation.text[0].text, `Card ${REDACTED} exp 12/30`);
  assert.equal(data.n, 1);
  assert.equal(input.observation.text[0].text.includes("4242"), true, "input is not mutated");
  assert.equal(redactCardNumbers({ total: "€358.00" }).redacted, false);
});
