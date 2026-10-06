// The payment step: a fixed sequence in code, not an agent (DESIGN.md
// section 3). No model runs between blind start and blind end. The traveller
// pays in the hotel's own page, in the visible browser window; this code
// waits without looking and afterwards reports a status.

import type { RunLog } from "../../log.ts";
import type { Chat } from "../../types.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import type { PageDriver } from "../tools/driver.ts";
import { handoffCard, resultMessage, retryCard } from "./messages.ts";
import { readOutcome, type Classify } from "./outcome.ts";
import { holdSecondsFrom, missingAmounts, pageText } from "./page-facts.ts";
import { waitForSignal } from "./signals.ts";
import type { FeatureName, FeatureValue } from "../types.ts";
import type { PaymentResult, Signal, Terms } from "./types.ts";

export interface Timing {
  /** Do not hand over with less than this left on the hotel's hold. */
  minHoldSeconds: number;
  /** Stop waiting this long before the hold runs out. */
  marginSeconds: number;
  /** How long to wait when the page shows no hold clock. */
  defaultWaitSeconds: number;
  settleMs: number;
  lastReminderMs: number;
  /** How long the traveller has to answer "try another card?". */
  retryWaitMs: number;
  maxAttempts: number;
}

export const TIMING: Timing = { minHoldSeconds: 300, marginSeconds: 60, defaultWaitSeconds: 600, settleMs: 2000, lastReminderMs: 180_000, retryWaitMs: 120_000, maxAttempts: 3 };

export interface HandoffDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
  chat: Chat;
  log: RunLog;
  /** The seller. Used in every message. */
  hotel: string;
  /** What validation saw on the page the traveller agreed to continue with. */
  terms: Terms;
  /** False when the browser has no window the traveller can type into. */
  visible: boolean;
  classify: Classify;
  timing?: Partial<Timing>;
}

/** The terms the traveller agreed to continue with, from what validation saw on the page. */
export function termsFrom(seen: Partial<Record<FeatureName, FeatureValue>>): Terms {
  const money = (v: FeatureValue | undefined) => (typeof v === "boolean" ? undefined : v);
  return {
    room: typeof seen.room_name === "string" ? seen.room_name : undefined,
    total: money(seen.price_total),
    chargedNow: money(seen.price_now),
    dueAtHotel: money(seen.price_at_hotel),
    cancellable: typeof seen.cancellable === "boolean" ? seen.cancellable : undefined,
  };
}

const notStarted = (reason: string): PaymentResult => ({ status: "not_started", retryable: true, reason });

export async function runHandoff(deps: HandoffDeps): Promise<PaymentResult> {
  const { driver, boundary, chat, log, hotel, terms } = deps;
  const timing = { ...TIMING, ...deps.timing };
  const say = (result: PaymentResult) => {
    const text = resultMessage(hotel, result);
    chat.say(text);
    log.event("payment.result", { ...result, said: text });
    return result;
  };

  if (!deps.visible) return say(notStarted("the browser is running without a window you can type in"));
  const at = driver.location();
  if (!boundary.known(at.origin)) return say(notStarted(`the browser is not on ${hotel}'s site`));

  let result: PaymentResult = notStarted("the hand-off did not run");
  for (let attempt = 1; attempt <= timing.maxAttempts; attempt++) {
    // Last look before going blind. The full address stays in memory for a reload; it is not logged.
    const seen = await driver.observe();
    const text = pageText(seen);
    const holdSecondsLeft = holdSecondsFrom(text);
    if (holdSecondsLeft !== undefined && holdSecondsLeft < timing.minHoldSeconds) {
      return say(notStarted(`only ${Math.floor(holdSecondsLeft / 60)} minutes are left on the hotel's hold, too little to pay safely; I'd rather start over`));
    }
    const missing = missingAmounts(text, [terms.total, terms.chargedNow, terms.dueAtHotel]);
    if (missing.length > 0) {
      return say(notStarted(`the page no longer shows the amounts you agreed to (${missing.join(", ")})`));
    }
    const waitSeconds = holdSecondsLeft === undefined ? timing.defaultWaitSeconds : holdSecondsLeft - timing.marginSeconds;
    log.event("handoff.start", { attempt, where: at, terms, holdSecondsLeft, waitSeconds, foreignFrames: seen.text.filter((f) => !boundary.known(f.frameUrl)).length });

    let signal: Signal | undefined;
    const endBlind = boundary.beginBlind("traveller takes over");
    try {
      await driver.bringToFront();
      signal = await waitForSignal({
        driver,
        boundary,
        chat,
        log,
        paymentPath: at.path,
        card: handoffCard(hotel, terms, holdSecondsLeft),
        deadlineMs: waitSeconds * 1000,
        lastReminderMs: timing.lastReminderMs,
      });
    } finally {
      endBlind(signal?.kind ?? "aborted");
    }

    result = await readOutcome({ driver, boundary, log, paymentPath: at.path, signal, classify: deps.classify, settleMs: timing.settleMs });
    say(result);
    if (result.status !== "declined" || attempt === timing.maxAttempts) break;
    if ((result.holdSecondsLeft ?? timing.minHoldSeconds) < timing.minHoldSeconds) break;

    let timer: NodeJS.Timeout | undefined;
    const quiet = new Promise<string>((r) => (timer = setTimeout(() => r("stop"), timing.retryWaitMs)));
    const choice = await Promise.race([chat.choose(retryCard(hotel, result)), quiet]);
    clearTimeout(timer);
    log.event("handoff.retry", { choice });
    if (choice !== "retry") break;
    // A reload gives a fresh payment form and clears whatever was typed (P2).
    await driver.goto(seen.url);
  }
  return result;
}
