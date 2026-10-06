// Orchestrator: the only agent that talks to the traveller. It owns the goal
// and delegates to the other agents through tools, all in one process and
// one browser session.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runAgent } from "../llm/client.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import type { PageDriver } from "../tools/driver.ts";
import { chatTools } from "../tools/chat.ts";
import { goalTools } from "../tools/scoring.ts";
import type { AgentContext } from "../types.ts";
import { approvalBlocker } from "./approval.ts";
import { runObjective } from "./objective.ts";
import { runSearch } from "./search.ts";
import { runValidation } from "./validation.ts";

export interface OrchestratorDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
}

const errorText = (e: unknown) => `Error: ${String(e).slice(0, 300)}`;

/** Runs the whole conversation turn. Returns the id of the validated candidate the traveller approved, if any. */
export async function runOrchestrator(a: AgentContext, message: string, deps: OrchestratorDeps): Promise<string | null> {
  let approved: string | null = null;

  const runObjectiveTool = betaZodTool({
    name: "run_objective",
    description: "Turn the current goal into a scoring objective. Call after set_goal, and again whenever the goal changes.",
    inputSchema: z.object({}),
    run: async () => runObjective(a).catch(errorText),
  });

  const runSearchTool = betaZodTool({
    name: "run_search",
    description: "Search the hotel site for rooms and rates matching the goal and score them. Returns the search agent's summary plus the ranking and the rejected candidates.",
    inputSchema: z.object({}),
    run: async () => {
      try {
        const summary = await runSearch(a, deps);
        const { store, objective, objectiveHash } = a.state;
        const ranking = objectiveHash ? store.ranked(objectiveHash) : [];
        const threshold = objective?.threshold ?? 0;
        const passing = ranking.filter((e) => e.feasible && e.score >= threshold).length;
        return JSON.stringify({ summary, threshold, passing, ranking, rejected: store.rejected() }, null, 1);
      } catch (e) {
        return errorText(e);
      }
    },
  });

  const runValidationTool = betaZodTool({
    name: "run_validation",
    description: "Verify one candidate on the live site. Returns accepted or rejected with reasons and what the page showed.",
    inputSchema: z.object({ candidateId: z.string() }),
    run: async ({ candidateId }) =>
      runValidation(a, { ...deps, candidateId })
        .then((r) => JSON.stringify(r, null, 1))
        .catch(errorText),
  });

  const approveTool = betaZodTool({
    name: "mark_approved",
    description: "Record that the traveller pressed the button to continue to payment for this candidate. Call only after ask_traveller returned that choice.",
    inputSchema: z.object({ candidateId: z.string() }),
    run: async ({ candidateId }) => {
      const blocker = approvalBlocker(a.state, candidateId);
      if (blocker) {
        a.log.event("approval.refused", { candidateId, blocker });
        return `Refused: ${blocker}`;
      }
      approved = candidateId;
      a.log.event("traveller.approved", { candidateId });
      return "Recorded. End your turn now without sending another message; the hand-off card is shown next.";
    },
  });

  const t = a.ctx.traveller;
  await runAgent({
    role: "orchestrator",
    user: [
      `Today: ${a.ctx.today}`,
      `Traveller: ${t.first} ${t.last}`,
      `Known hotels (name -> booking site): ${JSON.stringify(a.ctx.hotels)}`,
      `Traveller's message: ${message}`,
    ].join("\n"),
    tools: [...chatTools({ chat: a.chat, log: a.log }), ...goalTools({ state: a.state, log: a.log }), runObjectiveTool, runSearchTool, runValidationTool, approveTool],
    log: a.log,
  });

  a.log.event("state.snapshot", { ...a.state.store.snapshot() });
  return approved;
}
