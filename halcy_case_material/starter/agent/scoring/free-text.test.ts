import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import type { Objective } from "../types.ts";
import { says, unstated, unstatedNote } from "./free-text.ts";
import { scoreCandidates } from "./objective.ts";

const objective = (o: Partial<Objective>): Objective => ({ weights: {}, hard: {}, wants: {}, threshold: 0, maxSearchMs: 1, extraAfterPassMs: 1, ...o });

function rooms(details: Record<string, string | undefined>) {
  const s = memoryStore();
  for (const [id, text] of Object.entries(details)) s.observe(id, "h", { room_name: id, cancellable: true, ...(text === undefined ? {} : { room_details: text }) }, "list");
  return s.candidates();
}

test("says finds the word and is not fooled by its absence", () => {
  assert.equal(says("Two rooms and a sofa bed, courtyard side, with a small balcony.", "balcony"), true);
  assert.equal(says("Garden side, no balcony.", "balcony"), false);
  assert.equal(says("Without a bathtub, walk-in shower.", "bathtub"), false);
  assert.equal(says("No balcony in the classic; the suite has a balcony.", "balcony"), true, "one plain mention is enough");
  assert.equal(says("Quiet courtyard side", "QUIET"), true);
  assert.equal(says("anything", ""), false);
});

test("a hard room detail that some room states rejects the rooms that do not", () => {
  const c = rooms({ garden: "Ground floor, opens onto the garden.", suite: "Courtyard side, with a small balcony.", tower: undefined });
  const o = objective({ hard: { room_details: "balcony" } });
  const byId = Object.fromEntries(scoreCandidates(c, o).map((s) => [s.evaluation.candidateId, s]));
  assert.equal(byId.suite.evaluation.feasible, true);
  assert.equal(byId.garden.evaluation.feasible, false);
  assert.match(byId.garden.failures[0].reason, /does not say "balcony"/);
  assert.equal(byId.tower.evaluation.feasible, false, "a room with no description is not assumed to have it");
  assert.deepEqual(unstated(c, o), []);
});

test("a hard room detail that no room states rejects nothing and must be told", () => {
  const c = rooms({ garden: "Ground floor, opens onto the garden.", tower: "Sea view on three sides, no balcony." });
  const o = objective({ hard: { room_details: "balcony", cancellable: true } });
  const scored = scoreCandidates(c, o);
  assert.deepEqual(scored.map((s) => s.evaluation.feasible), [true, true], "never a rejection of every room");
  const gaps = unstated(c, o);
  assert.deepEqual(gaps, [{ feature: "room_details", wanted: "balcony" }]);
  assert.match(unstatedNote(gaps)!, /does not say it for any room.*NOT confirmed/);
  assert.equal(unstatedNote([]), null);
});

test("a wished-for room detail is a weight on the hotel's own words", () => {
  const c = rooms({ garden: "Garden side, no balcony.", suite: "With a small balcony." });
  const o = objective({ weights: { room_details: 1 }, wants: { room_details: "balcony" } });
  const score = Object.fromEntries(scoreCandidates(c, o).map((s) => [s.evaluation.candidateId, s.evaluation.score]));
  assert.equal(score.suite, 1);
  assert.equal(score.garden, 0);
});
