// Tools that read and write the run state: the goal, the objective, and the
// Store of candidates and evaluations. Scoring is deterministic
// (scoring/objective.ts); the model only sets the parameters.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunLog } from "../../log.ts";
import type { RunnableTool } from "../llm/client.ts";
import { maxScore, objectiveHash, scoreCandidates } from "../scoring/objective.ts";
import { FEATURES, type RunState } from "../types.ts";
import { cleanUrl } from "./serial.ts";

const featureName = z.enum(FEATURES);
const featureValue = z.union([z.string(), z.number(), z.boolean()]);
// partialRecord, not record: in Zod 4 a record keyed by an enum requires every key.

export const goalSchema = z.object({
  hotel: z.object({ name: z.string(), url: z.string() }),
  checkin: z.string().describe("YYYY-MM-DD"),
  checkout: z.string().describe("YYYY-MM-DD"),
  adults: z.number().int().min(1),
  mustHave: z.array(z.string()),
  preferences: z.array(z.string()),
  budget: z.object({ currency: z.string(), maxTotal: z.number().optional() }).optional(),
  notes: z.string().optional(),
});

export const objectiveSchema = z.object({
  weights: z.partialRecord(featureName, z.number()),
  hard: z.partialRecord(featureName, featureValue),
  wants: z.partialRecord(featureName, z.string()).optional().describe("Wanted substring for string features, e.g. view: river"),
  threshold: z.number(),
  maxSearchMs: z.number().int().default(180000),
  extraAfterPassMs: z.number().int().default(20000),
  explanation: z.string(),
  notes: z.string().optional(),
});

export interface StateToolDeps {
  state: RunState;
  log: RunLog;
}

export function goalTools({ state, log }: StateToolDeps): RunnableTool[] {
  const setGoal = betaZodTool({
    name: "set_goal",
    description: "Record or replace the traveller's structured goal. Call again if the traveller changes their mind.",
    inputSchema: goalSchema,
    run: async (goal) => {
      state.goal = goal;
      log.event("goal.set", goal);
      return "Goal recorded.";
    },
  });
  return [setGoal];
}

export function objectiveTools({ state, log }: StateToolDeps): RunnableTool[] {
  const setObjective = betaZodTool({
    name: "set_objective",
    description: "Record the scoring objective derived from the goal.",
    inputSchema: objectiveSchema,
    run: async ({ explanation, notes, wants, ...rest }) => {
      state.objective = { ...rest, wants: wants ?? {} };
      state.objectiveHash = objectiveHash(state.objective);
      // A relaxed hard constraint re-admits whatever it had rejected; re-scoring re-rejects the rest.
      const stillHard = new Set(Object.keys(state.objective.hard));
      let readmitted = 0;
      for (const constraint of new Set(state.store.rejected().map((r) => r.constraint))) {
        if (!stillHard.has(constraint) && constraint !== "validation") readmitted += state.store.readmit(constraint);
      }
      log.event("objective.set", { objective: state.objective, hash: state.objectiveHash, explanation, notes, readmitted });
      return `Objective recorded. Maximum possible score is ${maxScore(state.objective)}.`;
    },
  });
  return [setObjective];
}

export function candidateTools({ state, log }: StateToolDeps): RunnableTool[] {
  const addCandidate = betaZodTool({
    name: "add_candidate",
    description: "Record one room-and-rate combination seen on the hotel site, with the facts the page states. Call once per combination; calling again with the same id merges new facts.",
    inputSchema: z.object({
      id: z.string().describe("Short stable id, e.g. river-flex"),
      features: z.partialRecord(featureName, featureValue),
      sourceUrl: z.string(),
    }),
    run: async ({ id, features, sourceUrl: rawUrl }) => {
      const sourceUrl = cleanUrl(rawUrl);
      state.store.observe(id, state.goal?.hotel.name ?? "unknown", { ...features, source_url: sourceUrl }, sourceUrl);
      log.event("candidate.add", { id, features, sourceUrl });
      return `Recorded ${id}. ${state.store.candidates().length} candidate(s) so far.`;
    },
  });

  const score = betaZodTool({
    name: "score_candidates",
    description: "Score every recorded candidate against the current objective. Returns the ranking with components, and the candidates rejected by a hard constraint with the reason.",
    inputSchema: z.object({}),
    run: async () => {
      const o = state.objective;
      if (!o || !state.objectiveHash) return "No objective set yet.";
      const all = [...state.store.candidates(), ...state.store.rejected().map((r) => state.store.candidate(r.candidateId)!).filter(Boolean)];
      for (const { evaluation, failures } of scoreCandidates(all, o)) {
        state.store.evaluate(evaluation);
        // One rejection per candidate, under its most telling constraint, with every reason kept.
        if (failures.length) state.store.reject(evaluation.candidateId, failures[0].constraint, failures.map((f) => f.reason).join("; "));
      }
      const out = { threshold: o.threshold, max: maxScore(o), ranking: state.store.ranked(state.objectiveHash), rejected: state.store.rejected() };
      log.event("candidates.scored", out);
      return JSON.stringify(out, null, 1);
    },
  });

  return [addCandidate, score];
}
