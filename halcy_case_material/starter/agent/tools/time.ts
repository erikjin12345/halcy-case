// A clock the search agent can ask. Search budgets come from the objective;
// once a hotel hold exists, the hold clock is the real deadline and should be
// passed in as `deadlineMs`.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunnableTool } from "../llm/client.ts";

export interface TimeToolDeps {
  startedAt: number;
  budgetMs: number;
  /** Absolute time after which the agent must stop, e.g. hold expiry. */
  deadlineMs?: number;
}

export function timeTools(deps: TimeToolDeps): RunnableTool[] {
  const check = betaZodTool({
    name: "check_time",
    description: "How much of the search budget is left. Stop and report when it says so.",
    inputSchema: z.object({}),
    run: async () => {
      const now = Date.now();
      const left = deps.budgetMs - (now - deps.startedAt);
      const untilDeadline = deps.deadlineMs ? deps.deadlineMs - now : Infinity;
      const remaining = Math.min(left, untilDeadline);
      if (remaining <= 0) return "Budget spent. Stop now and report what you have.";
      return `${Math.round(remaining / 1000)} seconds left.`;
    },
  });
  return [check];
}
