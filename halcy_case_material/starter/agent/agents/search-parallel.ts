// Search several hotels at once, each in its own headless browser. Only
// validation and the hand-off use the run's visible browser: validation
// starts from the candidate's source page, so nothing from a search session
// is carried over, and the hotel ties a booking to a browser only from the
// guest-details step, which validation does in the visible one.
//
// Every search browser gets the same protection as the visible one: its own
// payment boundary on that hotel's origin, the guarded driver with field
// redaction, and the guarded run log (the shared one, with the hotel added).

import { openBrowser } from "../../browser.ts";
import type { RunLog } from "../../log.ts";
import { PaymentBoundary } from "../tools/boundary.ts";
import { guardedDriver } from "../tools/guarded-driver.ts";
import { playwrightDriver } from "../tools/playwright-driver.ts";
import type { AgentContext, RunState, SearchGoal } from "../types.ts";
import { runSearch } from "./search.ts";

export interface SearchOutcome {
  hotel: string;
  summary: string;
  error?: string;
}

export const MAX_PARALLEL_SEARCHES = 3;

/**
 * The run's state as one search sees it: shared store, objective and the
 * rest; its own goal, page texts, hint and charge currency, which all belong
 * to one hotel.
 */
export function workerState(base: RunState, goal: SearchGoal): RunState {
  const own: Partial<RunState> = { goal, pages: {}, lastPage: undefined, searchHint: base.searchHint, chargeCurrency: undefined };
  return new Proxy(base, {
    get: (target, key) => (key in own ? own[key as keyof RunState] : Reflect.get(target, key)),
    set: (target, key, value) => (key in own ? ((own as Record<string | symbol, unknown>)[key] = value, true) : Reflect.set(target, key, value)),
  });
}

/** The run log with the hotel added to every event, so interleaved searches stay readable. */
export function hotelLog(log: RunLog, hotel: string): RunLog {
  return new Proxy(log, {
    get: (target, key) =>
      key === "event"
        ? (type: string, data: Record<string, unknown> = {}) => target.event(type, { hotel, ...data })
        : Reflect.get(target, key, target),
  });
}

/** Runs `work` over `items`, at most `limit` at a time, keeping the order of the results. */
export async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  });
  await Promise.all(lanes);
  return out;
}

async function searchOne(a: AgentContext, goal: SearchGoal): Promise<SearchOutcome> {
  const log = hotelLog(a.log, goal.hotel.name);
  const boundary = new PaymentBoundary(goal.hotel.url, log);
  const { browser, page } = await openBrowser({ headless: true });
  log.event("search.browser.open", {});
  try {
    const driver = guardedDriver(await playwrightDriver(page, (url) => boundary.known(url)), boundary);
    const summary = await runSearch({ ...a, log, state: workerState(a.state, goal) }, { driver, boundary });
    return { hotel: goal.hotel.name, summary };
  } catch (e) {
    log.event("search.error", { error: String(e).slice(0, 300) });
    return { hotel: goal.hotel.name, summary: "", error: String(e).slice(0, 300) };
  } finally {
    await browser.close().catch(() => {});
    log.event("search.browser.close", {});
  }
}

/** One search per goal, in parallel, each in its own headless browser. */
export async function runSearches(a: AgentContext, goals: SearchGoal[]): Promise<SearchOutcome[]> {
  const out = await pool(goals, MAX_PARALLEL_SEARCHES, (goal) => searchOne(a, goal));
  a.state.searchHint = undefined;
  return out;
}

