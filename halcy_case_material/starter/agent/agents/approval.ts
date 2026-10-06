// The traveller can only be sent to payment for a candidate whose latest
// validation on the live page was accepted. The hand-off takes its amounts
// from that validation, so these are code rules, not prompt requests.

import { sameCurrency } from "../scoring/currency.ts";
import type { FeatureValue, PriceAcceptance, RunState, ValidationResult } from "../types.ts";

const CENT = 0.005;
const num = (v: FeatureValue | unknown): number | undefined => (typeof v === "number" ? v : undefined);
const differs = (a: number, b: number) => Math.abs(a - b) > CENT;

export function latestValidation(state: RunState, candidateId: string): ValidationResult | undefined {
  return [...state.validations].reverse().find((v) => v.candidateId === candidateId);
}

export function latestAcceptance(state: RunState, candidateId: string): PriceAcceptance | undefined {
  return [...state.priceAcceptances].reverse().find((p) => p.candidateId === candidateId);
}

/** Null when approval may be recorded, otherwise the reason it may not. */
export function approvalBlocker(state: RunState, candidateId: string): string | null {
  const v = latestValidation(state, candidateId);
  if (!v) return `${candidateId} has not been validated on the live site. Call run_validation first.`;
  if (!v.accepted) return `the latest validation of ${candidateId} was rejected: ${v.reasons.slice(-1)[0] ?? "no reason given"}. Validate again or choose another candidate.`;
  // One browser: it sits on the page of whichever candidate was validated last.
  const last = state.validations[state.validations.length - 1];
  if (last.candidateId !== candidateId) {
    return `the browser is on ${last.candidateId}, which was validated after ${candidateId}. Call run_validation for ${candidateId} again before sending the traveller to pay.`;
  }
  // A price the traveller accepted is the price the page must still show.
  const agreed = latestAcceptance(state, candidateId);
  if (agreed) {
    const room = num(v.observed.price_room);
    if (room === undefined) return `the traveller accepted a room price of ${agreed.now}, but the latest validation did not report the room price on the page. Call run_validation again.`;
    if (differs(room, agreed.now)) return `the traveller accepted a room price of ${agreed.now}, but the page now shows ${room}. Ask again with ask_price_change.`;
    const total = num(v.observed.price_total);
    if (agreed.total !== undefined && total !== undefined && differs(total, agreed.total)) {
      return `the traveller accepted a total of ${agreed.total}, but the page now shows ${total}. Show the new figures and ask again.`;
    }
  }
  // The traveller's limit is for everything they will pay, not for the room line.
  const over = overLimit(state, candidateId);
  if (over) {
    return `the total on the hotel's page is ${over.total}, which is ${over.over} over the traveller's limit of ${over.limit}. Validate a candidate that fits, or ask with ask_over_limit; do not approve this one unasked.`;
  }
  return null;
}

export interface OverLimit {
  total: number;
  limit: number;
  over: number;
  room?: number;
  chargedNow?: number;
  atHotel?: number;
  currency?: string;
}

/**
 * The validated all-in total against the traveller's limit, when both are
 * known to be in the same currency and the traveller has not already accepted
 * exactly this total. Null when there is nothing to hold the candidate back
 * on: no limit, within it, another currency (surfaced elsewhere, never
 * compared), or accepted.
 */
export function overLimit(state: RunState, candidateId: string): OverLimit | null {
  const o = state.objective;
  const limit = num(o?.hard.price_total) ?? state.goal?.budget?.maxTotal;
  const v = latestValidation(state, candidateId);
  const total = num(v?.observed.price_total);
  if (limit === undefined || !v || total === undefined) return null;
  const limitCurrency = o?.currency ?? state.goal?.budget?.currency;
  const candidate = state.store.candidate(candidateId);
  const currency = [v.observed.currency, candidate?.features.currency?.value].find((c): c is string => typeof c === "string");
  if (limitCurrency && currency && !sameCurrency(limitCurrency, currency)) return null;
  if (total <= limit + CENT) return null;
  const agreed = [...state.overLimitAcceptances].reverse().find((a) => a.candidateId === candidateId);
  if (agreed && !differs(agreed.total, total)) return null;
  const round = (n: number) => Math.round(n * 100) / 100;
  return { total, limit, over: round(total - limit), room: num(v.observed.price_room), chargedNow: num(v.observed.price_now), atHotel: num(v.observed.price_at_hotel), currency };
}

export interface PriceChangeOffer {
  was: number;
  now: number;
  total?: number;
  chargedNow?: number;
  atHotel?: number;
  currency?: string;
}

/**
 * What the traveller can be asked to accept: the room price the candidate was
 * found at, against the room price the latest validation saw on the page. A
 * string is the reason nothing can be offered.
 */
export function priceChangeOffer(state: RunState, candidateId: string): PriceChangeOffer | string {
  const candidate = state.store.candidate(candidateId);
  const v = latestValidation(state, candidateId);
  if (!candidate || !v) return `${candidateId} has not been validated. Call run_validation first.`;
  const last = state.validations[state.validations.length - 1];
  if (last.candidateId !== candidateId) return `the browser is on ${last.candidateId}. Call run_validation for ${candidateId} again first.`;
  const was = latestAcceptance(state, candidateId)?.now ?? num(candidate.features.price_total?.value);
  const now = num(v.observed.price_room);
  if (was === undefined) return `no price was recorded for ${candidateId} when it was found.`;
  if (now === undefined) return `the latest validation of ${candidateId} did not report observed.price_room. Call run_validation again.`;
  if (!differs(was, now)) return `the room price of ${candidateId} has not changed (${now}).`;
  const currency = [v.observed.currency, candidate.features.currency?.value].find((c): c is string => typeof c === "string");
  return { was, now, total: num(v.observed.price_total), chargedNow: num(v.observed.price_now), atHotel: num(v.observed.price_at_hotel), currency };
}
