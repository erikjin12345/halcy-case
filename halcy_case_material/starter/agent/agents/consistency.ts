// What the live page showed against what the candidate is, checked by code.
// The validation agent decides `accepted`; these checks can only take an
// acceptance away. They catch the case where the page ended up on a different
// rate than the one being validated: a pay-at-the-hotel rate never charges
// now, and a refundable rate is never shown as non-refundable. They also catch
// a payment page that charges in another currency than the room list showed.

import { sameCurrency } from "../scoring/currency.ts";
import type { FeatureValue } from "../types.ts";

type Facts = Record<string, FeatureValue | unknown>;

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

/** Reasons the observed page cannot be this candidate. Empty when nothing contradicts it. */
export function contradictions(candidate: Facts, observed: Facts): string[] {
  const out: string[] = [];

  const wantCancel = bool(candidate.cancellable);
  const sawCancel = bool(observed.cancellable);
  if (wantCancel !== undefined && sawCancel !== undefined && wantCancel !== sawCancel) {
    out.push(wantCancel ? "the candidate can be cancelled, but the page shows a rate that cannot" : "the candidate cannot be cancelled, but the page shows a rate that can");
  }

  const wantNow = num(candidate.price_now);
  const sawNow = num(observed.price_now);
  if (wantNow !== undefined && sawNow !== undefined && (wantNow === 0) !== (sawNow === 0)) {
    out.push(
      wantNow === 0
        ? `the candidate charges nothing now, but the page charges ${sawNow} now`
        : `the candidate charges ${wantNow} now, but the page charges nothing now`,
    );
  }

  const wantCurrency = typeof candidate.currency === "string" ? candidate.currency : undefined;
  const sawCurrency = typeof observed.currency === "string" ? observed.currency : undefined;
  if (wantCurrency && sawCurrency && !sameCurrency(wantCurrency, sawCurrency)) {
    out.push(`the candidate was priced in ${wantCurrency}, but the page charges in ${sawCurrency}`);
  }

  return out;
}
