// Shapes shared by the four agents. Candidate facts, evaluations and
// rejections live in the Store (store.ts); this file adds the goal, the
// objective, the validation verdict and the feature vocabulary.

import type { Chat, Context } from "../types.ts";
import type { RunLog } from "../log.ts";
import { memoryStore, type Store } from "./store.ts";

export type AgentRole = "orchestrator" | "search" | "objective" | "validation";

/** The traveller's request, structured by the orchestrator. */
export interface SearchGoal {
  hotel: { name: string; url: string };
  /** ISO dates. */
  checkin: string;
  checkout: string;
  adults: number;
  /** Hard constraints in plain words, e.g. "free cancellation". */
  mustHave: string[];
  /** Soft preferences, most important first, e.g. "river view", "no breakfast". */
  preferences: string[];
  budget?: { currency: string; maxTotal?: number };
  notes?: string;
}

/** Feature names every agent uses as keys in the Store. Keep this the single vocabulary. */
export const FEATURES = [
  "room_name",
  "rate_name",
  "price_total",
  "price_now",
  "price_at_hotel",
  "price_room",
  "fees_known",
  "currency",
  "charge_currency",
  "cancellable",
  "breakfast_included",
  "view",
  "sleeps",
  "sold_out",
] as const;
export type FeatureName = (typeof FEATURES)[number];
export type FeatureValue = string | number | boolean;

/** What the objective agent produces from the goal. Scored by code, not by a model. */
export interface Objective {
  /** Feature -> weight. Positive rewards, negative penalises. */
  weights: Partial<Record<FeatureName, number>>;
  /** Feature -> required value. A mismatch rejects the candidate under that constraint. */
  hard: Partial<Record<FeatureName, FeatureValue>>;
  /** Wanted substring for string features, e.g. { view: "river" }. */
  wants: Partial<Record<FeatureName, string>>;
  /** The currency the traveller's price caps in `hard` are in, as they wrote it. A cap is only applied to prices in this currency. */
  currency?: string;
  /** A candidate at or above this score is "good enough". */
  threshold: number;
  maxSearchMs: number;
  /** Keep looking this long after the first pass for something better. */
  extraAfterPassMs: number;
}

export interface ValidationResult {
  candidateId: string;
  /** False only when the site contradicts the candidate or the goal, or the page could not be reached. */
  accepted: boolean;
  reasons: string[];
  /** Things the traveller asked for that the site does not state either way. The traveller must be told; it is not a rejection. */
  unverified?: string[];
  /** What the live page showed at validation time. */
  observed: Partial<Record<FeatureName, FeatureValue>>;
  holdSecondsLeft?: number;
}

/** A room price the traveller agreed to after the hotel changed it. Logged with both figures. */
export interface PriceAcceptance {
  candidateId: string;
  /** The room price when the candidate was found. */
  was: number;
  /** The room price the hotel's page showed when the traveller was asked, and which they accepted. */
  now: number;
  /** The all-in total on that page, if it showed one. */
  total?: number;
  currency?: string;
  at: string;
}

/** A total over the traveller's own limit that they agreed to anyway. Logged with the limit. */
export interface OverLimitAcceptance {
  candidateId: string;
  /** The all-in total on the hotel's page that the traveller accepted. */
  total: number;
  limit: number;
  currency?: string;
  at: string;
}

/** In-process state for one booking run. Facts and scores are in `store`. */
export interface RunState {
  goal?: SearchGoal;
  objective?: Objective;
  /** Hash of the current objective; evaluations are keyed by it. */
  objectiveHash?: string;
  /** Set by scoring when a price cap could not be applied because of the currency; the orchestrator must tell the traveller. */
  budgetNotApplied?: string;
  store: Store;
  /** The currency the hotel says it charges in, once any page or validation has shown it. Prices in another currency are refused. */
  chargeCurrency?: string;
  /** Text of the pages the agents observed on the hotel's site, by path, newest kept; code checks recorded prices against it. */
  pages: Record<string, string>;
  lastPage?: string;
  /** Set by the orchestrator's tools when a search must be repeated, e.g. after it recorded a guide currency. */
  searchHint?: string;
  validations: ValidationResult[];
  /** Price rises the traveller accepted, newest last. */
  priceAcceptances: PriceAcceptance[];
  /** Totals over the traveller's limit that they accepted, newest last. */
  overLimitAcceptances: OverLimitAcceptance[];
}

export function newRunState(store: Store = memoryStore()): RunState {
  return { store, validations: [], priceAcceptances: [], overLimitAcceptances: [], pages: {} };
}

/** Everything an agent run needs besides its own tools. */
export interface AgentContext {
  chat: Chat;
  ctx: Context;
  log: RunLog;
  state: RunState;
}
