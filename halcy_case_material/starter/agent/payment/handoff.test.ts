import { test } from "node:test";
import assert from "node:assert/strict";
import { PaymentBoundary } from "../tools/boundary.ts";
import { guardedDriver } from "../tools/guarded-driver.ts";
import { runHandoff, type HandoffDeps } from "./handoff.ts";
import type { Classify } from "./outcome.ts";
import { fakeChat, fakeLog, fakeRaw, HOTEL, tick } from "./testing.ts";

const PAYMENT = `${HOTEL}/payment?hold=h1`;
const PAGES = {
  "/payment": "Guarantee your booking\nWe're holding this room for you for 14:20\nSuperior, flexible rate\nTotal €420.00\nCharged now €0.00\nPaid at the hotel €420.00",
  "/confirmation/CH-123456": "You're booked, Maja\nBooking reference\nCH-123456\nTotal €420.00\nThe card ending 4242 is held as a guarantee. Nothing has been charged.",
};
const TERMS = { room: "Superior", total: 420, chargedNow: 0, dueAtHotel: 420, cancellable: true };
const classify: Classify = async (text) =>
  text.includes("CH-123456") ? { status: "confirmed", reference: "CH-123456", total: "€420.00" } : text.includes("declined") ? { status: "declined", hotelMessage: "Your card was declined by your bank." } : { status: "unconfirmed" };

function setup(pages: Record<string, string> = PAGES, over: Partial<HandoffDeps> = {}) {
  const f = fakeRaw(pages, PAYMENT);
  const l = fakeLog();
  const c = fakeChat();
  const boundary = new PaymentBoundary(HOTEL, l.log);
  const deps: HandoffDeps = { driver: guardedDriver(f.raw, boundary), boundary, chat: c.chat, log: l.log, hotel: "Casa Halcy", terms: TERMS, visible: true, classify, timing: { settleMs: 0, lastReminderMs: 50 }, ...over };
  return { f, l, c, boundary, deps };
}

