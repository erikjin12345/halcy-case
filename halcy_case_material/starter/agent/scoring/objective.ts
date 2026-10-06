// Deterministic scoring over Store candidates. A model sets the objective
// once; this file turns candidates into scores the same way every time, with
// components a human can read at the debrief.
//
// Every weight contributes between 0 and its absolute size, so a score is
// always between 0 and maxScore(objective) and a threshold means the same
// thing whatever mix of features it is built from:
//   positive weight  rewards a high number, `true`, or a wanted text match
//   negative weight  rewards a low number, `false`, or the absence of the match

import { objectiveHash as storeHash, type Candidate, type Evaluation } from "../store.ts";
import { FEATURES, type FeatureName, type FeatureValue, type Objective } from "../types.ts";

export interface ScoredCandidate {
  evaluation: Omit<Evaluation, "at">;
  /** Hard constraints that failed, most telling first. Empty when feasible. */
  failures: { constraint: string; reason: string }[];
}

/** Numeric hard constraints that mean "at least" rather than "exactly". */
const AT_LEAST: FeatureName[] = ["sleeps"];
/** Numeric hard constraints that mean "at most": a budget cap. */
const AT_MOST: FeatureName[] = ["price_total", "price_now", "price_at_hotel"];

type Range = { min: number; max: number };
type Ranges = Partial<Record<FeatureName, Range>>;

/** One hash for weights, hard constraints and wants together. */
export function objectiveHash(o: Objective): string {
  return storeHash(o.weights as Record<string, number>, { hard: o.hard, wants: o.wants });
}

function value(c: Candidate, name: FeatureName): FeatureValue | undefined {
  const v = c.features[name]?.value;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

function hardFailure(name: FeatureName, actual: FeatureValue | undefined, required: FeatureValue): string | null {
  if (actual === undefined) return `${name} unknown, required ${String(required)}`;
  if (typeof required === "number" && typeof actual === "number") {
    if (AT_LEAST.includes(name)) return actual >= required ? null : `${name} is ${actual}, required at least ${required}`;
    if (AT_MOST.includes(name)) return actual <= required ? null : `${name} is ${actual}, required at most ${required}`;
  }
  if (typeof required === "string" && typeof actual === "string") {
    return actual.toLowerCase().includes(required.toLowerCase()) ? null : `${name} is "${actual}", required "${required}"`;
  }
  return actual === required ? null : `${name} is ${String(actual)}, required ${String(required)}`;
}

function hardFailures(c: Candidate, o: Objective): ScoredCandidate["failures"] {
  const out: ScoredCandidate["failures"] = [];
  for (const [name, required] of Object.entries(o.hard) as [FeatureName, FeatureValue][]) {
    const reason = hardFailure(name, value(c, name), required);
    if (reason) out.push({ constraint: name, reason });
  }
  // Most telling first: a sold-out room, then other definite mismatches, then facts the page never stated.
  const rank = (f: { constraint: string; reason: string }) => (f.constraint === "sold_out" ? 0 : f.reason.includes(" unknown, ") ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Min-max range per numeric feature across the given candidates. */
function numericRanges(candidates: Candidate[]): Ranges {
  const out: Ranges = {};
  for (const name of FEATURES) {
    const values = candidates.map((c) => value(c, name)).filter((v): v is number => typeof v === "number");
    if (values.length) out[name] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return out;
}

/** How well one feature value serves one weight, from 0 (not at all) to 1 (fully). */
function fit(name: FeatureName, v: FeatureValue | undefined, wantHigh: boolean, ranges: Ranges, o: Objective): number {
  if (v === undefined) return 0;
  if (typeof v === "boolean") return v === wantHigh ? 1 : 0;
  if (typeof v === "number") {
    const r = ranges[name];
    // Nothing to compare against, or every candidate is equal on this feature: it cannot hold anyone back.
    if (!r || r.max === r.min) return 1;
    const norm = Math.min(1, Math.max(0, (v - r.min) / (r.max - r.min)));
    return wantHigh ? norm : 1 - norm;
  }
  const want = o.wants[name];
  if (!want) return 0;
  return v.toLowerCase().includes(want.toLowerCase()) === wantHigh ? 1 : 0;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function scoreCandidates(candidates: Candidate[], o: Objective): ScoredCandidate[] {
  const hash = objectiveHash(o);
  const failed = new Map(candidates.map((c) => [c.id, hardFailures(c, o)]));
  // Compare prices only among candidates the traveller could actually get.
  const feasible = candidates.filter((c) => failed.get(c.id)!.length === 0);
  const ranges = numericRanges(feasible.length ? feasible : candidates);

  return candidates.map((c) => {
    const failures = failed.get(c.id)!;
    const components: Record<string, number> = {};
    let score = 0;
    for (const [name, weight] of Object.entries(o.weights) as [FeatureName, number][]) {
      const part = Math.abs(weight) * fit(name, value(c, name), weight > 0, ranges, o);
      if (part !== 0) components[name] = round(part);
      score += part;
    }
    return {
      evaluation: { candidateId: c.id, objectiveHash: hash, score: round(score), components, feasible: failures.length === 0 },
      failures,
    };
  });
}

/** The best possible score under this objective: every weight fully earned. */
export function maxScore(o: Objective): number {
  return round(Object.values(o.weights).reduce((sum, w) => sum + Math.abs(w ?? 0), 0));
}
