// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { newRunState, type ValidationResult } from "../types.ts";
import { approvalBlocker, latestValidation } from "./approval.ts";

const v = (candidateId: string, accepted: boolean, reason = "x"): ValidationResult => ({ candidateId, accepted, reasons: [reason], observed: {} });

test("a candidate that was never validated cannot be approved", () => {
  assert.match(approvalBlocker(newRunState(), "superior-flex")!, /has not been validated/);
});

test("a rejected validation blocks approval and says why", () => {
  const state = newRunState();
  state.validations.push(v("classic-flex", false, "room price changed from €444 to €480"));
  assert.match(approvalBlocker(state, "classic-flex")!, /rejected: room price changed/);
});

test("an accepted validation allows approval, also with unverified items", () => {
  const state = newRunState();
  state.validations.push({ ...v("classic-flex", true), unverified: ["reception hours at 23:00: not stated on any page"] });
  assert.equal(approvalBlocker(state, "classic-flex"), null);
});

test("the latest validation of a candidate decides", () => {
  const state = newRunState();
  state.validations.push(v("a", true), v("b", true), v("a", false, "sold out since"));
  assert.equal(latestValidation(state, "a")!.accepted, false);
  assert.notEqual(approvalBlocker(state, "a"), null);
});

test("only the candidate validated last can be approved: the browser is on its page", () => {
  const state = newRunState();
  state.validations.push(v("flex", true), v("saver", true));
  assert.match(approvalBlocker(state, "flex")!, /the browser is on saver/);
  assert.equal(approvalBlocker(state, "saver"), null);
  state.validations.push(v("flex", true));
  assert.equal(approvalBlocker(state, "flex"), null);
});
