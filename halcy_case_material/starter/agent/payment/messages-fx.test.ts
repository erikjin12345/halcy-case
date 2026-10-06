import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEcb } from "../scoring/fx.ts";
import { handoffCard } from "./messages.ts";

const rates = parseEcb("<Cube time='2026-10-05'><Cube currency='SEK' rate='11.2525'/></Cube>")!;
const terms = { room: "Superior Double", total: 706.24, chargedNow: 658.24, dueAtHotel: 48, cancellable: false, currency: "€" };

test("the hand-off card shows each amount with a short estimate and the note once, last", () => {
  const lines = handoffCard("Casa Halcy", terms, 600, undefined, { to: "SEK", rates }).lines ?? [];
  assert.ok(lines.includes("Total: 706.24 (≈ 7,947 kr)"));
  assert.ok(lines.includes("Charged now: 658.24 (≈ 7,407 kr)"));
  assert.ok(lines.includes("Paid at the hotel: 48 (≈ 540 kr)"));
  assert.equal(lines.at(-1), "≈ estimate at the ECB rate of 5 Oct");
  assert.equal(lines.filter((l) => l.includes("estimate")).length, 1, "the note appears once");
});

test("no traveller currency or the hotel's own currency: no estimate and no note", () => {
  for (const fx of [undefined, { to: undefined, rates }, { to: "EUR", rates }]) {
    const lines = handoffCard("Casa Halcy", terms, 600, undefined, fx).lines ?? [];
    assert.equal(lines.some((l) => l.includes("≈")), false);
  }
});
