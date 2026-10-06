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
import { sameCurrency } from "./currency.ts";
import { FREE_TEXT, says, unstated } from "./free-text.ts";

/** A price cap that was not applied because the cap and the price are not known to be in the same currency. */
export interface CapNotApplied {
  constraint: FeatureName;
  cap: number;
  capCurrency: string;
  /** As the hotel's page wrote it; undefined when the search did not record one. */
  priceCurrency?: string;
}

export interface ScoredCandidate {
  evaluation: Omit<Evaluation, "at">;
  /** Hard constraints that failed, most telling first. Empty when feasible. */
  failures: { constraint: string; reason: string }[];
  /** Caps left out for this candidate. Never a reason to reject or to accept; the traveller is asked. */
  capsNotApplied: CapNotApplied[];
}

/** Numeric hard constraints that mean "at least" rather than "exactly". */
const AT_LEAST: FeatureName[] = ["sleeps"];
/** Numeric hard constraints that mean "at most": a budget cap. */
const AT_MOST: FeatureName[] = ["price_total", "price_now", "price_at_hotel"];

const round = (n: number) => Math.round(n * 1000) / 1000;

type Range = { min: number; max: number };
type Ranges = Partial<Record<FeatureName, Range>>;

/** One hash for weights, hard constraints and wants together. */
export function objectiveHash(o: Objective): string {
  return storeHash(o.weights as Record<string, number>, { hard: o.hard, wants: o.wants, currency: o.currency ?? null });
}

function value(c: Candidate, name: FeatureName): FeatureValue | undefined {
  const v = c.features[name]?.value;
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : undefined;
}

/**
 * What a missing fact means for a hard constraint. A room recorded with a rate
 * is on offer, so an unstated `sold_out` is false; and the hotel's own search
 * was run for the party, so an unstated capacity is enough. Any other missing
 * fact (cancellable, breakfast, a price) is a real unknown and fails.
 */
function unknownPasses(name: FeatureName, required: FeatureValue): boolean {
  if (name === "sold_out") return required === false;
  return AT_LEAST.includes(name);
}

function hardFailure(name: FeatureName, actual: FeatureValue | undefined, required: FeatureValue): string | null {
  if (actual === undefined) return unknownPasses(name, required) ? null : `${name} unknown, required ${String(required)}`;
  if (typeof required === "number" && typeof actual === "number") {
    if (AT_LEAST.includes(name)) return actual >= required ? null : `${name} is ${actual}, required at least ${required}`;
    if (AT_MOST.includes(name)) return actual <= required ? null : `${name} is ${actual}, required at most ${required}`;
  }
  if (typeof required === "string" && typeof actual === "string") {
    const ok = FREE_TEXT.includes(name) ? says(actual, required) : actual.toLowerCase().includes(required.toLowerCase());
    return ok ? null : `${name} does not say "${required}"`;
  }
  return actual === required ? null : `${name} is ${String(actual)}, required ${String(required)}`;
}

/**
 * A cap in one currency says nothing about a price in another, and no rate is
 * known here. When the objective names the cap's currency, the cap is applied
 * only to a candidate whose recorded currency can be the same one.
 */
function capCurrencyGap(c: Candidate, o: Objective, name: FeatureName, required: FeatureValue): CapNotApplied | null {
  if (!o.currency || !AT_MOST.includes(name) || typeof required !== "number") return null;
  const priced = value(c, "currency");
  if (typeof priced === "string" && sameCurrency(o.currency, priced)) return null;
  return { constraint: name, cap: required, capCurrency: o.currency, priceCurrency: typeof priced === "string" ? priced : undefined };
}

/**
 * A limit on the total is a limit on everything the traveller will pay. When
 * the room list already states a charge that is not included, the limit is
 * applied to the room price plus that charge, the best total known so far.
 */
function overLimitWithFees(c: Candidate, name: FeatureName, required: FeatureValue): string | null {
  const room = value(c, "price_total");
  const fees = value(c, "fees_known");
  if (name !== "price_total" || typeof required !== "number" || typeof room !== "number" || typeof fees !== "number" || fees <= 0) return null;
  if (room > required || room + fees <= required) return null;
  return `price_total fits before fees only: room ${room} plus stated charges ${fees} is ${round(room + fees)}, required at most ${required}`;
}

function hardChecks(c: Candidate, o: Objective, skip: Set<string>): Pick<ScoredCandidate, "failures" | "capsNotApplied"> {
  const out: ScoredCandidate["failures"] = [];
  const capsNotApplied: CapNotApplied[] = [];
  for (const [name, required] of Object.entries(o.hard) as [FeatureName, FeatureValue][]) {
    if (skip.has(name)) continue;
    const gap = capCurrencyGap(c, o, name, required);
    if (gap) {
      capsNotApplied.push(gap);
      continue;
    }
    const reason = hardFailure(name, value(c, name), required) ?? overLimitWithFees(c, name, required);
    if (reason) out.push({ constraint: name, reason });
  }
  // Most telling first: a sold-out room, then other definite mismatches, then facts the page never stated.
  const rank = (f: { constraint: string; reason: string }) => (f.constraint === "sold_out" ? 0 : f.reason.includes(" unknown, ") ? 2 : 1);
  return { failures: out.sort((a, b) => rank(a) - rank(b)), capsNotApplied };
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
  const has = FREE_TEXT.includes(name) ? says(v, want) : v.toLowerCase().includes(want.toLowerCase());
  return has === wantHigh ? 1 : 0;
}


export function scoreCandidates(candidates: Candidate[], o: Objective): ScoredCandidate[] {
  const hash = objectiveHash(o);
  // A free-text requirement no room states is left out, never a reason to reject every room.
  const skip = new Set<string>(unstated(candidates, o).map((g) => g.feature));
  const checked = new Map(candidates.map((c) => [c.id, hardChecks(c, o, skip)]));
  // Compare prices only among candidates the traveller could actually get.
  const feasible = candidates.filter((c) => checked.get(c.id)!.failures.length === 0);
  const ranges = numericRanges(feasible.length ? feasible : candidates);

  return candidates.map((c) => {
    const { failures, capsNotApplied } = checked.get(c.id)!;
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
      capsNotApplied,
    };
  });
}

/** One sentence for the orchestrator when a budget could not be applied, or null. Says what happened; converts nothing. */
export function budgetNote(scored: ScoredCandidate[]): string | null {
  const gap = scored.flatMap((s) => s.capsNotApplied)[0];
  if (!gap) return null;
  const priced = gap.priceCurrency ? `the hotel prices in ${gap.priceCurrency}` : "the search did not record which currency the hotel prices in";
  return `The traveller's limit of ${gap.cap} ${gap.capCurrency} was NOT applied: ${priced}. No conversion was made and none may be presented as a price. Tell the traveller which currency the hotel charges in and ask for a limit in that currency, or whether to go on without one.`;
}

/** The best possible score under this objective: every weight fully earned. */
export function maxScore(o: Objective): number {
  return round(Object.values(o.weights).reduce((sum, w) => sum + Math.abs(w ?? 0), 0));
}
