// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { objectiveExtractSchema } from "./objective.ts";

// The schema sent for structured output: no enum-keyed records (the model cannot fill them and returns
// empty weights) and few optional fields (the API refuses more than 24).
test("the objective schema sent to the model has no records and few optional fields", () => {
  const json = JSON.stringify(z.toJSONSchema(objectiveExtractSchema));
  assert.equal(json.includes("propertyNames"), false);
  const required = (z.toJSONSchema(objectiveExtractSchema) as { required: string[] }).required;
  for (const f of ["weights", "hard", "wants", "threshold", "explanation"]) assert.ok(required.includes(f), f);
  assert.ok((json.match(/"optional"/g) ?? []).length <= 24);
});
