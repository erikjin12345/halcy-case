// Deterministic scoring over Store candidates. A model sets the objective
// once; this file turns candidates into scores the same way every time, with
// components a human can read at the debrief.

import { objectiveHash as storeHash, type Candidate, type Evaluation } from "../store.ts";
import { FEATURES, type FeatureName, type FeatureValue, type Objective } from "../types.ts";

export interface ScoredCandidate {
  evaluation: Omit<Evaluation, "at">;
  /** Hard constraints that failed, as (constraint name, reason). Empty when feasible. */
  failures: { constraint: string; reason: string }[];
}

/** One hash for weights, hard constraints and wants together. */
export function objectiveHash(o: Objective): string {
  return storeHash(o.weights as Record<string, number>, { hard: o.hard, wants: o.wants });
}

function value(c: Candidate, name: FeatureName): FeatureValue | undefined {
  const v = c.features[name]?.value;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

function hardFailures(c: Candidate, o: Objective): ScoredCandidate["failures"] {
  const out: ScoredCandidate["failures"] = [];
  for (const [name, required] of Object.entries(o.hard) as [FeatureName, FeatureValue][]) {
    const actual = value(c, name);
    if (actual === undefined) out.push({ constraint: name, reason: `${name} unknown, required ${String(required)}` });
    else if (typeof required === "string" && typeof actual === "string") {
      if (!actual.toLowerCase().includes(required.toLowerCase()))
        out.push({ constraint: name, reason: `${name} is "${actual}", required "${required}"` });
    } else if (actual !== required) out.push({ constraint: name, reason: `${name} is ${String(actual)}, required ${String(required)}` });
  }
  // Most telling first: a sold-out room, then other definite mismatches, then facts the page never stated.
  const rank = (f: { constraint: string; reason: string }) => (f.constraint === "sold_out" ? 0 : f.reason.includes(" unknown, ") ? 2 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Min-max range per numeric feature across the candidate set. */
function numericRanges(candidates: Candidate[]): Partial<Record<FeatureName, { min: number; max: number }>> {
  const out: Partial<Record<FeatureName, { min: number; max: number }>> = {};
  for (const name of FEATURES) {
    const values = candidates.map((c) => value(c, name)).filter((v): v is number => typeof v === "number");
    if (values.length) out[name] = { min: Math.min(...values), max: Math.max(...values) };
  }
  return out;
}

function contribution(name: FeatureName, v: FeatureValue | undefined, weight: number, ranges: ReturnType<typeof numericRanges>, o: Objective): number {
  if (v === undefined) return 0;
  if (typeof v === "boolean") return v ? weight : 0;
  if (typeof v === "number") {
    const r = ranges[name];
    if (!r || r.max === r.min) return 0;
    // Positive weight rewards high values, negative weight rewards low values.
    return weight * ((v - r.min) / (r.max - r.min));
  }
  const want = o.wants[name];
  return want && v.toLowerCase().includes(want.toLowerCase()) ? weight : 0;
}

export function scoreCandidates(candidates: Candidate[], o: Objective): ScoredCandidate[] {
  const hash = objectiveHash(o);
  const ranges = numericRanges(candidates);
  return candidates.map((c) => {
    const failures = hardFailures(c, o);
    const components: Record<string, number> = {};
    let score = 0;
    for (const [name, weight] of Object.entries(o.weights) as [FeatureName, number][]) {
      const part = contribution(name, value(c, name), weight, ranges, o);
      if (part !== 0) components[name] = Math.round(part * 1000) / 1000;
      score += part;
    }
    return {
      evaluation: { candidateId: c.id, objectiveHash: hash, score: Math.round(score * 1000) / 1000, components, feasible: failures.length === 0 },
      failures,
    };
  });
}

/** The best possible score under this objective: every positive weight earned. */
export function maxScore(o: Objective): number {
  return Object.values(o.weights).reduce((sum, w) => sum + Math.max(0, w ?? 0), 0);
}
