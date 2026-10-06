// The payment boundary, as code. Every browser tool asks this object before
// reading or touching anything. Frames outside the allowed origins are never
// read; in blind mode nothing is read or touched at all.

import type { RunLog } from "../../log.ts";

export class PaymentBoundary {
  private readonly origins = new Set<string>();
  private blindSince: number | null = null;

  constructor(
    hotelUrl: string,
    private readonly log: RunLog,
  ) {
    this.allow(hotelUrl);
  }

  /** Adds an origin the agent may read, e.g. the hotel's own site. */
  allow(url: string): void {
    try {
      this.origins.add(new URL(url).origin);
    } catch {
      // ignore malformed input; nothing gets allowed by accident
    }
  }

  /** True if this URL is on an allowed origin, blind or not. Says where we are, grants nothing. */
  known(url: string): boolean {
    try {
      return this.origins.has(new URL(url).origin);
    } catch {
      return false;
    }
  }

  /** True if a frame at this URL may be read and acted on. */
  allows(url: string): boolean {
    return !this.blind && this.known(url);
  }

  get blind(): boolean {
    return this.blindSince !== null;
  }

  /** From here until endBlind(), no observe, act or screenshot is served. */
  beginBlind(reason: string): void {
    if (this.blind) return;
    this.blindSince = Date.now();
    this.log.event("handoff.blind.start", { reason });
  }

  endBlind(outcome: string): void {
    if (!this.blind) return;
    const ms = Date.now() - (this.blindSince ?? Date.now());
    this.blindSince = null;
    this.log.event("handoff.blind.end", { outcome, ms });
  }

  /** Human-readable note for the model about a frame it may not read. */
  describeHidden(url: string): string {
    let origin = "unknown origin";
    try {
      origin = new URL(url).origin;
    } catch {
      // keep the placeholder
    }
    return `[frame on ${origin}: not read, outside the hotel's site]`;
  }
}
