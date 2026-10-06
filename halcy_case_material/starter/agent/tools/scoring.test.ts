// Run with: npm test
// The tool schemas must accept what a model realistically sends: a few
// features, not all of them. A record keyed by an enum is exhaustive in
// Zod 4, which silently rejected every set_objective and add_candidate call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { memoryStore } from "../store.ts";
import { newRunState } from "../types.ts";
import { loadRates } from "../scoring/fx.ts";
import { candidateTools, factsSchema, goalSchema, objectiveSchema, objectiveTools } from "./scoring.ts";

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

test("a budget in another currency than the hotel's is applied to the ECB estimate, with the currency taken from the goal", async () => {
  // Fixed rates for this file, so the test never reaches the network: 404 EUR is about 4,546 SEK.
  await loadRates(async () => "<Cube time='2026-10-05'><Cube currency='SEK' rate='11.2525'/><Cube currency='GBP' rate='0.8472'/></Cube>");
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "H", url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-22", adults: 2, mustHave: [], preferences: [], budget: { currency: "SEK", maxTotal: 3200 } };
  const deps = { state, log: noLog };
  // The objective agent forgot the currency; the cap must still not be unit-less.
  await byName(objectiveTools(deps), "set_objective").run({ weights: { price_total: -1 }, hard: { price_total: 3200 }, threshold: 0, maxSearchMs: 1000, extraAfterPassMs: 0, explanation: "x" } as never);
  assert.equal(state.objective!.currency, "SEK");
  const tools = candidateTools(deps);
  await byName(tools, "add_candidate").run({ id: "superior-flex", features: { price_total: 404, currency: "€" }, sourceUrl: "http://h/rooms" } as never);
  const out = JSON.parse((await byName(tools, "score_candidates").run({} as never)) as string);
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0].reason, /about 4,546 kr at the ECB rate of 5 Oct, over the limit of 3,200 kr \(an estimate\)/);
  assert.match(out.budgetNotApplied, /checked against an estimate .* at the ECB rate of 5 Oct/);
  assert.equal(state.budgetNotApplied, out.budgetNotApplied);
});

test("a price recorded as text is refused by the schema, a number is taken", () => {
  // Seen on the second hotel: price_total "GBP 190.00 for the stay (room only; ...)" could not be scored and every room was rejected.
  assert.equal(factsSchema.safeParse({ price_total: "GBP 190.00 for the stay (room only)" }).success, false);
  assert.equal(factsSchema.safeParse({ price_total: 190, currency: "GBP", cancellable: true }).success, true);
  assert.equal(factsSchema.safeParse({ sold_out: "yes" }).success, false);
  assert.equal(factsSchema.safeParse({ view: "river" }).success, true);
});

test("a guide price in another currency than the hotel charges in is refused, the charge currency is remembered", async () => {
  // Seen on the second hotel with Sonnet search: "about EUR 164" recorded where the hotel charges GBP.
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "Villa Aurora", url: "http://v" }, checkin: "a", checkout: "b", adults: 2, mustHave: [], preferences: [] };
  const tools = candidateTools({ state, log: noLog });
  const add = byName(tools, "add_candidate");
  const refused = (await add.run({ id: "garden", features: { price_total: 164, currency: "EUR", charge_currency: "GBP" }, sourceUrl: "http://v/rooms" } as never)) as string;
  assert.match(refused, /^Refused: the hotel charges in GBP, but this price is in EUR/);
  assert.equal(state.store.candidate("garden"), undefined);
  // Later calls that leave charge_currency out are held to it too.
  assert.match((await add.run({ id: "loft", features: { price_total: 200, currency: "€" }, sourceUrl: "http://v/rooms" } as never)) as string, /^Refused/);
  assert.match((await add.run({ id: "garden", features: { price_total: 140, currency: "£" }, sourceUrl: "http://v/rooms" } as never)) as string, /^Recorded garden/);
});

test("candidates recorded in another currency before the charge currency was known are rejected at scoring", async () => {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "Villa Aurora", url: "http://v" }, checkin: "a", checkout: "b", adults: 2, mustHave: [], preferences: [] };
  const deps = { state, log: noLog };
  await byName(objectiveTools(deps), "set_objective").run({ weights: { price_total: -1 }, hard: {}, threshold: 0, maxSearchMs: 1, extraAfterPassMs: 0, explanation: "x" } as never);
  const tools = candidateTools(deps);
  await byName(tools, "add_candidate").run({ id: "guide", features: { price_total: 164, currency: "EUR" }, sourceUrl: "http://v" } as never);
  await byName(tools, "add_candidate").run({ id: "real", features: { price_total: 140, currency: "GBP", charge_currency: "GBP" }, sourceUrl: "http://v" } as never);
  const out = JSON.parse((await byName(tools, "score_candidates").run({} as never)) as string);
  assert.deepEqual(out.ranking.map((e: { candidateId: string }) => e.candidateId), ["real"]);
  assert.equal(out.rejected[0].constraint, "charge_currency");
});

test("a recorded price is checked against the page the agent read: guide refused, currency taken from the page", async () => {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "Villa Aurora", url: "http://v" }, checkin: "a", checkout: "b", adults: 2, mustHave: [], preferences: [] };
  state.pages["/rooms"] = "Garden double\n£140.00 for the stay (about €164 as a guide)\nWe charge in pounds sterling.";
  const add = byName(candidateTools({ state, log: noLog }), "add_candidate");
  assert.match((await add.run({ id: "g", features: { price_total: 164, currency: "EUR" }, sourceUrl: "http://v/rooms?x=1" } as never)) as string, /^Refused: 164 appears on the page only as a guide/);
  // The model says EUR, the page writes £ next to 140: code wins.
  assert.match((await add.run({ id: "g", features: { price_total: 140, currency: "EUR" }, sourceUrl: "http://v/rooms" } as never)) as string, /^Recorded g/);
  assert.equal(state.store.candidate("g")!.features.currency.value, "£");
  assert.match((await add.run({ id: "h", features: { price_total: 999 }, sourceUrl: "http://v/rooms" } as never)) as string, /not on the page you read/);
});

test("children are optional ages next to adults", () => {
  const base = { hotel: { name: "H", url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-24", adults: 2, mustHave: [], preferences: [] };
  assert.equal(goalSchema.safeParse(base).success, true);
  assert.equal(goalSchema.safeParse({ ...base, children: [4, 9] }).success, true);
  assert.equal(goalSchema.safeParse({ ...base, children: [19] }).success, false);
  assert.equal(goalSchema.safeParse({ ...base, children: ["four"] }).success, false);
});
