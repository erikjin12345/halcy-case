// Validation agent: re-verifies one candidate on the live page, in the same
// browser, and stops before anything that completes a booking.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Page } from "playwright";
import { z } from "zod";
import { runAgent } from "../llm/client.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import { browserTools } from "../tools/browser.ts";
import { FEATURES, type AgentContext, type ValidationResult } from "../types.ts";

export interface ValidationDeps {
  page: Page;
  boundary: PaymentBoundary;
  candidateId: string;
}

export async function runValidation(a: AgentContext, deps: ValidationDeps): Promise<ValidationResult> {
  const goal = a.state.goal;
  const candidate = a.state.store.candidate(deps.candidateId);
  if (!goal || !candidate) throw new Error(`validation: unknown candidate ${deps.candidateId}`);
  const facts = Object.fromEntries(Object.entries(candidate.features).map(([k, v]) => [k, v.value]));

  let reported: ValidationResult | undefined;
  const report = betaZodTool({
    name: "report_validation",
    description: "Report the verdict for this candidate. Call exactly once.",
    inputSchema: z.object({
      accepted: z.boolean(),
      reasons: z.array(z.string()),
      unverified: z.array(z.string()).default([]).describe("What the traveller asked for that the site does not state either way, with where you looked"),
      observed: z.partialRecord(z.enum(FEATURES), z.union([z.string(), z.number(), z.boolean()])),
      holdSecondsLeft: z.number().optional(),
    }),
    run: async (input) => {
      reported = { candidateId: candidate.id, ...input };
      return "Recorded.";
    },
  });

  const t = a.ctx.traveller;
  await runAgent({
    role: "validation",
    user: [
      `Candidate ${candidate.id}:\n${JSON.stringify(facts, null, 1)}`,
      `Goal:\n${JSON.stringify(goal, null, 1)}`,
      `Traveller (use only if the page asks for guest details): ${t.first} ${t.last}, ${t.email}, ${t.phone}`,
      `The browser is at ${deps.page.url()}. Start with observe; use goto to the candidate's source_url if needed.`,
    ].join("\n\n"),
    tools: [...browserTools({ page: deps.page, boundary: deps.boundary, log: a.log }), report],
    log: a.log,
  });

  if (!reported) {
    reported = { candidateId: candidate.id, accepted: false, reasons: ["validation agent did not report"], observed: {} };
  }
  a.state.validations.push(reported);
  // Facts seen on the live page are newer than the search's; merge them in.
  a.state.store.observe(candidate.id, candidate.hotel, reported.observed, "validation");
  if (!reported.accepted) a.state.store.reject(candidate.id, "validation", reported.reasons.join("; "));
  a.log.event("validation.result", { ...reported });
  return reported;
}
