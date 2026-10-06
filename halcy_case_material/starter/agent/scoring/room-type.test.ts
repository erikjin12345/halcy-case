import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import type { Objective } from "../types.ts";
import { scoreCandidates } from "./objective.ts";
import { isRoomType, roomTypeNote, spellings, unmatchedRoomType } from "./room-type.ts";

const objective = (o: Partial<Objective>): Objective => ({ weights: {}, hard: {}, wants: {}, threshold: 0, maxSearchMs: 1, extraAfterPassMs: 1, ...o });
function rooms(names: string[]) {
  const s = memoryStore();
  for (const n of names) s.observe(n, "h", { room_name: n, rate_name: "Standard", price_total: 100, cancellable: true }, "list");
  return s.candidates();
}

test("a room type matches its common spellings in other languages", () => {
  assert.equal(isRoomType("Chambre simple, vue jardin", "single"), true);
  assert.equal(isRoomType("Habitación doble estándar", "a double room"), true);
  assert.equal(isRoomType("Dubbelrum med balkong", "double"), true);
  assert.equal(isRoomType("Camera familiare", "family room"), true);
  assert.equal(isRoomType("Chambre double", "single"), false);
});

test("a phrase that names one room does not widen to every room of that type", () => {
  assert.deepEqual(spellings("classic double"), ["classic double"]);
  assert.equal(isRoomType("Superior double", "classic double"), false);
  assert.equal(isRoomType("Classic double", "classic double"), true);
});

test("a hard room type is applied in any language", () => {
  const c = rooms(["Chambre simple", "Chambre double", "Suite junior"]);
  const feasible = scoreCandidates(c, objective({ hard: { room_name: "single" } })).filter((s) => s.evaluation.feasible).map((s) => s.evaluation.candidateId);
  assert.deepEqual(feasible, ["Chambre simple"]);
});

test("a hard room type that no room matches rejects nothing and names what the site offers", () => {
  const c = rooms(["Chambre double", "Suite junior"]);
  const o = objective({ hard: { room_name: "triple" } });
  assert.equal(scoreCandidates(c, o).every((s) => s.evaluation.feasible), true, "never an empty result");
  const gap = unmatchedRoomType(c, o);
  assert.deepEqual(gap, { wanted: "triple", offered: ["Chambre double", "Suite junior"] });
  assert.match(roomTypeNote(gap)!, /The site offers: Chambre double; Suite junior\. .*ask which one they mean/);
  assert.equal(unmatchedRoomType(c, objective({ hard: { room_name: "double" } })), null);
});
