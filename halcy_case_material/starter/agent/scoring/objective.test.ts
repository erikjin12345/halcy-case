// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import type { Objective } from "../types.ts";
import { maxScore, scoreCandidates } from "./objective.ts";

type Features = Record<string, string | number | boolean>;
const base: Objective = { weights: {}, hard: {}, wants: {}, threshold: 0, maxSearchMs: 1, extraAfterPassMs: 0 };

function score(rooms: Record<string, Features>, o: Partial<Objective>) {
  const store = memoryStore();
  for (const [id, f] of Object.entries(rooms)) store.observe(id, "H", f, "test");
  const objective = { ...base, ...o };
  const out = scoreCandidates(store.candidates(), objective);
  return {
    objective,
    score: Object.fromEntries(out.map((s) => [s.evaluation.candidateId, s.evaluation.score])),
    feasible: Object.fromEntries(out.map((s) => [s.evaluation.candidateId, s.evaluation.feasible])),
    reason: Object.fromEntries(out.map((s) => [s.evaluation.candidateId, s.failures[0]?.reason ?? ""])),
  };
}

test("a negative weight on price gives the cheapest room full credit and the dearest none", () => {
  const r = score({ saver: { price_total: 320 }, mid: { price_total: 360 }, flex: { price_total: 400 } }, { weights: { price_total: -1 } });
  assert.deepEqual(r.score, { saver: 1, mid: 0.5, flex: 0 });
});

test("every score lies between 0 and maxScore, whatever the signs", () => {
  const o = { weights: { price_total: -1, breakfast_included: 0.5, view: 1 }, wants: { view: "river" } };
  const r = score(
    { a: { price_total: 300, breakfast_included: true, view: "river" }, b: { price_total: 500, breakfast_included: false, view: "courtyard" } },
    o,
  );
  assert.equal(maxScore(r.objective), 2.5);
  assert.deepEqual(r.score, { a: 2.5, b: 0 });
});

test("the cheapest room passes a threshold that only price can earn", () => {
  // Example ask 2: cheapest is fine, breakfast would be nice, breakfast is an add-on so no rate includes it.
  const r = score(
    { "superior-saver": { price_total: 320.32, breakfast_included: false }, "superior-flex": { price_total: 364, breakfast_included: false } },
    { weights: { price_total: -1, breakfast_included: 0.5 }, threshold: 0.3 },
  );
  assert.equal(r.score["superior-saver"], 1);
  assert.ok(r.score["superior-saver"] >= r.objective.threshold);
  assert.equal(r.score["superior-flex"], 0);
});

test("a lone candidate is not held back by a feature it cannot be compared on", () => {
  const r = score({ only: { price_total: 404 } }, { weights: { price_total: -1 } });
  assert.equal(r.score.only, 1);
});

test("a negative weight on a boolean rewards its absence", () => {
  const r = score({ with: { breakfast_included: true }, without: { breakfast_included: false } }, { weights: { breakfast_included: -0.5 } });
  assert.deepEqual(r.score, { with: 0, without: 0.5 });
});

test("a fact the page never stated earns nothing", () => {
  const r = score({ known: { cancellable: true }, unknown: {} }, { weights: { cancellable: 1 } });
  assert.deepEqual(r.score, { known: 1, unknown: 0 });
});

test("hard `sleeps` means at least, not exactly", () => {
  const r = score({ two: { sleeps: 2 }, three: { sleeps: 3 }, four: { sleeps: 4 } }, { hard: { sleeps: 3 } });
  assert.deepEqual(r.feasible, { two: false, three: true, four: true });
  assert.equal(r.reason.two, "sleeps is 2, required at least 3");
});

test("a hard price is a cap", () => {
  const r = score({ under: { price_total: 380 }, over: { price_total: 420 } }, { hard: { price_total: 400 } });
  assert.deepEqual(r.feasible, { under: true, over: false });
  assert.equal(r.reason.over, "price_total is 420, required at most 400");
});

test("prices are compared among feasible candidates only", () => {
  // The non-refundable room is cheaper but infeasible; it must not make the feasible ones look expensive.
  const r = score(
    { "saver": { price_total: 295, cancellable: false }, "classic": { price_total: 336, cancellable: true }, "superior": { price_total: 404, cancellable: true } },
    { weights: { price_total: -1 }, hard: { cancellable: true } },
  );
  assert.equal(r.score.classic, 1);
  assert.equal(r.score.superior, 0);
  assert.equal(r.feasible.saver, false);
});

test("an unstated capacity does not reject a room the hotel offered for the party", () => {
  // Example ask 3: the rooms page never says how many a room sleeps when it is big enough.
  const r = score({ classic: { room_name: "Classic Double", price_total: 444 } }, { hard: { sleeps: 1, sold_out: false } });
  assert.equal(r.feasible.classic, true);
});

test("a stated capacity that is too small still rejects", () => {
  const r = score({ classic: { sleeps: 2 } }, { hard: { sleeps: 3 } });
  assert.equal(r.feasible.classic, false);
});

test("other unstated facts on a hard constraint still reject", () => {
  const r = score({ room: { price_total: 300 } }, { hard: { cancellable: true } });
  assert.equal(r.feasible.room, false);
  assert.equal(r.reason.room, "cancellable unknown, required true");
});

test("a text weight with a wanted value picks the named room", () => {
  const r = score(
    { classic: { room_name: "Classic double", price_total: 444 }, superior: { room_name: "Superior double", price_total: 546 } },
    { weights: { room_name: 2, price_total: -1 }, wants: { room_name: "classic double" }, threshold: 2 },
  );
  assert.deepEqual(r.score, { classic: 3, superior: 0 });
});
