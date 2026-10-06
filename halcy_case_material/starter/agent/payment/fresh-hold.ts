// What happens when the hand-off refuses to start because the hotel's hold
// ran down or the page no longer shows what the traveller agreed to. Instead
// of ending the run, ask for the same room once more, compare, and either go
// on or put the difference in front of the traveller. Never continues
// silently on a changed amount, and tries this at most once.

import { runHandoff, type HandoffDeps } from "./handoff.ts";
import { changedTermsCard, freshHoldNote, notConfirmedAgain } from "./messages.ts";
import { parseMoney } from "./page-facts.ts";
import type { PaymentResult, Terms } from "./types.ts";

/** Validates the approved candidate again on the live site. Undefined if it was not accepted. */
export type Revalidate = () => Promise<Terms | undefined>;

const CURABLE: PaymentResult["cause"][] = ["hold_short", "hold_expired", "amounts_changed"];
const FIGURES: [string, "total" | "chargedNow" | "dueAtHotel"][] = [
  ["Total", "total"],
  ["Charged now", "chargedNow"],
  ["Paid at the hotel", "dueAtHotel"],
];

/**
 * What the validation agent must know when it is asked a second time. The
 * first validation wrote the payment page's totals into the candidate, so an
 * earlier page that shows a lower room-only price is not a change.
 */
export function revalidationNote(agreed: Terms): string {
  const figures = [
    agreed.total !== undefined ? `total ${agreed.total}` : "",
    agreed.chargedNow !== undefined ? `charged now ${agreed.chargedNow}` : "",
    agreed.dueAtHotel !== undefined ? `paid at the hotel ${agreed.dueAtHotel}` : "",
  ].filter(Boolean);
  return `Second validation of a candidate the traveller already approved, to get a fresh hold. On the page that splits the amount into charged now and paid at the hotel, the traveller agreed to: ${figures.join(", ")}. The candidate's price figures are those payment-page amounts. A page before it may show a lower price without taxes or fees that are added later; that is not a mismatch. Go on to the payment page and report the amounts it shows.`;
}

const asNumber = (v: string | number | undefined) => (typeof v === "string" ? parseMoney(v) : v);

/** Figures that differ between what was agreed and what the hotel shows now. */
export function termChanges(agreed: Terms, fresh: Terms): { label: string; agreed: string; now: string }[] {
  return FIGURES.flatMap(([label, key]) => {
    const a = asNumber(agreed[key]);
    const b = asNumber(fresh[key]);
    if (a === undefined || b === undefined || Math.abs(a - b) < 0.005) return [];
    return [{ label, agreed: String(agreed[key]), now: String(fresh[key]) }];
  });
}

export async function runPayment(deps: HandoffDeps, revalidate: Revalidate, askTimeoutMs = 5 * 60 * 1000): Promise<PaymentResult> {
  const { chat, log, hotel } = deps;
  const first = await runHandoff(deps);
  if (first.status !== "not_started" || !CURABLE.includes(first.cause)) return first;

  chat.say(freshHoldNote(hotel));
  log.event("payment.fresh_hold.start", { cause: first.cause });
  const stop = (cause: PaymentResult["cause"], text: string): PaymentResult => {
    chat.say(text);
    const result: PaymentResult = { status: "not_started", retryable: false, cause, reason: text };
    log.event("payment.result", { ...result, said: text });
    return result;
  };

  let fresh: Terms | undefined;
  try {
    fresh = await revalidate();
  } catch (e) {
    log.event("payment.fresh_hold.error", { error: String(e).slice(0, 300) });
  }
  if (!fresh) return stop("not_confirmed_again", notConfirmedAgain(hotel));

  const changes = termChanges(deps.terms, fresh);
  if (fresh.cancellable !== undefined && deps.terms.cancellable !== undefined && fresh.cancellable !== deps.terms.cancellable) {
    changes.push({ label: "Cancellation", agreed: deps.terms.cancellable ? "can be cancelled" : "cannot be cancelled", now: fresh.cancellable ? "can be cancelled" : "cannot be cancelled" });
  }
  log.event("payment.fresh_hold.done", { changes });
  if (changes.length > 0) {
    let timer: NodeJS.Timeout | undefined;
    const quiet = new Promise<string>((r) => (timer = setTimeout(() => r("timeout"), askTimeoutMs)));
    const choice = await Promise.race([chat.choose(changedTermsCard(hotel, changes)), quiet]);
    clearTimeout(timer);
    log.event("payment.fresh_hold.choice", { choice });
    if (choice !== "continue") return stop("change_declined", `Stopped. Nothing is booked and you have not been asked to pay.`);
  }
  return runHandoff({ ...deps, terms: fresh });
}
