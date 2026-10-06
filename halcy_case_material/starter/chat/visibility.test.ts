import { test } from "node:test";
import assert from "node:assert/strict";
import { forPage } from "./visibility.ts";

test("a normal page gets no test-mode lines; a test page gets everything", () => {
  const events = [
    { type: "message" },
    { type: "trace", step: { who: "search", text: "read /" } },
    { type: "trace", step: { who: "trap 8", text: "kept the room", kind: "trap" } },
    { type: "trace", step: { who: "decision", text: "cheapest", kind: "decision" } },
    { type: "trace", step: { who: "trap checks", text: "9 pass", kind: "checks" } },
  ];
  assert.deepEqual(events.filter((e) => forPage(e, false)).length, 2);
  assert.deepEqual(events.filter((e) => forPage(e, true)).length, 5);
});
