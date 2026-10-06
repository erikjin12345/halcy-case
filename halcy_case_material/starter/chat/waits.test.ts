// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { Waits } from "./waits.ts";

test("a typed message answers an open question with buttons", async () => {
  const w = new Waits();
  const answer = w.either("card-1", 1000);
  assert.equal(w.typed("which is the cheapest"), true);
  assert.deepEqual(await answer, { kind: "typed", text: "which is the cheapest" });
  // The card's buttons were withdrawn: a late press does nothing.
  assert.equal(w.pressed("card-1", "casa"), false);
});

test("a press answers it, and the next typed message is not swallowed", async () => {
  const w = new Waits();
  const answer = w.either("card-1", 1000);
  assert.equal(w.pressed("card-1", "casa"), true);
  assert.deepEqual(await answer, { kind: "pressed", button: "casa" });
  assert.equal(w.typed("thanks"), false);
  assert.equal(await w.text(), "thanks");
});

test("a timeout withdraws both waits", async () => {
  const w = new Waits();
  assert.deepEqual(await w.either("card-1", 5), { kind: "timeout" });
  assert.equal(w.pressed("card-1", "casa"), false);
  assert.equal(w.typed("late"), false);
  assert.deepEqual(w.inbox, ["late"]);
});

test("a message typed before the question is asked is handed over at once, marked as earlier", async () => {
  const w = new Waits();
  w.typed("Casa Halcy please");
  assert.deepEqual(await w.either("card-1", 1000), { kind: "typed", text: "Casa Halcy please", early: true });
});

test("the starter's choose and reply still work", async () => {
  const w = new Waits();
  const press = w.press("card-2");
  w.pressed("card-2", "ok");
  assert.equal(await press, "ok");
  const reply = w.text();
  w.typed("hello");
  assert.equal(await reply, "hello");
});

test("a message typed during a button question is not the next reply", async () => {
  // Seen in a run: "which is the cheapest" typed during "Which hotel?" came back as the answer to "Which dates?".
  const w = new Waits();
  const hotel = w.either("hotel-card", 1000);
  w.typed("which is the cheapest");
  assert.deepEqual(await hotel, { kind: "typed", text: "which is the cheapest" });
  const dates = w.next(1000);
  w.typed("20 to 24 October");
  assert.deepEqual(await dates, { kind: "typed", text: "20 to 24 October" });
});

test("anything still queued when a new question is asked is marked as typed before it", async () => {
  const w = new Waits();
  w.typed("also, is breakfast extra?");
  assert.deepEqual(await w.next(1000), { kind: "typed", text: "also, is breakfast extra?", early: true });
  assert.deepEqual(await w.next(5), { kind: "timeout" });
  assert.equal(w.typed("late"), false);
});
