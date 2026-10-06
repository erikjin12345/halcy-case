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
  assert.ok(c.cards[0].lines?.includes("Total: €420.00") && c.cards[0].lines?.includes("Charged now: €0.00"), "amounts are shown the way the hotel writes them");
  assert.ok(c.cards[0].lines?.some((line) => line.startsWith("Your bank should ask you to approve €0.00 to Casa Halcy")));

  f.navigate(PAYMENT); // a reload of the payment page: not an outcome
  f.navigate("https://bank.example/3ds?token=secret"); // a bank check takes over the tab: not an outcome
  f.navigate("https://bank.example/3ds/step2"); // still away
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

test("a hotel that sends the whole tab to its provider and back to the same page with an error is read on return", async () => {
  const { f, c, boundary, deps } = setup({ ...PAGES, "/payment": `${PAGES["/payment"]}\nYour card was declined by your bank. Nothing has been charged.` });
  const running = runHandoff(deps);
  await tick();
  f.navigate("https://pay.example/checkout/abc");
  f.navigate(`${HOTEL}/payment?declined=1`); // back where it started: only an outcome because the tab had been away
  await tick();
  assert.equal(boundary.blind, false);
  assert.match(c.said.at(-1) ?? "", /did not go through\. Casa Halcy's page says: "Your card was declined by your bank\."/);
  c.press("Try another card", "stop");
  assert.equal((await running).status, "declined");
});

test("\"I'm done\" on an unsubmitted payment page sends the traveller back, then the booking still counts", async () => {
  const { f, c, l, boundary, deps } = setup();
  const running = runHandoff(deps);
  await tick();
  // Pressed before paying: the page is still the form, and the reader quotes its own sentence about the charge.
  deps.classify = async (text) => (text.includes("CH-123456") ? { status: "confirmed", reference: "CH-123456" } : { status: "unconfirmed", hotelMessage: "Charged now €0.00" });
  c.press("Over to you", "done");
  await tick(20);
  assert.match(c.said.at(-1) ?? "", /^Casa Halcy's payment page has not been submitted yet: .* nothing has been paid\. Casa Halcy holds the room for about 14 minutes more\./);
  assert.equal(boundary.blind, true, "blind again, same attempt");
  assert.equal(l.types().filter((t) => t === "handoff.blind.start").length, 2);
  f.navigate(`${HOTEL}/confirmation/CH-123456`);
  assert.equal((await running).status, "confirmed");
});

test("after the resumes are used up, \"I'm done\" on the form ends as unconfirmed", async () => {
  const { c, deps } = setup(PAGES, { timing: { settleMs: 0, lastReminderMs: 50, maxResumes: 1 } });
  const running = runHandoff(deps);
  await tick();
  c.press("Over to you", "done");
  await tick(20);
  c.press("Over to you", "done");
  assert.equal((await running).status, "unconfirmed");
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
  const tooShort = await runHandoff(short.deps);
  assert.deepEqual([tooShort.status, tooShort.cause], ["not_started", "hold_short"]);
  assert.match(tooShort.reason ?? "", /^3 minutes are left on Casa Halcy's hold/);

  const gone = setup({ "/payment": PAGES["/payment"].replace("We're holding this room for you for 14:20", "Your hold has expired") });
  const expired = await runHandoff(gone.deps);
  assert.deepEqual([expired.status, expired.cause], ["not_started", "hold_expired"], "an expired hold is not mistaken for a page without a clock");
  assert.match(expired.reason ?? "", /no longer holding the room\. Its page says: "Your hold has expired"/);

  const moved = setup({ "/payment": PAGES["/payment"].replaceAll("420", "470") });
  const result = await runHandoff(moved.deps);
  assert.equal(result.cause, "amounts_changed");
  assert.equal(result.reason, "the page no longer matches what you agreed to. Total: you agreed to 420, the page now shows €470.00; Paid at the hotel: you agreed to 420, the page now shows €470.00");

  const headless = setup(PAGES, { visible: false });
  assert.deepEqual([(await runHandoff(headless.deps)).status, (await runHandoff(headless.deps)).cause], ["not_started", "no_window"]);
  for (const s of [short, gone, moved, headless]) {
    assert.equal(s.l.types().includes("handoff.blind.start"), false, "blind mode never started");
    assert.equal(s.f.calls.front, 0);
    assert.match(s.c.said[0], /Nothing is booked and you have not been asked to pay/);
  }
});

test("without a clock on the page the hold comes from validation, and an unknown hold never gets the long default", async () => {
  const worded = PAGES["/payment"].replace("We're holding this room for you for 14:20", "We are holding your room for 10 minutes");
  const start = (s: ReturnType<typeof setup>) => s.l.events.find((e) => e.type === "handoff.start")?.data;

  // Validation read 9 minutes, 3 minutes ago: 6 minutes are left, the wait ends a minute before that.
  /** Starts a hand-off, lets it reach the wait, and returns a way to end it so no timer outlives the test. */
  const begin = async (s: ReturnType<typeof setup>) => {
    const running = runHandoff(s.deps);
    await tick();
    return async () => (s.c.press("Over to you", "cancel"), void (await running));
  };
  const reported = setup({ ...PAGES, "/payment": worded }, { holdReport: { secondsLeft: 540, at: Date.now() - 180_000 } });
  const endReported = await begin(reported);
  assert.deepEqual([start(reported)?.holdSecondsLeft, start(reported)?.waitSeconds, start(reported)?.holdFromPage], [360, 300, false]);
  assert.deepEqual([start(reported)?.minHoldSeconds, start(reported)?.marginSeconds], [300, 60], "the thresholds used are in the log");
  assert.ok(reported.c.cards[0].lines?.includes("Room held for about 6 minutes."));
  await endReported();

  // The stated length caps a report that is too generous, and too little time is still a refusal.
  const stale = setup({ ...PAGES, "/payment": worded }, { holdReport: { secondsLeft: 900, at: Date.now() - 480_000 } });
  assert.equal((await runHandoff(stale.deps)).cause, "hold_short");

  // Nobody could put a number on it: 5 minutes, not 10, and the traveller is told why.
  const unknown = setup({ ...PAGES, "/payment": PAGES["/payment"].replace("We're holding this room for you for 14:20", "We're holding this room for you") });
  const endUnknown = await begin(unknown);
  assert.deepEqual([start(unknown)?.holdUnknown, start(unknown)?.waitSeconds], [true, 300]);
  assert.ok(unknown.c.cards[0].lines?.some((line) => line.startsWith("Hold time not stated; I'll wait about 5 minutes")));
  await endUnknown();

  // A page that says nothing about a hold keeps the long default.
  const none = setup({ ...PAGES, "/payment": PAGES["/payment"].replace("We're holding this room for you for 14:20\n", "") });
  const endNone = await begin(none);
  assert.deepEqual([start(none)?.holdUnknown, start(none)?.waitSeconds], [false, 600]);
  await endNone();
});

test("silence ends at the deadline, with reminders, and claims nothing about money", async () => {
  const { c, l, deps } = setup({ "/payment": PAGES["/payment"].replace("14:20", "5:00") }, { timing: { settleMs: 0, lastReminderMs: 20, marginSeconds: 299.9, minHoldSeconds: 60 } });
  const result = await runHandoff(deps); // deadline = 300 s - 299.9 s = 100 ms
  assert.equal(result.status, "timed_out");
  assert.equal(c.said.length, 3, "two reminders and the result");
  assert.match(c.said[2], /I can't see a booking on Casa Halcy's site\. If you confirmed a payment/);
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
  assert.match(crashed.c.said.at(-1) ?? "", /check with Casa Halcy before trying again/);

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
