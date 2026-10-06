// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import type { Card } from "../../types.ts";
import { newRunState, type AgentContext } from "../types.ts";
import { ACCEPT, DECLINE, money, priceChangeCard, priceChangeTool } from "./price-change.ts";

type Runnable = { run: (input: unknown) => Promise<string> };

function context(press: string) {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "Casa Halcy", url: "http://h" }, checkin: "2026-10-12", checkout: "2026-10-18", adults: 2, mustHave: [], preferences: [] };
  state.store.observe("classic-flex", "Casa Halcy", { price_total: 928, currency: "€" }, "rooms page");
  state.validations.push({ candidateId: "classic-flex", accepted: false, reasons: ["price changed"], observed: { price_room: 1000, price_total: 1048, price_now: 0, price_at_hotel: 1048 } });
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const cards: Card[] = [];
  const a = {
    state,
    log: { event: (type: string, data: Record<string, unknown> = {}) => events.push({ type, data }) },
    chat: { choose: async (card: Card) => (cards.push(card), press) },
  } as unknown as AgentContext;
  return { a, state, events, cards, tool: priceChangeTool(a) as unknown as Runnable };
}

test("amounts are written with the currency as the hotel writes it", () => {
  assert.equal(money(1000, "€"), "€1000.00");
  assert.equal(money(1000, "EUR"), "1000.00 EUR");
  assert.equal(money(1000), "1000.00");
});

test("the card names both room prices, the total, and the hotel as the one who set the price", () => {
  const card = priceChangeCard("Casa Halcy", { was: 928, now: 1000, total: 1048, chargedNow: 0, atHotel: 1048, currency: "€" });
  assert.equal(card.title, "Casa Halcy's price has gone up");
  assert.ok(card.lines!.includes("Room when I found it: €928.00"));
  assert.ok(card.lines!.includes("Room now, on Casa Halcy's own payment page: €1000.00"));
  assert.ok(card.lines!.includes("Total now: €1048.00"));
  assert.deepEqual(card.buttons.map((b) => b.id), [ACCEPT, DECLINE]);
  assert.equal(card.buttons[0].label, "Yes, continue at €1048.00");
});

test("an accepted price is recorded with both figures and logged", async () => {
  const { tool, state, events, cards } = context(ACCEPT);
  const out = await tool.run({ candidateId: "classic-flex" });
  assert.match(out, /^accepted/);
  assert.equal(cards.length, 1);
  assert.deepEqual({ ...state.priceAcceptances[0], at: "" }, { candidateId: "classic-flex", was: 928, now: 1000, total: 1048, currency: "€", at: "" });
  const logged = events.find((e) => e.type === "price.accepted")!;
  assert.equal(logged.data.was, 928);
  assert.equal(logged.data.now, 1000);
});

test("a declined price records nothing", async () => {
  const { tool, state, events } = context(DECLINE);
  assert.match(await tool.run({ candidateId: "classic-flex" }), /^declined/);
  assert.equal(state.priceAcceptances.length, 0);
  assert.ok(events.some((e) => e.type === "price.declined"));
});

test("the traveller is not asked when there is nothing to accept", async () => {
  const { tool, state, cards } = context(ACCEPT);
  state.validations[0].observed.price_room = 928;
  assert.match(await tool.run({ candidateId: "classic-flex" }), /^Refused: .*has not changed/);
  assert.equal(cards.length, 0);
});
