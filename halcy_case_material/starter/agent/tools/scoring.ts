// Tools that read and write the run state: the goal, the objective, and the
// Store of candidates and evaluations. Scoring is deterministic
// (scoring/objective.ts); the model only sets the parameters.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunLog } from "../../log.ts";
import type { RunnableTool } from "../llm/client.ts";
import { budgetNote, maxScore, objectiveHash, scoreCandidates } from "../scoring/objective.ts";
import { unstated, unstatedNote } from "../scoring/free-text.ts";
import { estimateNote } from "../scoring/cap-estimate.ts";
import { loadRates } from "../scoring/fx.ts";
import { FEATURES, type RunState } from "../types.ts";
import { cleanUrl } from "./serial.ts";
import { sameCurrency } from "../scoring/currency.ts";
import { checkPriceOnPage } from "../scoring/price-on-page.ts";

const featureName = z.enum(FEATURES);
const featureValue = z.union([z.string(), z.number(), z.boolean()]);

const amount = (what: string) => z.number().describe(`${what}. A plain number such as 404 or 320.32: no currency, no text`);
/**
 * Facts about a candidate, each with its own type. A price recorded as text
 * ("GBP 190.00 for the stay") cannot be scored or compared, so the schema
 * does not allow it.
 */
export const factsSchema = z
  .object({
    room_name: z.string(),
    rate_name: z.string(),
    price_total: amount("The room charge for the whole stay as the rate line shows it, before any tax, levy or fee the page lists separately or calls not included"),
    price_room: amount("The room line on the page that shows the charge, before taxes, fees and add-ons"),
    price_now: amount("What is charged at booking"),
    price_at_hotel: amount("What is paid at the hotel"),
    fees_known: amount("Charges the page states as not included in the room price, for the whole stay and the whole party: city tax, visitor levy, cleaning fee. Only what the page states; never an estimate"),
    currency: z.string().describe("The currency of the prices you record, as the page writes it: a symbol or a code"),
    charge_currency: z.string().describe("The currency the page says the hotel charges in, when it says so (\"We charge in pounds sterling\", \"prices in EUR are a guide\"). Leave out if the page does not say"),
    cancellable: z.boolean(),
    breakfast_included: z.boolean(),
    view: z.string(),
    room_details: z.string().describe("What the page says about this room, copied as written: its description and any amenities listed. No summary, nothing added"),
    sleeps: z.number(),
    sold_out: z.boolean(),
  })
  .partial();
// partialRecord, not record: in Zod 4 a record keyed by an enum requires every key.

export const goalSchema = z.object({
  hotel: z.object({ name: z.string(), url: z.string() }),
  checkin: z.string().describe("YYYY-MM-DD"),
  checkout: z.string().describe("YYYY-MM-DD"),
  adults: z.number().int().min(1),
  children: z.array(z.number().int().min(0).max(17)).optional().describe("Ages of children in the party, if any. Leave out when the traveller said adults or no children"),
  mustHave: z.array(z.string()),
  preferences: z.array(z.string()),
  budget: z.object({ currency: z.string(), maxTotal: z.number().optional() }).optional(),
  notes: z.string().optional(),
});

