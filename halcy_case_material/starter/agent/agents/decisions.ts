// Decision lines for the test-mode trace: why the agent chose what it chose,
// built only from code-made data (objective, scores, rejections, verdicts,
// prices). No model is asked to explain itself: prompting for reasoning is
// refused by the API (reasoning_extraction), and code-made data is exact.
// Logged as `trace.decision` {kind, text, detail?}; the trace panel shows
// them in test mode only. Nothing is logged while the payment hand-off is blind.

import type { Evaluation, Rejection } from "../store.ts";
import type { Objective, RunState, ValidationResult } from "../types.ts";
import { maxScore } from "../scoring/objective.ts";

export type DecisionKind = "objective" | "scoring" | "comparison" | "validate-choice" | "verdict" | "price" | "limit";
export interface Decision {
  kind: DecisionKind;
  text: string;
  detail?: string;
}

interface EventSink {
  event(type: string, data?: Record<string, unknown>): void;
  readonly blind?: boolean;
}

/** Write a decision to the run log, unless the hand-off is blind. GuardedLog scrubs it like any event. */
export function decide(log: EventSink, d: Decision | null): void {
  if (!d || log.blind) return;
  log.event("trace.decision", { ...d });
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const amount = (n: unknown, cur?: unknown) => (typeof n === "number" ? `${n.toFixed(2)}${typeof cur === "string" ? ` ${cur}` : ""}` : "unknown");

/** A candidate's name as the traveller would read it: room and rate, with its id. */
export function label(state: RunState, id: string): string {
  const f = state.store.candidate(id)?.features;
  const name = [f?.room_name?.value, f?.rate_name?.value].filter((v) => typeof v === "string").join(", ");
  return name ? `${name} (${id})` : id;
}

const components = (e: Evaluation) =>
  Object.entries(e.components)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${r2(v)}`)
    .join(", ") || "no weighted feature";

export function objectiveDecision(o: Objective, explanation?: string): Decision {
  const weights = Object.entries(o.weights).map(([k, v]) => `weight ${k}: ${v}`);
  const hard = Object.entries(o.hard).map(([k, v]) => `must: ${k} = ${String(v)}${k === "price_total" && o.currency ? ` ${o.currency}` : ""}`);
  const wants = Object.entries(o.wants).map(([k, v]) => `wants: ${k} contains "${v}"`);
  return {
    kind: "objective",
    text: `Objective: ${weights.length} weighted feature(s), ${hard.length} hard constraint(s); good enough at score ${o.threshold} of ${r2(maxScore(o))}.`,
    detail: [...hard, ...weights, ...wants, ...(explanation ? [`Why this threshold and these weights: ${explanation}`] : [])].join("\n"),
  };
}

/** Ranking and rejections after a scoring pass, plus a comparison when more than one hotel has a feasible room. */
export function scoringDecisions(state: RunState, ranking: Evaluation[], rejected: Rejection[], threshold: number): Decision[] {
  const hotel = (id: string) => state.store.candidate(id)?.hotel ?? "?";
  const feasible = ranking.filter((e) => e.feasible);
  const best = feasible[0];
  const lines = [
    ...feasible.slice(0, 6).map((e, i) => `${i + 1}. ${label(state, e.candidateId)} at ${hotel(e.candidateId)}: score ${r2(e.score)} = ${components(e)}${e.score < threshold ? " (below threshold)" : ""}`),
    ...rejected.map((r) => `rejected ${label(state, r.candidateId)}: ${r.constraint}: ${r.reason}`),
  ];
  const out: Decision[] = [
    {
      kind: "scoring",
      text: best
        ? `Best by score: ${label(state, best.candidateId)}, ${r2(best.score)} (threshold ${threshold}); ${feasible.length} feasible, ${rejected.length} rejected.`
        : `No feasible room; ${rejected.length} rejected by a hard constraint.`,
      detail: lines.join("\n"),
    },
  ];
  const perHotel = new Map<string, Evaluation>();
  for (const e of feasible) if (!perHotel.has(hotel(e.candidateId))) perHotel.set(hotel(e.candidateId), e);
  if (perHotel.size > 1) {
    const rows = [...perHotel].map(([h, e]) => {
      const f = state.store.candidate(e.candidateId)?.features;
      return `${h}: ${label(state, e.candidateId)}, score ${r2(e.score)}, room ${amount(f?.price_total?.value, f?.currency?.value)}`;
    });
    const currencies = new Set([...perHotel.values()].map((e) => String(state.store.candidate(e.candidateId)?.features.currency?.value ?? "")));
    // Scores compare prices as written; across currencies only the converted comparison (compare_prices) says which is cheaper.
    if (currencies.size > 1) rows.push("Prices are in different currencies: scores compare the figures as written, not converted.");
    out.push({ kind: "comparison", text: `Across hotels, ${[...perHotel.keys()][0]} ranks first by score.`, detail: rows.join("\n") });
  }
  return out;
}

export function validateChoiceDecision(state: RunState, id: string): Decision {
  const ranked = state.objectiveHash ? state.store.ranked(state.objectiveHash).filter((e) => e.feasible) : [];
  const rank = ranked.findIndex((e) => e.candidateId === id);
  const where = rank >= 0 ? `rank ${rank + 1} of ${ranked.length} by score (${r2(ranked[rank].score)})` : "not in the current ranking";
  return { kind: "validate-choice", text: `Validating ${label(state, id)}: ${where}.` };
}

export function verdictDecision(state: RunState, r: ValidationResult): Decision {
  const o = r.observed;
  return {
    kind: "verdict",
    text: `Validation ${r.accepted ? "accepted" : "rejected"} ${label(state, r.candidateId)}${r.reasons.length ? `: ${r.reasons[0]}` : "."}`,
    detail: [
      ...r.reasons.map((x) => `reason: ${x}`),
      ...(r.unverified ?? []).map((x) => `not stated on the site: ${x}`),
      `on the page: total ${amount(o.price_total, o.currency)}, now ${amount(o.price_now)}, at the hotel ${amount(o.price_at_hotel)}`,
    ].join("\n"),
  };
}

export function priceDecision(state: RunState, id: string, offer: { was: number; now: number; total?: number; currency?: string }): Decision {
  return { kind: "price", text: `Room price for ${label(state, id)} changed from ${amount(offer.was, offer.currency)} to ${amount(offer.now, offer.currency)}; the traveller decides.` };
}

export function limitDecision(state: RunState, id: string, over: { total: number; limit: number; over?: number | string; currency?: string }): Decision {
  return { kind: "limit", text: `Total for ${label(state, id)} is ${amount(over.total, over.currency)}, over the limit of ${amount(over.limit, over.currency)}; the traveller decides.` };
}
