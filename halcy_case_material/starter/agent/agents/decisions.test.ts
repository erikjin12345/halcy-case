// Run with: npm test

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memoryStore } from "../store.ts";
import { newRunState, type Objective } from "../types.ts";
import { BLIND_END, BLIND_START, GuardedLog } from "../evidence/log.ts";
import { decide, limitDecision, objectiveDecision, priceDecision, scoringDecisions, validateChoiceDecision, verdictDecision } from "./decisions.ts";

const CARD = "4242 4242 4242 4242";
const objective: Objective = { weights: { price_total: -1 }, hard: { sleeps: 3 }, wants: {}, threshold: 0.5, maxSearchMs: 1, extraAfterPassMs: 1 };

/** A run with personal details and a card number in every free-text place a decision could read from. */
function run() {
  const state = newRunState(memoryStore());
  state.goal = { hotel: { name: "Casa Halcy", url: "http://h" }, checkin: "2026-10-20", checkout: "2026-10-24", adults: 3, mustHave: [], preferences: [], notes: `Erik Jin, erik@example.com, card ${CARD}` };
  state.objective = objective;
  state.objectiveHash = "h";
  state.store.observe("sup-saver", "Casa Halcy", { room_name: "Superior Double", rate_name: "Saver", price_total: 658.24, currency: "€", room_details: `guest Erik Jin ${CARD}` }, "rooms page");
  state.store.observe("fam-adv", "Villa Aurora", { room_name: "Family Suite", rate_name: "Advance", price_total: 594, currency: "GBP" }, "rooms page");
  state.store.observe("classic", "Casa Halcy", { room_name: "Classic Double", price_total: 500, currency: "€" }, "rooms page");
  const ranking = [
    state.store.evaluate({ candidateId: "sup-saver", objectiveHash: "h", score: 0.9, components: { price_total: 0.9 }, feasible: true }),
    state.store.evaluate({ candidateId: "fam-adv", objectiveHash: "h", score: 0.8, components: { price_total: 0.8 }, feasible: true }),
  ];
  const rejected = [state.store.reject("classic", "sleeps", "sleeps 2, the party is 3")];
  return { state, ranking, rejected };
}

function all() {
  const { state, ranking, rejected } = run();
  return [
    objectiveDecision(objective, "cheapest that sleeps three"),
    ...scoringDecisions(state, ranking, rejected, 0.5),
    validateChoiceDecision(state, "sup-saver"),
    verdictDecision(state, { candidateId: "sup-saver", accepted: true, reasons: [], unverified: ["sofa bed size"], observed: { price_total: 706.24, price_now: 658.24, price_at_hotel: 48, currency: "€" } }),
    priceDecision(state, "sup-saver", { was: 658.24, now: 700, currency: "€" }),
    limitDecision(state, "sup-saver", { total: 706.24, limit: 700, currency: "€" }),
  ];
}

test("each choice point gives one plain line, with the figures behind it in the detail", () => {
  const ds = all();
  assert.deepEqual(ds.map((d) => d.kind), ["objective", "scoring", "comparison", "validate-choice", "verdict", "price", "limit"]);
  assert.match(ds[1].text, /Best by score: Superior Double, Saver \(sup-saver\), 0\.9 \(threshold 0\.5\); 2 feasible, 1 rejected/);
  assert.match(ds[1].detail!, /rejected Classic Double \(classic\): sleeps: sleeps 2, the party is 3/);
  assert.match(ds[2].detail!, /Villa Aurora: Family Suite, Advance \(fam-adv\), score 0\.8, room 594\.00 GBP/);
  assert.match(ds[2].detail!, /different currencies: scores compare the figures as written/);
  assert.equal(ds[3].text, "Validating Superior Double, Saver (sup-saver): rank 1 of 2 by score (0.9).");
  assert.match(ds[5].text, /from 658\.24 € to 700\.00 €/);
  for (const d of ds) assert.ok(!d.text.includes("\n"), `${d.kind} text is one line`);
});

test("decisions carry no card-like number and no personal details, even when the run holds them", () => {
  const written = JSON.stringify(all());
  assert.doesNotMatch(written, /\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}/);
  assert.doesNotMatch(written, /Erik|Jin|@example/);
});

const cwd = process.cwd();
let dir = "";
before(() => {
  dir = mkdtempSync(join(tmpdir(), "decisions-"));
  process.chdir(dir);
});
after(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

test("nothing is logged while the hand-off is blind, and what is logged goes through the card-number scrub", () => {
  const log = new GuardedLog("decisions");
  const { state } = run();
  const leaky = verdictDecision(state, { candidateId: "sup-saver", accepted: false, reasons: [`page showed ${CARD}`], observed: {} });
  decide(log, leaky);
  log.event(BLIND_START);
  decide(log, priceDecision(state, "sup-saver", { was: 1, now: 2 }));
  log.event(BLIND_END);
  const lines = readFileSync(join(log.dir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const decisions = lines.filter((l) => l.type === "trace.decision");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].kind, "verdict");
  assert.ok(!JSON.stringify(decisions[0]).includes(CARD));
});
