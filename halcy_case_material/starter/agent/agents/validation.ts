// Validation agent: re-verifies one candidate on the live page, in the same
// browser, and stops before anything that completes a booking.

import { decide, validateChoiceDecision, verdictDecision } from "./decisions.ts";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { runAgent } from "../llm/client.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import { showLocation, type PageDriver } from "../tools/driver.ts";
import { browserTools } from "../tools/browser.ts";
import { factsSchema } from "../tools/scoring.ts";
import type { AgentContext, ValidationResult } from "../types.ts";
import { latestAcceptance } from "./approval.ts";
import { contradictions } from "./consistency.ts";
import { honestUnverified } from "./unverified.ts";

export interface ValidationDeps {
  driver: PageDriver;
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
      unverified: z.array(z.string()).default([]).describe("What the traveller asked for that you did not find stated either way, with the pages you looked on"),
      observed: factsSchema.describe("What the page showed. price_total here is the all-in total on the page that shows the charge"),
      holdSecondsLeft: z.number().optional(),
    }),
    run: async (input) => {
      reported = { candidateId: candidate.id, ...input };
      return "Recorded.";
    },
  });

  // Every validation starts from the page the candidate was seen on. Whatever
  // an earlier validation left in the browser (another rate's payment page,
  // a running hold) is not this candidate's.
  const sourceUrl = typeof facts.source_url === "string" ? facts.source_url : goal.hotel.url;
  // Pages this validation opens, so a claim that the site lacks something can be checked.
  const visited: string[] = [];
  let listening = true;
  deps.driver.onNavigated((to) => {
    if (listening && !visited.includes(to.path)) visited.push(to.path);
  });
  await deps.driver.goto(sourceUrl);
  a.log.event("validation.start", { candidateId: candidate.id });
  decide(a.log, validateChoiceDecision(a.state, candidate.id));

  // What the room should cost on the page that shows the charge: the price it
  // was found at, or the price the traveller has since accepted.
  const agreed = latestAcceptance(a.state, candidate.id);
  const expectedRoom = agreed?.now ?? facts.price_total;
  const priceLine = agreed
    ? `The traveller has accepted a room price of ${agreed.now} for this candidate (it was ${agreed.was} when found). Earlier pages may still show ${agreed.was}; that is expected. Compare on the page that shows the charge: the room line there must be ${agreed.now}.`
    : `Expected room price on the page that shows the charge: ${String(expectedRoom ?? "unknown")}.`;

  const t = a.ctx.traveller;
  await runAgent({
    role: "validation",
    user: [
      `Candidate ${candidate.id}:\n${JSON.stringify(facts, null, 1)}`,
      priceLine,
      `Goal:\n${JSON.stringify(goal, null, 1)}`,
      `Traveller (use only if the page asks for guest details): ${t.first} ${t.last}, ${t.email}, ${t.phone}`,
      `The browser has just been taken to the page this candidate was found on (${showLocation(deps.driver.location())}). Start with observe and select this candidate's room and rate from there.`,
    ].join("\n\n"),
    tools: [...browserTools({ driver: deps.driver, boundary: deps.boundary, log: a.log }), report],
    log: a.log,
  });

  listening = false;
  if (!reported) {
    reported = { candidateId: candidate.id, accepted: false, reasons: ["validation agent did not report"], observed: {} };
  }
  if (reported.unverified?.length) {
    const honest = honestUnverified(reported.unverified, visited);
    if (honest.reworded) {
      a.log.event("validation.unverified.reworded", { candidateId: candidate.id, was: reported.unverified, now: honest.items, visited });
      reported = { ...reported, unverified: honest.items };
    }
  }
  const conflicts = reported.accepted ? contradictions(facts, reported.observed) : [];
  const roomNow = reported.observed.price_room;
  if (reported.accepted && agreed && typeof roomNow === "number" && Math.abs(roomNow - agreed.now) > 0.005) {
    conflicts.push(`the traveller accepted a room price of ${agreed.now}, but the page shows ${roomNow}`);
  }
  if (conflicts.length) {
    reported = { ...reported, accepted: false, reasons: [...reported.reasons, ...conflicts.map((c) => `Not this candidate: ${c}`)] };
    a.log.event("validation.overruled", { candidateId: candidate.id, conflicts });
  }
  a.state.validations.push(reported);
  // Facts seen on the live page are newer than the search's; merge them in,
  // except the amounts. The price a candidate was found at and the amounts on
  // the payment page are different things (the page adds taxes and fees), and
  // a second validation must still compare against the first. The page's
  // amounts stay in the ValidationResult, which the approval card and the
  // hand-off read.
  const { price_total: _t, price_now: _n, price_at_hotel: _h, price_room: _r, ...nonPrice } = reported.observed;
  a.state.store.observe(candidate.id, candidate.hotel, nonPrice, "validation");
  if (!reported.accepted) a.state.store.reject(candidate.id, "validation", reported.reasons.join("; "));
  a.log.event("validation.result", { ...reported });
  decide(a.log, verdictDecision(a.state, reported));
  return reported;
}
