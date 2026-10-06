// Objective agent: one structured model call that turns the goal into
// weights, hard constraints and a threshold. Scoring itself never touches a
// model. The objective depends on what the traveller wants, not on which
// hotel is searched, so it is reused across hotels in one run.

import { extract } from "../llm/structured.ts";
import { systemPrompt } from "../prompts/index.ts";
import { applyObjective, objectiveSchema } from "../tools/scoring.ts";
import type { AgentContext, SearchGoal } from "../types.ts";

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
    user: `Goal:\n${JSON.stringify(goal, null, 1)}\n\nReturn the objective (the fields of set_objective) as JSON.`,
    schema: objectiveSchema,
    log: a.log,
  });
  const result = applyObjective(a.state, a.log, input);
  a.state.objectiveFor = key;
  return result;
}
