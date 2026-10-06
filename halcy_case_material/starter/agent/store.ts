// In-process state shared by the agents, in the three-table shape of
// agent/ARCHITECTURE.md section 2.9: candidates, evaluations, rejected.
//
// Everything lives in memory and dies with the run. That is deliberate: the
// hotel's hold and browser session die with the run too, so nothing here is
// worth keeping across a restart. Evidence goes to RunLog, not to the store.
// A Firestore or sqlite store implements the same `Store` interface later.

import { createHash } from "node:crypto";

/** A fact about a candidate, with when and where it was seen. */
export interface Observed<T = unknown> {
  value: T;
  observedAt: string;
  /** Page or tool the fact came from, e.g. "rooms page". */
  source: string;
}

export interface Candidate {
  id: string;
  hotel: string;
  features: Record<string, Observed>;
}

export interface Evaluation {
  candidateId: string;
  objectiveHash: string;
  score: number;
  components: Record<string, number>;
  feasible: boolean;
  at: string;
}

export interface Rejection {
  candidateId: string;
  /** The hard constraint that failed, so relaxing it can re-admit the candidate. */
  constraint: string;
  reason: string;
  at: string;
}

export interface Snapshot {
  candidates: Candidate[];
  evaluations: Evaluation[];
  rejected: Rejection[];
}

export interface Store {
  /** Merge observed features into a candidate, creating it if new. Returns the merged candidate. */
  observe(id: string, hotel: string, features: Record<string, unknown>, source: string): Candidate;
  candidate(id: string): Candidate | undefined;
  /** All candidates not currently rejected. */
  candidates(): Candidate[];

  evaluate(e: Omit<Evaluation, "at">): Evaluation;
  evaluation(candidateId: string, objectiveHash: string): Evaluation | undefined;
  /** Evaluations for one objective, best score first, feasible before infeasible. */
  ranked(objectiveHash: string): Evaluation[];

  reject(candidateId: string, constraint: string, reason: string): Rejection;
  /** Re-admit every candidate rejected for this constraint. Returns how many. */
  readmit(constraint: string): number;
  rejected(): Rejection[];

  /** Plain objects for logging or a JSON export. */
  snapshot(): Snapshot;
}

/** Stable hash of weights plus hard constraints. A changed goal gets a new hash, so stale scores need no invalidation. */
export function objectiveHash(weights: Record<string, number>, hard: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson({ weights, hard })).digest("hex").slice(0, 16);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const evalKey = (candidateId: string, objectiveHash: string) => `${candidateId}\u0000${objectiveHash}`;

/** The in-memory store used by the prototype. `now` is injectable for tests. */
export function memoryStore(now: () => string = () => new Date().toISOString()): Store {
  const candidates = new Map<string, Candidate>();
  const evaluations = new Map<string, Evaluation>();
  const rejected = new Map<string, Rejection>();

  return {
    observe(id, hotel, features, source) {
      const existing = candidates.get(id) ?? { id, hotel, features: {} };
      const at = now();
      for (const [key, value] of Object.entries(features)) {
        existing.features[key] = { value, observedAt: at, source };
      }
      candidates.set(id, existing);
      return existing;
    },
    candidate: (id) => candidates.get(id),
    candidates: () => [...candidates.values()].filter((c) => !rejected.has(c.id)),

    evaluate(e) {
      const full: Evaluation = { ...e, at: now() };
      evaluations.set(evalKey(e.candidateId, e.objectiveHash), full);
      return full;
    },
    evaluation: (candidateId, hash) => evaluations.get(evalKey(candidateId, hash)),
    ranked(hash) {
      return [...evaluations.values()]
        .filter((e) => e.objectiveHash === hash && !rejected.has(e.candidateId))
        .sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.score - a.score);
    },

    reject(candidateId, constraint, reason) {
      const r: Rejection = { candidateId, constraint, reason, at: now() };
      rejected.set(candidateId, r);
      return r;
    },
    readmit(constraint) {
      let n = 0;
      for (const [id, r] of rejected) if (r.constraint === constraint) rejected.delete(id), n++;
      return n;
    },
    rejected: () => [...rejected.values()],

    snapshot: () => ({
      candidates: [...candidates.values()],
      evaluations: [...evaluations.values()],
      rejected: [...rejected.values()],
    }),
  };
}
