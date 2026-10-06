import { test } from "node:test";
import assert from "node:assert/strict";
import type { RunLog } from "../../log.ts";
import { PaymentBoundary } from "./boundary.ts";

function fakeLog() {
  const events: { type: string; data?: Record<string, unknown> }[] = [];
  const log = { event: (type: string, data?: Record<string, unknown>) => void events.push({ type, data }) } as unknown as RunLog;
  return { log, events };
}

test("only the hotel's own origin may be read", () => {
  const b = new PaymentBoundary("http://localhost:4100/", fakeLog().log);
  assert.equal(b.allows("http://localhost:4100/payment?hold=abc"), true);
  assert.equal(b.allows("http://localhost:4101/fields"), false, "same host, other port is another origin");
  assert.equal(b.allows("https://localhost:4100/"), false, "other scheme is another origin");
  assert.equal(b.allows("http://pay.example.com/"), false);
  assert.equal(b.allows("about:blank"), false);
  assert.equal(b.allows("not a url"), false);
});

test("blind mode blocks everything, even the hotel's origin, and is logged", () => {
  const { log, events } = fakeLog();
  const b = new PaymentBoundary("http://localhost:4100/", log);
  const end = b.beginBlind("traveller takes over");
  assert.equal(b.blind, true);
  assert.equal(b.allows("http://localhost:4100/payment"), false);
  assert.throws(() => b.beginBlind("again"), "a second begin hands out no ender");
  assert.equal("endBlind" in b, false, "no public member ends blind mode");
  end("url changed");
  end("again");
  assert.equal(b.blind, false);
  assert.equal(b.allows("http://localhost:4100/confirmation/CH-1"), true);
  assert.deepEqual(
    events.map((e) => e.type),
    ["handoff.blind.start", "handoff.blind.end"],
    "begin and end are logged exactly once each",
  );
});

test("a malformed allow() adds nothing", () => {
  const b = new PaymentBoundary("http://localhost:4100/", fakeLog().log);
  b.allow("::nope");
  assert.equal(b.allows("::nope"), false);
});

test("describeHidden names the origin only", () => {
  const b = new PaymentBoundary("http://localhost:4100/", fakeLog().log);
  const s = b.describeHidden("http://localhost:4101/fields?intent=pi_123&number=4242424242424242");
  assert.equal(s.includes("4242"), false);
  assert.equal(s.includes("intent"), false);
  assert.ok(s.includes("http://localhost:4101"));
});
