// Run with: npm test
// The tool schemas must accept what a model realistically sends: a few
// features, not all of them. A record keyed by an enum is exhaustive in
// Zod 4, which silently rejected every set_objective and add_candidate call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { memoryStore } from "../store.ts";
import { newRunState } from "../types.ts";
import { candidateTools, goalSchema, objectiveSchema, objectiveTools } from "./scoring.ts";

const noLog = { event() {}, screenshot: () => "", dir: "" } as never;
type Tool = { name: string; inputSchema?: z.ZodType; run: (input: never) => Promise<unknown> };
const byName = (tools: unknown[], name: string) => (tools as Tool[]).find((t) => t.name === name)!;

test("objective schema accepts a subset of features", () => {
  const parsed = objectiveSchema.safeParse({
    weights: { view: 1, price_total: -0.5 },
    hard: { cancellable: true, sold_out: false },
    wants: { view: "river" },
    threshold: 0.6,
    explanation: "river view preferred, must be cancellable",
  });
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
});

test("objective schema does not mark every feature as required for the model", () => {
  const json = z.toJSONSchema(objectiveSchema) as { properties: Record<string, { required?: string[] }> };
  assert.equal(json.properties.weights.required, undefined);
  assert.equal(json.properties.hard.required, undefined);
});

test("goal schema accepts the example ask", () => {
  const parsed = goalSchema.safeParse({
    hotel: { name: "Casa Halcy", url: "http://localhost:4100" },
    checkin: "2026-11-13",
    checkout: "2026-11-15",
    adults: 2,
    mustHave: ["free cancellation"],
    preferences: ["river view"],
  });
  assert.equal(parsed.success, true);
});

test("set_objective, add_candidate and score_candidates work end to end on partial features", async () => {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "H", url: "http://h" }, checkin: "2026-11-13", checkout: "2026-11-15", adults: 2, mustHave: [], preferences: [] };
  const deps = { state, log: noLog };
  await byName(objectiveTools(deps), "set_objective").run({
    weights: { view: 1, price_total: -0.5 },
    hard: { cancellable: true },
    wants: { view: "river" },
    threshold: 0.5,
    maxSearchMs: 1000,
    extraAfterPassMs: 0,
    explanation: "x",
  } as never);
  const tools = candidateTools(deps);
  const add = byName(tools, "add_candidate");
  await add.run({ id: "river-flex", features: { view: "river", price_total: 518, cancellable: true }, sourceUrl: "http://h/rooms" } as never);
  await add.run({ id: "classic-saver", features: { view: "courtyard", price_total: 295, cancellable: false }, sourceUrl: "http://h/rooms" } as never);
  const out = JSON.parse((await byName(tools, "score_candidates").run({} as never)) as string);
  assert.deepEqual(out.ranking.map((e: { candidateId: string }) => e.candidateId), ["river-flex"]);
  assert.deepEqual(out.rejected.map((r: { candidateId: string; constraint: string }) => `${r.candidateId}:${r.constraint}`), ["classic-saver:cancellable"]);
});

test("a sold-out room is rejected as sold out, not for a fact the page never stated", async () => {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "H", url: "http://h" }, checkin: "2026-11-13", checkout: "2026-11-15", adults: 2, mustHave: [], preferences: [] };
  const deps = { state, log: noLog };
  await byName(objectiveTools(deps), "set_objective").run({
    weights: { view: 1 },
    hard: { cancellable: true, sold_out: false, breakfast_included: false },
    threshold: 0.5,
    maxSearchMs: 1000,
    extraAfterPassMs: 0,
    explanation: "x",
  } as never);
  const tools = candidateTools(deps);
  await byName(tools, "add_candidate").run({ id: "river", features: { view: "river", sold_out: true }, sourceUrl: "http://h/rooms?a=1&amp;b=2" } as never);
  const out = JSON.parse((await byName(tools, "score_candidates").run({} as never)) as string);
  assert.equal(out.rejected.length, 1);
  assert.equal(out.rejected[0].constraint, "sold_out");
  assert.match(out.rejected[0].reason, /sold_out is true/);
  assert.equal(state.store.candidate("river")!.features.source_url.value, "http://h/rooms?a=1&b=2");
});

test("a budget in another currency than the hotel's is left out and reported, with the currency taken from the goal", async () => {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "H", url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-22", adults: 2, mustHave: [], preferences: [], budget: { currency: "SEK", maxTotal: 3200 } };
  const deps = { state, log: noLog };
  // The objective agent forgot the currency; the cap must still not be unit-less.
  await byName(objectiveTools(deps), "set_objective").run({ weights: { price_total: -1 }, hard: { price_total: 3200 }, threshold: 0, maxSearchMs: 1000, extraAfterPassMs: 0, explanation: "x" } as never);
  assert.equal(state.objective!.currency, "SEK");
  const tools = candidateTools(deps);
  await byName(tools, "add_candidate").run({ id: "superior-flex", features: { price_total: 404, currency: "€" }, sourceUrl: "http://h/rooms" } as never);
  const out = JSON.parse((await byName(tools, "score_candidates").run({} as never)) as string);
  assert.deepEqual(out.ranking.map((e: { candidateId: string }) => e.candidateId), ["superior-flex"]);
  assert.equal(out.rejected.length, 0);
  assert.match(out.budgetNotApplied, /3200 SEK was NOT applied: the hotel prices in €/);
  assert.equal(state.budgetNotApplied, out.budgetNotApplied);
});
