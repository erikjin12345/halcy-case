// The seam between the agents and whatever holds the hotel page. In the
// prototype that is a Playwright page (playwright-driver.ts); on the planned
// mobile path the same calls go to a WebView in the app
// (agent/WEBVIEW-PLAN.md). Agents never get a raw driver: index.ts wraps it
// in guardedDriver (guarded-driver.ts) before anything else sees it.

import type { Action, Observation } from "../../browser.ts";

/** Where the main tab is. Never a query string: hold ids and payment tokens live there. */
export interface PageLocation {
  origin: string;
  path: string;
}

/** An action on an element. Navigation is `goto`, which has its own check. */
export type PageAction = Exclude<Action, { kind: "goto" }>;

export interface PageDriver {
  /** What is visible on the page. Frames outside the hotel's site come back empty. */
  observe(): Promise<Observation>;
  /** One action on one element, then wait for the page to settle. */
  act(action: PageAction): Promise<void>;
  goto(url: string): Promise<void>;
  location(): PageLocation;
  /** Address of the frame an observe id points at, or null if there is none. */
  frameUrlOf(id: string): string | null;
  /** The visible label of an element from the latest observation, as redacted. Null for unknown or sensitive ids. */
  labelOf?(id: string): string | null;
  /** PNG of the viewport. Every embedded frame is always masked; there is no unmasked variant. */
  screenshot(): Promise<Buffer>;
  /** Puts the page in front of the traveller. The hand-off surface in the prototype. */
  bringToFront(): Promise<void>;
  /** Resolves on the next navigation of the main tab, or "timeout". Reads no page content. */
  waitForNavigation(timeoutMs: number): Promise<PageLocation | "timeout">;
  onNavigated(cb: (to: PageLocation) => void): void;
  onClosed(cb: () => void): void;
  close(): Promise<void>;
}

/** Origin of a URL, or a placeholder. Use this whenever a frame address is logged. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown origin";
  }
}

export function locationOf(url: string): PageLocation {
  try {
    const u = new URL(url);
    return { origin: u.origin, path: u.pathname };
  } catch {
    return { origin: "unknown origin", path: "" };
  }
}

export const showLocation = (l: PageLocation): string => `${l.origin}${l.path}`;
