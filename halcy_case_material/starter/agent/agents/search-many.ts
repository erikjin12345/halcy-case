// Searching several hotels. The parallel runner (one headless browser per
// hotel, agents/search-parallel.ts) has the signature `runSearches(a, goals)`.
// Until it lands, this stand-in gives the same signature over the one shared
// browser, one hotel after another. Swapping is one import in orchestrator.ts.

import type { AgentContext, SearchGoal } from "../types.ts";
import { runSearch, type SearchDeps } from "./search.ts";

export type SearchResult = { hotel: string; summary: string; error?: string };
export type RunSearches = (a: AgentContext, goals: SearchGoal[]) => Promise<SearchResult[]>;

export function sequentialSearches(deps: SearchDeps): RunSearches {
  return async (a, goals) => {
    const out: SearchResult[] = [];
    for (const goal of goals) {
      // Per-hotel state must not carry over: one hotel's charge currency or pages say nothing about another's.
      a.state.goal = goal;
      a.state.chargeCurrency = undefined;
      a.state.pages = {};
      a.state.lastPage = undefined;
      try {
        out.push({ hotel: goal.hotel.name, summary: await runSearch(a, deps) });
      } catch (e) {
        out.push({ hotel: goal.hotel.name, summary: "", error: String(e).slice(0, 300) });
      }
    }
    return out;
  };
}
