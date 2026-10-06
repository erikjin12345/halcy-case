// A price limit in the traveller's currency against a price in the hotel's.
// With today's ECB rates the limit is applied to the estimate; when the
// estimate is within TOO_CLOSE of the limit, the traveller is asked instead,
// because the bank's rate and fees can move it across. Without a rate the
// limit is left out and the traveller is asked, as before.

import { convert, money, rateDay, TOO_CLOSE, type Rates } from "./fx.ts";

export interface CapGap {
  cap: number;
  capCurrency: string;
  priceCurrency?: string;
  /** The price in the cap's currency, when it could be estimated. */
  estimate?: number;
}

export type CapVerdict = { kind: "ask"; gap: CapGap } | { kind: "fits"; gap: CapGap } | { kind: "over"; gap: CapGap; reason: string };

/** What to do with one cap and one price in different currencies. */
export function judgeCap(price: number | undefined, gap: CapGap, rates: Rates | null): CapVerdict {
  const estimate = price !== undefined && gap.priceCurrency && rates ? convert(price, gap.priceCurrency, gap.capCurrency, rates) : null;
  if (estimate === null || !rates) return { kind: "ask", gap };
  const withEstimate = { ...gap, estimate };
  if (Math.abs(estimate - gap.cap) / gap.cap <= TOO_CLOSE) return { kind: "ask", gap: withEstimate };
  if (estimate <= gap.cap) return { kind: "fits", gap: withEstimate };
  const reason = `about ${money(estimate, gap.capCurrency)} at the ECB rate of ${rateDay(rates)}, over the limit of ${money(gap.cap, gap.capCurrency)} (an estimate)`;
  return { kind: "over", gap: withEstimate, reason };
}

/** One sentence for the orchestrator about caps checked on an estimate, or null. */
export function estimateNote(checked: CapGap[], rates: Rates | null): string | null {
  const gap = checked[0];
  if (!gap || !rates) return null;
  return `The traveller's limit of ${money(gap.cap, gap.capCurrency)} was checked against an estimate of each price in ${gap.capCurrency} at the ECB rate of ${rateDay(rates)}, not against the hotel's own figure. Tell the traveller the check used an estimate, and that their bank's rate and fees decide the final amount.`;
}
