// The payment boundary applied to a driver, so the rule is structural and
// not per call site. Everything that receives a PageDriver in this codebase
// receives this one:
//   - while blind, observe, act, goto and screenshot never reach the page
//   - frames outside the hotel's site are emptied before anything is returned
//   - a location outside the hotel's site is reported as an origin only
//   - card, code and password fields are emptied wherever they sit, and
//     cannot be acted on (payment/redact.ts)
// Signals that read no page content (navigation, close) pass through, since
// the hand-off waits on exactly those while blind.

import type { Observation } from "../../browser.ts";
import { redactObservation } from "../payment/redact.ts";
import type { PaymentBoundary } from "./boundary.ts";
import { originOf, type PageDriver, type PageLocation } from "./driver.ts";

export class BoundaryError extends Error {}

/** Empties frames the boundary forbids. A hidden frame keeps its origin only, never its address. */
export function filterObservation(seen: Observation, boundary: PaymentBoundary): Observation {
  const onHotel = boundary.known(seen.url);
  return {
    url: onHotel ? seen.url : originOf(seen.url),
    title: onHotel ? seen.title : "",
    text: seen.text.map((f) => (boundary.allows(f.frameUrl) ? f : { frameUrl: originOf(f.frameUrl), text: "" })),
    elements: seen.elements.filter((e) => boundary.allows(e.frameUrl)),
  };
}

export function guardedDriver(raw: PageDriver, boundary: PaymentBoundary): PageDriver {
  const refuseIfBlind = (what: string) => {
    if (boundary.blind) throw new BoundaryError(`${what} refused: blind mode, the traveller is in control`);
  };
  const safe = (l: PageLocation): PageLocation => (boundary.known(l.origin) ? l : { origin: l.origin, path: "" });
  /** Ids of sensitive fields in the latest observation. */
  let sensitive = new Set<string>();
  /** Labels of the latest observation's elements, already redacted. */
  let labels = new Map<string, string>();

  return {
    async observe() {
      refuseIfBlind("observe");
      const redacted = redactObservation(filterObservation(await raw.observe(), boundary));
      sensitive = redacted.sensitive;
      labels = new Map(redacted.seen.elements.filter((e) => !sensitive.has(e.id)).map((e) => [e.id, e.name.slice(0, 80)]));
      return redacted.seen;
    },
    async act(action) {
      refuseIfBlind("act");
      if (sensitive.has(action.id)) throw new BoundaryError(`element ${action.id} is a card, code or password field; only the traveller fills those`);
      const frameUrl = raw.frameUrlOf(action.id);
      if (!frameUrl) throw new BoundaryError(`no frame for ${action.id}; observe again`);
      if (!boundary.allows(frameUrl)) throw new BoundaryError(`element ${action.id} is in a frame outside the hotel's site`);
      await raw.act(action);
    },
    async goto(url) {
      refuseIfBlind("goto");
      if (!boundary.allows(url)) throw new BoundaryError(`${originOf(url)} is not the hotel's site`);
      await raw.goto(url);
    },
    location: () => safe(raw.location()),
    labelOf: (id) => (sensitive.has(id) ? null : labels.get(id) ?? null),
    frameUrlOf(id) {
      const url = raw.frameUrlOf(id);
      if (!url) return null;
      return boundary.allows(url) ? url : originOf(url);
    },
    async screenshot() {
      refuseIfBlind("screenshot");
      return raw.screenshot();
    },
    bringToFront: () => raw.bringToFront(),
    async waitForNavigation(timeoutMs) {
      const to = await raw.waitForNavigation(timeoutMs);
      return to === "timeout" ? to : safe(to);
    },
    onNavigated(cb) {
      raw.onNavigated((to) => cb(safe(to)));
    },
    onClosed: (cb) => raw.onClosed(cb),
    close: () => raw.close(),
  };
}
