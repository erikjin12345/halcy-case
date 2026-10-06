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

/** Called with every event after it is scrubbed and written; `blind` is true for the whole blind interval, both ends included. */
export type LogListener = (type: string, data: Record<string, unknown>, blind: boolean) => void;

export class GuardedLog extends RunLog {
  private blindNow = false;
  private readonly listeners: LogListener[] = [];

  /** The run's events as they are written, already scrubbed. The only way anything else may see them live. */
  subscribe(listener: LogListener): void {
    this.listeners.push(listener);
  }

  get blind(): boolean {
    return this.blindNow;
  }

  override event(type: string, data: Record<string, unknown> = {}): void {
    if (type === BLIND_START) this.blindNow = true;
    if (this.blindNow && isObservation(type)) {
      throw new BlindLogError(`refusing to log "${type}" inside the blind interval`);
    }
    const { data: safe, redacted } = redactCardNumbers(data);
    const written = redacted ? { ...safe, redacted: true } : safe;
    super.event(type, written);
    const blind = this.blindNow;
    if (type === BLIND_END) this.blindNow = false;
    for (const l of this.listeners) {
      try {
        l(type, { at: new Date().toISOString(), ...written }, blind);
      } catch {
        // A listener must never break the run or the log.
      }
    }
  }

  override screenshot(png: Buffer, label = ""): string {
    if (this.blindNow) throw new BlindLogError("refusing to save a screenshot inside the blind interval");
    return super.screenshot(png, label);
  }
}
