// Objective agent: one structured model call that turns the goal into
// weights, hard constraints and a threshold. Scoring itself never touches a
// model. The objective depends on what the traveller wants, not on which
// hotel is searched, so it is reused across hotels in one run.

import { extract } from "../llm/structured.ts";
import { systemPrompt } from "../prompts/index.ts";
import { applyObjective, objectiveSchema } from "../tools/scoring.ts";
import { z } from "zod";
import { FEATURES, type AgentContext, type SearchGoal } from "../types.ts";

// Structured output cannot fill a record keyed by an enum, and limits optional
// fields, so the single call returns lists of pairs, folded back into the
// objective shape the rest of the code uses.
const feature = z.enum(FEATURES);
export const objectiveExtractSchema = objectiveSchema.extend({
  weights: z.array(z.object({ feature, weight: z.number() })),
  hard: z.array(z.object({ feature, value: z.union([z.string(), z.number(), z.boolean()]) })),
  wants: z.array(z.object({ feature, value: z.string() })),
});
const pairs = <T>(list: { feature: string; v: T }[]) => Object.fromEntries(list.map((p) => [p.feature, p.v])) as Record<string, T>;

/** The parts of a goal the objective depends on: everything but the hotel. */
export function objectiveKey(goal: SearchGoal): string {
  const { hotel: _hotel, ...wants } = goal;
  return JSON.stringify(wants, Object.keys(wants).sort());
}

export async function runObjective(a: AgentContext): Promise<string> {
  const goal = a.state.goal;
  if (!goal) throw new Error("objective: no goal set");
  const key = objectiveKey(goal);
  if (a.state.objective && a.state.objectiveFor === key) {
    a.log.event("objective.reused", { hash: a.state.objectiveHash });
    return "Objective unchanged: only the hotel changed, so the same weights and constraints apply. Go on with run_search.";
  }
  const input = await extract({
    role: "objective",
    system: systemPrompt("objective"),
    user: `Goal:\n${JSON.stringify(goal, null, 1)}\n\nReturn the objective as JSON. weights, hard and wants are lists of {feature, weight} or {feature, value} pairs, one per feature you use.`,
    schema: objectiveExtractSchema,
    log: a.log,
  });
  const result = applyObjective(a.state, a.log, objectiveSchema.parse({
      ...input,
      weights: pairs(input.weights.map((w) => ({ feature: w.feature, v: w.weight }))),
      hard: pairs(input.hard.map((h) => ({ feature: h.feature, v: h.value }))),
      wants: pairs(input.wants.map((w) => ({ feature: w.feature, v: w.value }))),
    }));
  a.state.objectiveFor = key;
  return result;
}
