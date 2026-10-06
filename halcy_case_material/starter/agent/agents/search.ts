// Search agent: drives the hotel site, records candidates, scores them.
// Runs on the shared driver so validation and the hand-off can continue in
// the same browser session.

import { runAgent } from "../llm/client.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import type { PageDriver } from "../tools/driver.ts";
import { browserTools } from "../tools/browser.ts";
import { candidateTools } from "../tools/scoring.ts";
import { timeTools } from "../tools/time.ts";
import type { AgentContext } from "../types.ts";

export interface SearchDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
}

export async function runSearch(a: AgentContext, deps: SearchDeps): Promise<string> {
  const { goal, objective } = a.state;
  if (!goal || !objective) throw new Error("search: goal and objective must be set first");

  await deps.driver.goto(goal.hotel.url);
  a.log.event("search.start", { url: goal.hotel.url });

  const result = await runAgent({
    role: "search",
    user: [
      `Hotel: ${goal.hotel.name} at ${goal.hotel.url}`,
      `Stay: ${goal.checkin} to ${goal.checkout}, ${goal.adults} adult(s)`,
      `Must have: ${goal.mustHave.join("; ") || "nothing specific"}`,
      `Preferences: ${goal.preferences.join("; ") || "none"}`,
      `Today: ${a.ctx.today}`,
      "",
      "The browser is on the hotel's front page. Observe first. Record every room-and-rate combination with add_candidate, then call score_candidates and finish with a summary.",
    ].join("\n"),
    tools: [
      ...browserTools({ driver: deps.driver, boundary: deps.boundary, log: a.log }),
      ...candidateTools({ state: a.state, log: a.log }),
      ...timeTools({ startedAt: Date.now(), budgetMs: objective.maxSearchMs }),
    ],
    log: a.log,
  });

  a.log.event("search.done", { candidates: a.state.store.candidates().length, text: result.text });
  return result.text;
}
