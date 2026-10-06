// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilities, roleConfig } from "./config.ts";

test("current Opus and Sonnet take effort and the refusal fallback", () => {
  assert.deepEqual(capabilities("claude-opus-5-5"), { effort: true, fallbacks: true });
  assert.deepEqual(capabilities("claude-sonnet-5-5"), { effort: true, fallbacks: true });
});

test("Haiku 4.5 gets neither, so a per-role override cannot 400", () => {
  assert.deepEqual(capabilities("claude-haiku-4-5"), { effort: false, fallbacks: false });
  assert.deepEqual(capabilities("claude-haiku-4-5-20251001"), { effort: false, fallbacks: false });
});

test("an unknown model is sent effort but no fallback", () => {
  assert.deepEqual(capabilities("some-future-model"), { effort: true, fallbacks: false });
});

test("a model id is not matched by a longer id's prefix", () => {
  // claude-opus-5 must not swallow claude-opus-5-5, and vice versa both are listed.
  assert.equal(capabilities("claude-opus-4-8").fallbacks, false);
});

test("roleConfig reads MODEL_<ROLE> and EFFORT_<ROLE> from the environment", () => {
  process.env.MODEL_VALIDATION = "claude-haiku-4-5";
  process.env.EFFORT_SEARCH = "high";
  try {
    assert.equal(roleConfig("validation").model, "claude-haiku-4-5");
    assert.equal(roleConfig("search").effort, "high");
    assert.equal(roleConfig("orchestrator").model, "claude-opus-5-5");
  } finally {
    delete process.env.MODEL_VALIDATION;
    delete process.env.EFFORT_SEARCH;
  }
});
