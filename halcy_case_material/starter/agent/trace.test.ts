import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { looksLikeCard } from "./evidence/card-number.ts";
import { GuardedLog } from "./evidence/log.ts";
import { traceStep, type TraceStep } from "./trace.ts";

const traveller = { first: "Maja", last: "Lind", email: "maja.lind@example.com", phone: "+46 70 000 00 01" };

/** A GuardedLog in a temporary folder, its trace collected the way index.ts does it. */
function run(feed: (log: GuardedLog) => void): TraceStep[] {
  const cwd = process.cwd();
  const dir = mkdtempSync(join(tmpdir(), "trace-"));
  process.chdir(dir);
  try {
    const log = new GuardedLog("trace-test");
    const steps: TraceStep[] = [];
    log.subscribe((type, data, blind) => {
      const s = traceStep(type, data, blind, traveller);
      if (s) steps.push(s);
    });
    feed(log);
    return steps;
  } finally {
    process.chdir(cwd);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("no trace step can carry a card number, a typed value or the traveller's details", () => {
  const steps = run((log) => {
    log.event("llm.turn", { role: "validation", tools: ["act"], said: "Card 4242 4242 4242 4242 is on the page; filling maja.lind@example.com for Maja Lind" });
    log.event("act", { kind: "fill", id: "0:3", value: "+46 70 000 00 01", url: "http://localhost:4100/details?hold=h1" });
    log.event("search.done", { hotel: "Casa Halcy", candidates: 1, text: "Number 4000000000000002 seen" });
    log.event("message", { message: "my card is 4242424242424242", traveller });
  });
  const dump = JSON.stringify(steps);
  assert.equal(looksLikeCard(dump), false);
  for (const v of ["maja.lind@example.com", "+46 70 000 00 01", "Maja Lind", "hold=h1"]) assert.equal(dump.includes(v), false, v);
  assert.match(dump, /fill on http:\/\/localhost:4100\/details/);
  assert.equal(steps.some((s) => s.text.includes("my card")), false, "the traveller's own message is not a step");
});

test("nothing from the blind interval reaches the trace except that the traveller is paying", () => {
  const steps = run((log) => {
    log.event("handoff.start", { holdSecondsLeft: 808 });
    log.event("handoff.blind.start", { reason: "traveller takes over" });
    log.event("handoff.wait", { deadlineMs: 1000, title: "Over to you", lines: ["Total €706.24"] });
    log.event("trace.note", { text: "should never show", from: "orchestrator" });
    log.event("handoff.signal", { kind: "navigated", to: { origin: "http://localhost:4100", path: "/confirmation/CH-1" } });
    log.event("handoff.blind.end", { outcome: "navigated", ms: 10 });
    log.event("payment.result", { status: "confirmed", reference: "CH-972001", said: "You're booked." });
  });
  assert.deepEqual(
    steps.map((s) => s.text),
    ["handing over; hotel holds the room 13 min", "You are paying in the hotel's window. Nothing is read until you are done.", "Back from the hotel's window; reading the hotel's page once.", "outcome: confirmed, reference CH-972001"],
  );
});

test("the steps say what each agent did", () => {
  const steps = run((log) => {
    log.event("llm.start", { role: "search", hotel: "Villa Aurora", model: "claude-sonnet-5-5", effort: "medium" });
    log.event("observe", { hotel: "Villa Aurora", url: "http://localhost:4500/location?x=1", title: "Location" });
    log.event("candidate.add", { hotel: "Villa Aurora", id: "fs-std", features: { room_name: "Family Suite", rate_name: "Standard", price_total: 660, currency: "GBP", cancellable: true } });
    log.event("candidates.scored", { threshold: 0.6, ranking: [{ candidateId: "fs-std", score: 1, feasible: true }], rejected: [{ candidateId: "garden", reason: "sleeps 2" }] });
    log.event("validation.result", { candidateId: "fs-std", accepted: true, reasons: ["Dates match"] });
    log.event("trace.note", { text: "Comparing both hotels in kr", from: "fx" });
  });
  assert.deepEqual(steps.map((s) => `${s.who}: ${s.text}`), [
    "search · Villa Aurora: started (claude-sonnet-5-5, medium effort)",
    "browser · Villa Aurora: read http://localhost:4500/location",
    "search · Villa Aurora: found Family Suite, Standard 660 GBP, cancellable",
    "scoring: ranked 1; best fs-std (score 1, pass 0.6)",
    "validation: fs-std accepted",
    "fx: Comparing both hotels in kr",
  ]);
  assert.match(steps[3].detail ?? "", /rejected garden: sleeps 2/);
});
