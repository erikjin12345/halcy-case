// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore } from "../store.ts";
import { newRunState, type SearchGoal } from "../types.ts";
import { objectiveKey } from "./objective.ts";
import { searchProgress } from "./progress.ts";

const goal = (hotel: string): SearchGoal => ({ hotel: { name: hotel, url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-24", adults: 3, mustHave: [], preferences: ["cheapest"] });

test("the objective key ignores the hotel and changes with what the traveller wants", () => {
  assert.equal(objectiveKey(goal("Casa Halcy")), objectiveKey(goal("Villa Aurora")));
  assert.notEqual(objectiveKey(goal("Casa Halcy")), objectiveKey({ ...goal("Casa Halcy"), adults: 2 }));
  assert.notEqual(objectiveKey(goal("Casa Halcy")), objectiveKey({ ...goal("Casa Halcy"), budget: { currency: "EUR", maxTotal: 500 } }));
});

test("the progress line names the best feasible room at the hotel just searched, in its own currency", () => {
  const state = newRunState(memoryStore());
  state.goal = goal("Villa Aurora");
  state.objectiveHash = "h";
  state.store.observe("casa-sup", "Casa Halcy", { room_name: "Superior double", price_total: 728, currency: "€" }, "t");
  state.store.observe("aurora-fam", "Villa Aurora", { room_name: "Family suite", price_total: 520, currency: "£" }, "t");
  state.store.observe("aurora-loft", "Villa Aurora", { room_name: "Loft", price_total: 480, currency: "£" }, "t");
  state.store.evaluate({ candidateId: "casa-sup", objectiveHash: "h", score: 1, components: {}, feasible: true });
  state.store.evaluate({ candidateId: "aurora-loft", objectiveHash: "h", score: 0.9, components: {}, feasible: false });
  state.store.evaluate({ candidateId: "aurora-fam", objectiveHash: "h", score: 0.8, components: {}, feasible: true });
  assert.equal(searchProgress(state), "Villa Aurora checked: the best match there is the Family suite, £520.00 for 4 nights, before any tax the hotel adds.");
});

test("a hotel with nothing that fits says so", () => {
  const state = newRunState(memoryStore());
  state.goal = goal("Casa Halcy");
  state.objectiveHash = "h";
  assert.equal(searchProgress(state), "Casa Halcy checked: nothing there fits what you asked for.");
});
