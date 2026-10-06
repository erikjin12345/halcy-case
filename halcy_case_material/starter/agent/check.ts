// Smoke test for the LLM plumbing: `npm run agent:check`. Makes two tiny
// calls (one structured extraction, one tool-use turn) and prints usage.
// Costs well under a cent. Needs ANTHROPIC_API_KEY (or a .env with it).

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { RunLog } from "../log.ts";
import { hasCredential, loadDotEnv, roleConfig } from "./config.ts";
import { runAgent } from "./llm/client.ts";
import { extract } from "./llm/structured.ts";
import { scoreCandidates } from "./scoring/objective.ts";
import { memoryStore } from "./store.ts";
import type { AgentRole } from "./types.ts";

loadDotEnv();
const roles: AgentRole[] = ["orchestrator", "search", "objective", "validation"];
for (const role of roles) console.log(`${role.padEnd(13)} ${JSON.stringify(roleConfig(role))}`);

// Deterministic part runs without a key.
const store = memoryStore();
store.observe("a", "x", { price_total: 300, cancellable: true, view: "river" }, "test");
store.observe("b", "x", { price_total: 200, cancellable: false, view: "courtyard" }, "test");
const scored = scoreCandidates(store.candidates(), {
  weights: { price_total: -0.5, view: 1 },
  hard: { cancellable: true },
  wants: { view: "river" },
  threshold: 0.5,
  maxSearchMs: 1,
  extraAfterPassMs: 1,
});
console.log("scoring ok:", scored.map((s) => `${s.evaluation.candidateId}=${s.evaluation.score}${s.evaluation.feasible ? "" : " (infeasible)"}`).join(", "));

if (!hasCredential()) {
  console.error("\nNo ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN in the environment. Put one in .env and re-run.");
  process.exit(1);
}

const log = new RunLog("check");

const parsed = await extract({
  role: "objective",
  system: "Extract the stay from the sentence.",
  user: "Two of us, Friday 13 to Sunday 15 March 2026.",
  schema: z.object({ adults: z.number(), checkin: z.string(), checkout: z.string() }),
  log,
});
console.log("structured ok:", parsed);

const ping = betaZodTool({
  name: "ping",
  description: "Returns pong. Call it once, then reply with the single word done.",
  inputSchema: z.object({}),
  run: async () => "pong",
});
const run = await runAgent({ role: "validation", user: "Call ping, then say done.", tools: [ping], log, maxIterations: 3 });
console.log("tool loop ok:", JSON.stringify(run));
console.log("run log:", log.dir);