test("happy path: one look before, none while the traveller pays, one look after", async () => {
  const { f, l, c, boundary, deps } = setup();
  const running = runHandoff(deps);
  await tick();
  assert.equal(boundary.blind, true);
  assert.deepEqual(f.calls, { observe: 1, act: 0, goto: 0, screenshot: 0, front: 1 }, "the window was brought forward after a single read");
  assert.match(c.cards[0].title, /pay at Casa Halcy/);
  assert.ok(c.cards[0].lines?.some((line) => line.includes("Halcy never sees your card")));

  f.navigate("https://bank.example/3ds?token=secret"); // a bank check takes over the tab: not an outcome
  f.navigate(PAYMENT); // back on the payment page: not an outcome either
  await tick();
  assert.equal(boundary.blind, true);
  assert.equal(f.calls.observe, 1, "still nothing read");

  f.navigate(`${HOTEL}/confirmation/CH-123456`);
  const result = await running;
  assert.deepEqual(result, { status: "confirmed", reference: "CH-123456", amounts: { total: "€420.00", chargedNow: undefined, dueAtHotel: undefined }, retryable: false });
  assert.equal(boundary.blind, false);
  assert.equal(f.calls.observe, 2);
  assert.match(c.said.at(-1) ?? "", /You're booked with Casa Halcy\. Booking reference CH-123456/);
  assert.deepEqual(l.types(), ["handoff.start", "handoff.blind.start", "handoff.wait", "handoff.away", "handoff.signal", "handoff.blind.end", "payment.outcome", "payment.result"]);
  const dump = JSON.stringify(l.events);
  assert.equal(dump.includes("secret") || dump.includes("hold=h1"), false, "no query string reaches the log");
  assert.equal(dump.includes("4242"), false, "the last four digits never reach the log");
});

test("a declined card can be retried, and the retry reloads the page", async () => {
  const { f, c, boundary, deps } = setup({ ...PAGES, "/payment": `${PAGES["/payment"]}\nYour card was declined by your bank. Try another card` });
  const running = runHandoff(deps);
  await tick();
  c.press("Over to you", "failed");
  await tick();
  assert.equal(boundary.blind, false);
  assert.match(c.said.at(-1) ?? "", /did not go through\. Casa Halcy's page says: "Your card was declined by your bank\." Nothing is booked\./);
  c.press("Try another card", "retry");
  await tick();
  assert.equal(f.calls.goto, 1, "reloaded for a fresh payment form");
  assert.equal(boundary.blind, true, "handed over again");
  f.navigate(`${HOTEL}/confirmation/CH-123456`);
  assert.equal((await running).status, "confirmed");
});

test("the traveller is never handed a page that changed or a hold that is about to run out", async () => {
  const short = setup({ "/payment": PAGES["/payment"].replace("14:20", "3:10") });
  assert.equal((await runHandoff(short.deps)).status, "not_started");
  const moved = setup({ "/payment": PAGES["/payment"].replaceAll("420", "470") });
  const result = await runHandoff(moved.deps);
  assert.match(result.reason ?? "", /no longer shows the amounts you agreed to \(420, 420\)/);
  const headless = setup(PAGES, { visible: false });
  assert.equal((await runHandoff(headless.deps)).status, "not_started");
  for (const s of [short, moved, headless]) {
    assert.equal(s.l.types().includes("handoff.blind.start"), false, "blind mode never started");
    assert.equal(s.f.calls.front, 0);
    assert.match(s.c.said[0], /Nothing is booked and you have not been asked to pay/);
  }
});

test("silence ends at the deadline, with reminders, and claims nothing about money", async () => {
  const { c, l, deps } = setup({ "/payment": PAGES["/payment"].replace("14:20", "5:00") }, { timing: { settleMs: 0, lastReminderMs: 20, marginSeconds: 299.9, minHoldSeconds: 60 } });
  const result = await runHandoff(deps); // deadline = 300 s - 299.9 s = 100 ms
  assert.equal(result.status, "timed_out");
  assert.equal(c.said.length, 3, "two reminders and the result");
  assert.match(c.said[2], /I can't see a booking on Casa Halcy's site\. I can't see your card or your bank/);
  assert.equal(c.said[2].includes("nothing was charged"), false);
  assert.deepEqual(l.events.find((e) => e.type === "handoff.blind.end")?.data.outcome, "deadline");
});

test("a closed window, a cancel and a crash all close the blind interval", async () => {
  const closed = setup();
  const a = runHandoff(closed.deps);
  await tick();
  closed.f.closeTab();
  assert.equal((await a).status, "session_lost");
  assert.equal(closed.f.calls.observe, 1, "a closed window is not read");

  const cancelled = setup();
  const b = runHandoff(cancelled.deps);
  await tick();
  cancelled.c.press("Over to you", "cancel");
  assert.equal((await b).status, "cancelled");

  const crashed = setup();
  crashed.f.raw.bringToFront = async () => Promise.reject(new Error("no window"));
  assert.equal((await runHandoff(crashed.deps)).status, "unconfirmed", "after the hand-off began, a failure is never 'nothing was paid'");
  assert.equal(crashed.boundary.blind, false);
  assert.deepEqual(crashed.l.events.find((e) => e.type === "handoff.blind.end")?.data.outcome, "aborted");
  assert.match(crashed.c.said.at(-1) ?? "", /I can't see your card or your bank/);

  const early = setup();
  early.f.raw.observe = async () => Promise.reject(new Error("page crashed"));
  assert.equal((await runHandoff(early.deps)).status, "not_started", "before it began, nothing was asked of the traveller");
  assert.equal(early.l.types().includes("handoff.blind.start"), false);
});

test("without a model, code still recognises the hotel's confirmation, and nothing else", async () => {
  const { f, deps } = setup(PAGES, { classify: async () => Promise.reject(new Error("credit balance is too low")) });
  const running = runHandoff(deps);
  await tick();
  f.navigate(`${HOTEL}/confirmation/CH-123456`);
  assert.deepEqual(await running, { status: "confirmed", reference: "CH-123456", amounts: { total: undefined, chargedNow: undefined, dueAtHotel: undefined }, retryable: false });

  const declined = setup({ ...PAGES, "/payment": `${PAGES["/payment"]}\nYour card was declined by your bank.` }, { classify: async () => Promise.reject(new Error("down")) });
  const second = runHandoff(declined.deps);
  await tick();
  declined.c.press("Over to you", "failed");
  assert.equal((await second).status, "unconfirmed", "a decline is not guessed at");
});
