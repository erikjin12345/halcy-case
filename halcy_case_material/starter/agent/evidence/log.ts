// A RunLog that enforces the payment boundary on the evidence trail itself.
// Two rules, independent of whoever calls it:
//   1. Between `handoff.blind.start` and `handoff.blind.end` no observation
//      of the page (observe, act, goto, screenshot) can be written. Chat and
//      hand-off events still can, so the log shows what the traveller said.
//   2. Nothing that looks like a card number is ever written, in any event.
// The blind state is read from the event stream, so this needs no reference
// to PaymentBoundary and cannot drift from what the log actually shows.

import { RunLog } from "../../log.ts";
import { redactCardNumbers } from "./card-number.ts";

export const BLIND_START = "handoff.blind.start";
export const BLIND_END = "handoff.blind.end";

/** Event types that are observations of the page. Prefix match. */
export const OBSERVATION_TYPES = ["observe", "act", "goto", "screenshot", "page"];

export function isObservation(type: string): boolean {
  return OBSERVATION_TYPES.some((p) => type === p || type.startsWith(`${p}.`));
}

export class BlindLogError extends Error {}

export class GuardedLog extends RunLog {
  private blindNow = false;

  get blind(): boolean {
    return this.blindNow;
  }

  override event(type: string, data: Record<string, unknown> = {}): void {
    if (type === BLIND_START) this.blindNow = true;
    if (this.blindNow && isObservation(type)) {
      throw new BlindLogError(`refusing to log "${type}" inside the blind interval`);
    }
    const { data: safe, redacted } = redactCardNumbers(data);
    super.event(type, redacted ? { ...safe, redacted: true } : safe);
    if (type === BLIND_END) this.blindNow = false;
  }

  override screenshot(png: Buffer, label = ""): string {
    if (this.blindNow) throw new BlindLogError("refusing to save a screenshot inside the blind interval");
    return super.screenshot(png, label);
  }
}
