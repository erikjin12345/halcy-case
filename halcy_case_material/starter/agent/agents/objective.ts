// Objective agent: one short model call that turns the goal into weights,
// hard constraints and a threshold. Scoring itself never touches a model.

import { runAgent } from "../llm/client.ts";
import { objectiveTools } from "../tools/scoring.ts";
import type { AgentContext } from "../types.ts";

export async function runObjective(a: AgentContext): Promise<string> {
  if (!a.state.goal) throw new Error("objective: no goal set");
  const result = await runAgent({
    role: "objective",
    user: `Goal:\n${JSON.stringify(a.state.goal, null, 1)}\n\nCall set_objective.`,
    tools: objectiveTools({ state: a.state, log: a.log }),
    log: a.log,
  });
  if (!a.state.objective) throw new Error("objective: the agent did not call set_objective");
  return result.text;
}
