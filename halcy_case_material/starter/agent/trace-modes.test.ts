import { test } from "node:test";
import assert from "node:assert/strict";
import { traceStep, TEST_KINDS } from "./trace.ts";

test("trap, decision and check lines are marked as test-mode kinds; ordinary steps are not", () => {
  const avoided = traceStep("trap.avoided", { trap: "8", name: "upsell", text: "Declined the upgrade and kept the room asked for", evidence: 'clicked "No thanks"' }, false);
  const hit = traceStep("trap.hit", { trap: "7", name: "add-ons", text: "Breakfast stayed ticked" }, false);
  const decision = traceStep("trace.decision", { kind: "scoring", text: "Chose Superior: cheapest that sleeps 3", detail: "price 1.0" }, false);
  const checks = traceStep("traps.result", { recordAvailable: false, results: [{ trap: "3", name: "hold", verdict: "PASS", evidence: "ok" }, { trap: "14", name: "cookie banner", verdict: "n/a", evidence: "-" }] }, false);
  assert.deepEqual([avoided?.kind, hit?.kind, decision?.kind, checks?.kind], ["trap", "trap", "decision", "checks"]);
  assert.equal(avoided?.who, "trap 8 · upsell");
  assert.match(hit?.text ?? "", /^NOT avoided: /);
  assert.equal(checks?.text, "1 pass, 0 fail, 1 n/a");
  assert.match(checks?.detail ?? "", /hotel's own record was not available/);
  assert.equal(traceStep("observe", { url: "http://localhost:4100/" }, false)?.kind, undefined);
  for (const k of ["trap", "decision", "checks"]) assert.ok(TEST_KINDS.has(k));
});

test("nothing test-mode is shown while blind", () => {
  assert.equal(traceStep("trap.avoided", { trap: "9", text: "x" }, true), null);
  assert.equal(traceStep("trace.decision", { text: "x" }, true), null);
});
