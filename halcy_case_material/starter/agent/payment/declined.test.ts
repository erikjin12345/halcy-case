// The path where the frame filter in the raw driver matters most: the card
// was declined, blind mode has ended, the tab is still on the payment page
// with the provider's frame in it, and the agent reads the hotel's error.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { PaymentBoundary } from "../tools/boundary.ts";
import { guardedDriver } from "../tools/guarded-driver.ts";
import { playwrightDriver } from "../tools/playwright-driver.ts";
import { runHandoff } from "./handoff.ts";
import { fakeChat, fakeLog, HOTEL, PAY_FRAME, tick } from "./testing.ts";

test("after a declined card, reading the hotel's error runs nothing inside the provider's frame", async () => {
  const hotelText = "Guarantee your booking\nWe're holding this room for you for 12:00\nTotal €420.00\nCharged now €0.00\nPaid at the hotel €420.00\nYour card was declined by your bank. Try another card";
  const hotelFrame = { evaluated: 0, url: () => `${HOTEL}/payment?hold=h1`, evaluate: async () => (hotelFrame.evaluated++, { text: hotelText, elements: [] }) };
  const payFrame = {
    evaluated: 0,
    url: () => PAY_FRAME,
    evaluate: async () => (payFrame.evaluated++, { text: "Card number 4000 0000 0000 0002", elements: [{ id: "1:0", tag: "input", role: null, type: "text", name: "Card number", value: "4000 0000 0000 0002", checked: null, disabled: false }] }),
  };
  const page = { frames: () => [hotelFrame, payFrame], mainFrame: () => hotelFrame, url: () => hotelFrame.url(), title: async () => "Payment", on: () => {}, bringToFront: async () => {} } as unknown as Page;

  const { log, events } = fakeLog();
  const { chat, said, press } = fakeChat();
  const boundary = new PaymentBoundary(HOTEL, log);
  const driver = guardedDriver(playwrightDriver(page, (url) => boundary.known(url)), boundary);
  const running = runHandoff({
    driver,
    boundary,
    chat,
    log,
    hotel: "Casa Halcy",
    terms: { total: 420, chargedNow: 0, dueAtHotel: 420 },
    visible: true,
    classify: async () => ({ status: "declined", hotelMessage: "Your card was declined by your bank." }),
    timing: { settleMs: 0, lastReminderMs: 30 },
  });
  await tick();
  press("Over to you", "failed");
  await tick();
  press("Try another card", "stop");
  const result = await running;

  assert.equal(result.status, "declined");
  assert.equal(boundary.blind, false);
  assert.equal(hotelFrame.evaluated, 2, "the hotel's page was read before and after the hand-off");
  assert.equal(payFrame.evaluated, 0, "the provider's frame was never entered, before, during or after");
  assert.equal(JSON.stringify([events, said]).includes("0002"), false);
});
