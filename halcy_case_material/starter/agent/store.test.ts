// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, objectiveHash } from "./store.ts";

const tick = () => {
  let n = 0;
  return () => `t${++n}`;
};

test("observe merges features and stamps each field", () => {
  const s = memoryStore(tick());
  s.observe("classic", "Casa Halcy", { price: 148, guests: 2 }, "rooms page");
  const c = s.observe("classic", "Casa Halcy", { price: 160 }, "payment page");
  assert.equal(c.features.price.value, 160);
  assert.equal(c.features.price.observedAt, "t2");
  assert.equal(c.features.price.source, "payment page");
  assert.equal(c.features.guests.observedAt, "t1");
});

test("ranked puts feasible first, then by score, and hides rejected", () => {
  const s = memoryStore(tick());
  const h = objectiveHash({ price: 1 }, { maxPrice: 200 });
  for (const id of ["a", "b", "c"]) s.observe(id, "x", {}, "search");
  s.evaluate({ candidateId: "a", objectiveHash: h, score: 0.9, components: {}, feasible: false });
  s.evaluate({ candidateId: "b", objectiveHash: h, score: 0.5, components: {}, feasible: true });
  s.evaluate({ candidateId: "c", objectiveHash: h, score: 0.7, components: {}, feasible: true });
  assert.deepEqual(s.ranked(h).map((e) => e.candidateId), ["c", "b", "a"]);
  s.reject("c", "maxPrice", "€239 over €200");
  assert.deepEqual(s.ranked(h).map((e) => e.candidateId), ["b", "a"]);
  assert.deepEqual(s.candidates().map((c) => c.id), ["a", "b"]);
});

test("readmit restores candidates rejected for that constraint only", () => {
  const s = memoryStore(tick());
  s.observe("a", "x", {}, "search");
  s.observe("b", "x", {}, "search");
  s.reject("a", "maxPrice", "too dear");
  s.reject("b", "breakfast", "none");
  assert.equal(s.readmit("maxPrice"), 1);
  assert.deepEqual(s.rejected().map((r) => r.candidateId), ["b"]);
});

test("objectiveHash is stable across key order and changes with the goal", () => {
  const a = objectiveHash({ price: 1, view: 2 }, { maxPrice: 200 });
  const b = objectiveHash({ view: 2, price: 1 }, { maxPrice: 200 });
  const c = objectiveHash({ view: 2, price: 1 }, { maxPrice: 180 });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