export const objectiveSchema = z.object({
  weights: z.partialRecord(featureName, z.number()),
  hard: z.partialRecord(featureName, featureValue),
  wants: z.partialRecord(featureName, z.string()).optional().describe("Wanted substring for string features, e.g. view: river"),
  currency: z.string().optional().describe("The currency the traveller gave a budget or price cap in, e.g. SEK or EUR. Required whenever hard contains a price"),
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

/** Record an objective in the run state. Used by the objective agent's single call and by the `set_objective` tool. */
export function applyObjective(state: RunState, log: StateToolDeps["log"], input: z.infer<typeof objectiveSchema>): string {
  const { explanation, notes, wants, currency, ...rest } = input;
  {
      // The budget's currency comes from the goal if the objective agent left it out: a cap must never be unit-less.
      state.objective = { ...rest, wants: wants ?? {}, currency: currency ?? state.goal?.budget?.currency };
      state.objectiveHash = objectiveHash(state.objective);
      // A relaxed hard constraint re-admits whatever it had rejected; re-scoring re-rejects the rest.
      const stillHard = new Set(Object.keys(state.objective.hard));
      let readmitted = 0;
      for (const constraint of new Set(state.store.rejected().map((r) => r.constraint))) {
        if (!stillHard.has(constraint) && constraint !== "validation") readmitted += state.store.readmit(constraint);
      }
      log.event("objective.set", { objective: state.objective, hash: state.objectiveHash, explanation, notes, readmitted });
      return `Objective recorded. Maximum possible score is ${maxScore(state.objective)}.`;
  }
}

export function objectiveTools({ state, log }: StateToolDeps): RunnableTool[] {
  const setObjective = betaZodTool({
    name: "set_objective",
    description: "Record the scoring objective derived from the goal.",
    inputSchema: objectiveSchema,
    run: async (input) => applyObjective(state, log, input),
  });
  return [setObjective];
}

export function candidateTools({ state, log }: StateToolDeps): RunnableTool[] {
  const addCandidate = betaZodTool({
    name: "add_candidate",
    description: "Record one room-and-rate combination seen on the hotel site, with the facts the page states. Call once per combination; calling again with the same id merges new facts.",
    inputSchema: z.object({
      id: z.string().describe("Short stable id, e.g. river-flex"),
      features: factsSchema,
      sourceUrl: z.string(),
    }),
    run: async ({ id, features, sourceUrl: rawUrl }) => {
      // The number and its currency are checked against the text of the page the agent read, by code.
      let pathOf = "";
      try {
        pathOf = new URL(cleanUrl(rawUrl)).pathname;
      } catch {
        // keep the last page
      }
      const page = state.pages[pathOf] ?? state.lastPage;
      if (page && features.price_total !== undefined) {
        const g = state.goal;
        const nights = g ? Math.round((Date.parse(g.checkout) - Date.parse(g.checkin)) / 86_400_000) : undefined;
        const seen = checkPriceOnPage(page, features.price_total, features.charge_currency ?? state.chargeCurrency, Number.isFinite(nights) ? nights : undefined);
        if (!seen.ok) {
          log.event("candidate.refused", { id, reason: seen.reason });
          return `Refused: ${seen.reason}.`;
        }
        if (seen.currency && features.currency !== seen.currency) {
          log.event("candidate.currency.corrected", { id, recorded: features.currency ?? null, onPage: seen.currency });
          features.currency = seen.currency;
        }
      }
      // A price is only a price in the currency the hotel charges in; a guide figure is not one.
      if (features.charge_currency) state.chargeCurrency = features.charge_currency;
      const charge = state.chargeCurrency;
      if (charge && features.price_total !== undefined && (!features.currency || !sameCurrency(charge, features.currency))) {
        log.event("candidate.refused", { id, currency: features.currency ?? null, chargeCurrency: charge });
        return `Refused: the hotel charges in ${charge}, but this price is in ${features.currency ?? "an unstated currency"}. A converted or guide figure is not the price. Switch the page to ${charge} if it offers that, then record the price as shown in ${charge}.`;
      }
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
    run: async () => scoreAll(state, log),
  });

  return [addCandidate, score];
}

/** Score every stored candidate against the current objective, in code. Also used to re-rank cached candidates without a new search. */
export async function scoreAll(state: RunState, log: StateToolDeps["log"]): Promise<string> {
      const o = state.objective;
      if (!o || !state.objectiveHash) return "No objective set yet.";
      // Anything recorded before the charge currency was known, in another currency, is not a price.
      // The charge currency is one hotel's: never apply it to another hotel's rooms.
      const charge = state.chargeCurrency;
      if (charge) {
        for (const c of state.store.candidates().filter((c) => c.hotel === state.goal?.hotel.name)) {
          const cur = c.features.currency?.value;
          if (typeof cur === "string" && !sameCurrency(charge, cur)) state.store.reject(c.id, "charge_currency", `priced in ${cur}, but the hotel charges in ${charge}`);
        }
      }
      const all = [...state.store.candidates(), ...state.store.rejected().map((r) => state.store.candidate(r.candidateId)!).filter(Boolean)];
      const rates = await loadRates();
      const scored = scoreCandidates(all, o, rates);
      for (const { evaluation, failures } of scored) {
        state.store.evaluate(evaluation);
        // One rejection per candidate, under its most telling constraint, with every reason kept.
        if (failures.length) state.store.reject(evaluation.candidateId, failures[0].constraint, failures.map((f) => f.reason).join("; "));
      }
      const budgetNotApplied = [budgetNote(scored), estimateNote(scored.flatMap((s) => s.capsEstimated), rates)].filter(Boolean).join(" ") || null;
      state.budgetNotApplied = budgetNotApplied ?? undefined;
      const notStated = unstatedNote(unstated(all, o));
      state.notStated = notStated ?? undefined;
      const out = { threshold: o.threshold, max: maxScore(o), ranking: state.store.ranked(state.objectiveHash), rejected: state.store.rejected(), ...(budgetNotApplied ? { budgetNotApplied } : {}), ...(notStated ? { notStated } : {}) };
      log.event("candidates.scored", out);
      return JSON.stringify(out, null, 1);
}
