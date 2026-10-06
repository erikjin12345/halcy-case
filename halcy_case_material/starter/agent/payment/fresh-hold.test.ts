import { test } from "node:test";
import assert from "node:assert/strict";
import { PaymentBoundary } from "../tools/boundary.ts";
import { guardedDriver } from "../tools/guarded-driver.ts";
import { revalidationNote, runPayment, termChanges } from "./fresh-hold.ts";
import type { HandoffDeps } from "./handoff.ts";
import { fakeChat, fakeLog, fakeRaw, HOTEL, tick } from "./testing.ts";
import type { Terms } from "./types.ts";

const page = (clock: string, total = "420") =>
  `Guarantee your booking\n${clock}\nSuperior, flexible rate\nTotal €${total}.00\nCharged now €0.00\nPaid at the hotel €${total}.00`;
const FRESH_CLOCK = "We're holding this room for you for 14:50";
const TERMS: Terms = { room: "Superior", total: 420, chargedNow: 0, dueAtHotel: 420, cancellable: true };
const CONFIRMATION = "You're booked, Maja\nBooking reference\nCH-123456\nTotal €420.00";

function setup(payment: string, visible = true) {
  const pages: Record<string, string> = { "/payment": payment, "/confirmation/CH-123456": CONFIRMATION };
  const f = fakeRaw(pages, `${HOTEL}/payment?hold=h1`);
  const l = fakeLog();
  const c = fakeChat();
  const boundary = new PaymentBoundary(HOTEL, l.log);
  const deps: HandoffDeps = {
    driver: guardedDriver(f.raw, boundary),
    boundary,
    chat: c.chat,
    log: l.log,
    hotel: "Casa Halcy",
    terms: TERMS,
    visible,
    classify: async (text) => (text.includes("CH-123456") ? { status: "confirmed", reference: "CH-123456" } : { status: "unconfirmed" }),
    timing: { settleMs: 0, lastReminderMs: 50 },
  };
  return { pages, f, l, c, boundary, deps };
}

test("a hold that ran down is renewed and the traveller is handed the page without asking again", async () => {
  const s = setup(page("We're holding this room for you for 2:05"));
  let validations = 0;
  const running = runPayment(s.deps, async () => (validations++, (s.pages["/payment"] = page(FRESH_CLOCK)), TERMS));
  await tick();
  assert.equal(validations, 1);
  assert.match(s.c.said[0], /2 minutes are left on Casa Halcy's hold/);
  assert.match(s.c.said[1], /hold the same room again and check the price once more/);
  assert.equal(s.boundary.blind, true, "same figures: straight to the hand-off");
  assert.equal(s.c.cards.some((card) => card.title.includes("price has changed")), false);
  s.f.navigate(`${HOTEL}/confirmation/CH-123456`);
  assert.equal((await running).status, "confirmed");
});

test("a changed price is put in front of the traveller, old and new, and nothing continues without a press", async () => {
  const s = setup("Your hold has expired\nTotal €420.00\nCharged now €0.00\nPaid at the hotel €420.00");
  const fresh: Terms = { ...TERMS, total: "€470.00", dueAtHotel: "€470.00" };
  const running = runPayment(s.deps, async () => ((s.pages["/payment"] = page(FRESH_CLOCK, "470")), fresh));
  await tick();
  const card = s.c.cards.find((c) => c.title === "Casa Halcy's price has changed");
  assert.deepEqual(card?.lines?.slice(0, 2), ["Total: was 420, is now €470.00", "Paid at the hotel: was 420, is now €470.00"]);
  assert.equal(s.boundary.blind, false, "not handed over while the question is open");
  s.c.press("Casa Halcy's price has changed", "continue");
  await tick();
  assert.equal(s.boundary.blind, true);
  assert.ok(s.c.cards.at(-1)?.lines?.includes("Total: €470.00"), "the hand-off card carries the new figure");
  s.f.navigate(`${HOTEL}/confirmation/CH-123456`);
  await running;

  const declined = setup(page("We're holding this room for you for 1:00"));
  const second = runPayment(declined.deps, async () => ((declined.pages["/payment"] = page(FRESH_CLOCK, "470")), fresh));
  await tick();
  declined.c.press("Casa Halcy's price has changed", "stop");
  const result = await second;
  assert.deepEqual([result.status, result.cause], ["not_started", "change_declined"]);
  assert.equal(declined.l.types().includes("handoff.blind.start"), false);
});

test("if the room cannot be confirmed again the run stops and says so", async () => {
  const s = setup(page("We're holding this room for you for 0:40"));
  const result = await runPayment(s.deps, async () => undefined);
  assert.deepEqual([result.status, result.cause], ["not_started", "not_confirmed_again"]);
  assert.match(s.c.said.at(-1) ?? "", /could not confirm the same room at Casa Halcy again\. Nothing is booked/);

  const threw = setup(page("We're holding this room for you for 0:40"));
  assert.equal((await runPayment(threw.deps, async () => Promise.reject(new Error("model down")))).cause, "not_confirmed_again");
});

test("a fresh hold is asked for once, and only when it can help", async () => {
  let validations = 0;
  const noWindow = setup(page(FRESH_CLOCK), false);
  assert.equal((await runPayment(noWindow.deps, async () => (validations++, TERMS))).cause, "no_window");
  const stillShort = setup(page("We're holding this room for you for 2:00"));
  assert.equal((await runPayment(stillShort.deps, async () => (validations++, TERMS))).cause, "hold_short", "the second refusal is final");
  assert.equal(validations, 1);
});

test("the second validation is told what the traveller agreed to on the payment page", () => {
  const note = revalidationNote(TERMS);
  assert.match(note, /total 420, charged now 0, paid at the hotel 420/);
  assert.match(note, /lower price without taxes or fees that are added later; that is not a mismatch/);
});

test("term changes compare figures, not spellings", () => {
  assert.deepEqual(termChanges(TERMS, { total: "€420.00", chargedNow: "0,00 €", dueAtHotel: 420 }), []);
  assert.deepEqual(termChanges(TERMS, { total: 470, chargedNow: 0, dueAtHotel: 470 }).map((c) => c.label), ["Total", "Paid at the hotel"]);
});
