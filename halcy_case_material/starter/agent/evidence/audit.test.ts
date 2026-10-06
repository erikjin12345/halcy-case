import { test } from "node:test";
import assert from "node:assert/strict";
import { auditEvents } from "./audit.ts";

const ev = (type: string, data: Record<string, unknown> = {}) => JSON.stringify({ at: "t", type, ...data });

const clean = [
  ev("message", { message: "book Casa Halcy" }),
  ev("observe", { url: "http://localhost:4100/payment" }),
  ev("chat.answer", { pressed: "approve" }),
  ev("handoff.blind.start", { reason: "approved" }),
  ev("chat.reply", { text: "done" }),
  ev("handoff.blind.end", { outcome: "url changed" }),
  ev("observe", { url: "http://localhost:4100/confirmation/CH-9a1b2c" }),
  "",
];

test("a clean run has no violations", () => {
  assert.deepEqual(auditEvents(clean), []);
});

test("an observation inside the blind interval is caught", () => {
  const poisoned = [...clean];
  poisoned.splice(4, 0, ev("observe", { url: "http://localhost:4100/payment" }));
  const v = auditEvents(poisoned);
  assert.deepEqual(v.map((x) => [x.rule, x.line]), [["observation-in-blind", 5]]);
});

test("a blind interval that never ends is caught", () => {
  const v = auditEvents(clean.slice(0, 5));
  assert.deepEqual(v.map((x) => x.rule), ["blind-not-closed"]);
});

test("a card number anywhere is caught, whatever the event type", () => {
  const v = auditEvents([ev("chat.say", { text: "I saw 4000 0000 0000 0002" })]);
  assert.deepEqual(v.map((x) => x.rule), ["card-number"]);
});

test("reading the phone or the admin endpoint is caught", () => {
  const v = auditEvents([ev("goto", { url: "http://localhost:4101/__phone" }), ev("fetch", { url: "http://localhost:4100/__admin/bookings" })]);
  assert.deepEqual(v.map((x) => [x.rule, x.detail]), [["forbidden-url", "__phone"], ["forbidden-url", "__admin"]]);
});

test("a corrupt line is reported, not skipped", () => {
  assert.deepEqual(auditEvents(["{not json"]).map((x) => x.rule), ["unparsable"]);
});
