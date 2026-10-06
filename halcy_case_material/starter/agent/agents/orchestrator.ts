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
import { serialise } from "../tools/serial.ts";
import type { AgentContext } from "../types.ts";
import { approvalBlocker, overLimit } from "./approval.ts";
import { sameCurrency } from "../scoring/currency.ts";
import { runObjective } from "./objective.ts";
import { overLimitTool, priceChangeTool } from "./price-change.ts";
import { runSearch } from "./search.ts";
import { runValidation } from "./validation.ts";
import { fxTools } from "./fx-tools.ts";

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
        const { budgetNotApplied, notStated } = a.state;
        return JSON.stringify({ summary, threshold, passing, ranking, rejected: store.rejected(), ...(budgetNotApplied ? { budgetNotApplied } : {}), ...(notStated ? { notStated } : {}) }, null, 1);
      } catch (e) {
        return errorText(e);
      }
    },
  });

  const runValidationTool = betaZodTool({
    name: "run_validation",
    description: "Verify one candidate on the live site. Returns accepted or rejected with reasons and what the page showed. There is one browser: calls run one after another, and the browser ends on the candidate validated last.",
    inputSchema: z.object({ candidateId: z.string() }),
    run: async ({ candidateId }) =>
      runValidation(a, { ...deps, candidateId })
        .then((r) => {
          // The limit is for everything the traveller will pay; tell the orchestrator before it tries to approve.
          const over = r.accepted ? overLimit(a.state, candidateId) : null;
          // Search read a price in a currency the hotel does not charge in. That is Halcy's mistake to fix, not the traveller's question.
          const charged = typeof r.observed.currency === "string" ? r.observed.currency : undefined;
          const recorded = a.state.store.candidate(candidateId)?.features.currency?.value;
          if (!r.accepted && charged && typeof recorded === "string" && !sameCurrency(charged, recorded)) {
            a.state.chargeCurrency = charged;
            a.state.searchHint = `the hotel charges in ${charged}; the previous search recorded prices in ${recorded}, a guide figure. Record prices in ${charged} only.`;
            a.log.event("search.retry.currency", { candidateId, recorded, charged });
            return JSON.stringify({ ...r, searchError: `Search recorded ${recorded} prices but the hotel charges in ${charged}. This is Halcy's error: call run_search once more now, without asking the traveller. Prices in ${recorded} are refused from here on.` }, null, 1);
          }
          const overLimitNote = over ? `The total on the hotel's page, ${over.total}, is ${over.over} over the traveller's limit of ${over.limit}. Validate a cheaper candidate that fits, or call ask_over_limit. mark_approved is refused until then.` : undefined;
          return JSON.stringify({ ...r, ...(overLimitNote ? { overLimit: overLimitNote } : {}) }, null, 1);
        })
        .catch(errorText),
  });

  // One browser, one agent at a time: two validations issued in the same turn
  // must not drive the same page together.
  const [searchInTurn, validationInTurn] = serialise([runSearchTool, runValidationTool]);

  const approveTool = betaZodTool({
    name: "mark_approved",
    description: "Record that the traveller pressed the button to continue to payment for this candidate. Call only after ask_traveller returned that choice, or after ask_price_change returned accepted and run_validation then accepted the candidate.",
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
    tools: [...chatTools({ chat: a.chat, log: a.log }), ...goalTools({ state: a.state, log: a.log }), runObjectiveTool, searchInTurn, validationInTurn, priceChangeTool(a), overLimitTool(a), ...fxTools(a), approveTool],
    log: a.log,
  });

  a.log.event("state.snapshot", { ...a.state.store.snapshot() });
  return approved;
}
