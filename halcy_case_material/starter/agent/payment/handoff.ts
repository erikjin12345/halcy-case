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
import { figureLabelled, holdExpiredLine, missingAmounts, pageText, readHold, shownAs } from "./page-facts.ts";
import { waitForSignal } from "./signals.ts";
import type { FeatureName, FeatureValue } from "../types.ts";
import type { ChangedAmount, HoldReport, PaymentResult, Signal, Terms } from "./types.ts";

export interface Timing {
  /** Do not hand over with less than this left on the hotel's hold. */
  minHoldSeconds: number;
  /** Stop waiting this long before the hold runs out. */
  marginSeconds: number;
  /** How long to wait when the page shows no hold clock. */
  defaultWaitSeconds: number;
  /** How long to wait when the page says the room is held but nobody could tell for how long. */
  unknownHoldWaitSeconds: number;
  settleMs: number;
  lastReminderMs: number;
  /** How long the traveller has to answer "try another card?". */
  retryWaitMs: number;
  maxAttempts: number;
}

export const TIMING: Timing = { minHoldSeconds: 300, marginSeconds: 60, defaultWaitSeconds: 600, unknownHoldWaitSeconds: 300, settleMs: 2000, lastReminderMs: 180_000, retryWaitMs: 120_000, maxAttempts: 3 };

export interface HandoffDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
  chat: Chat;
  log: RunLog;
  /** The seller. Used in every message. */
  hotel: string;
  /** What validation saw on the page the traveller agreed to continue with. */
  terms: Terms;
  /** What validation read about the hold, used when code cannot read a clock off the page. */
  holdReport?: HoldReport;
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

const notStarted = (reason: string, cause: PaymentResult["cause"] = "error"): PaymentResult => ({ status: "not_started", retryable: true, reason, cause });

const minutesLeft = (seconds: number) => (seconds < 60 ? "less than a minute is" : seconds < 120 ? "1 minute is" : `${Math.floor(seconds / 60)} minutes are`);

/** Lines that start with these words carry the figure for that part of the price. */
const LABELS: [ChangedAmount["label"], keyof Terms, RegExp][] = [
  ["Total", "total", /^total\b/i],
  ["Charged now", "chargedNow", /^(charged|pay|payable|due|to pay) (now|today)\b/i],
  ["Paid at the hotel", "dueAtHotel", /^(paid|pay|payable|due) (at|on) (the )?(hotel|property|arrival)\b/i],
];

/** Which agreed figures the page no longer shows, and what a labelled line shows instead. */
export function changedAmounts(text: string, terms: Terms): ChangedAmount[] {
  return LABELS.flatMap(([label, key, pattern]) => {
    const agreed = terms[key] as string | number | undefined;
    if (missingAmounts(text, [agreed]).length === 0) return [];
    return [{ label, agreed: String(agreed), now: figureLabelled(text, pattern) }];
  });
}

const describeChange = (c: ChangedAmount) => `${c.label}: you agreed to ${c.agreed}, ${c.now ? `the page now shows ${c.now}` : "the page no longer shows it"}`;

/**
 * Never throws. A failure before the traveller was handed the page is
 * `not_started`; a failure after is `unconfirmed`, because from then on
 * nobody here can say that nothing was paid.
 */
export async function runHandoff(deps: HandoffDeps): Promise<PaymentResult> {
  const { chat, log, hotel } = deps;
  const progress = { handedOver: false };
  try {
    return await sequence(deps, progress);
  } catch (e) {
    log.event("payment.error", { handedOver: progress.handedOver, error: String(e).slice(0, 300) });
    const result: PaymentResult = progress.handedOver
      ? { status: "unconfirmed", retryable: false, reason: "something failed on Halcy's side during the hand-off" }
      : notStarted("something failed on my side before I could hand it over", "error");
    const text = resultMessage(hotel, result);
    chat.say(text);
    log.event("payment.result", { ...result, said: text });
    return result;
  }
}

async function sequence(deps: HandoffDeps, progress: { handedOver: boolean }): Promise<PaymentResult> {
  const { driver, boundary, chat, log, hotel, terms } = deps;
  const timing = { ...TIMING, ...deps.timing };
  const say = (result: PaymentResult) => {
    const text = resultMessage(hotel, result);
    chat.say(text);
    log.event("payment.result", { ...result, said: text });
    return result;
  };

  if (!deps.visible) return say(notStarted("the browser is running without a window you can type in", "no_window"));
  const at = driver.location();
  if (!boundary.known(at.origin)) return say(notStarted(`the browser is not on ${hotel}'s site`, "off_site"));

  let result: PaymentResult = notStarted("the hand-off did not run");
  for (let attempt = 1; attempt <= timing.maxAttempts; attempt++) {
    // Last look before going blind. The full address stays in memory for a reload; it is not logged.
    const seen = await driver.observe();
    const text = pageText(seen);
    // A clock on the page wins. Otherwise: what validation read, less the time since, capped by the stated length.
    const hold = readHold(text);
    const since = deps.holdReport && attempt === 1 ? (Date.now() - deps.holdReport.at) / 1000 : undefined;
    const estimates = since === undefined ? [] : [deps.holdReport!.secondsLeft - since, ...(hold.atMostSeconds === undefined ? [] : [hold.atMostSeconds - since])];
    const holdSecondsLeft = hold.secondsLeft ?? (estimates.length > 0 ? Math.max(0, Math.round(Math.min(...estimates))) : undefined);
    const holdUnknown = holdSecondsLeft === undefined && hold.mentioned;
    const released = holdExpiredLine(text);
    if (released) return say(notStarted(`${hotel} is no longer holding the room. Its page says: "${released.slice(0, 200)}"`, "hold_expired"));
    if (holdSecondsLeft !== undefined && holdSecondsLeft < timing.minHoldSeconds) {
      return say(notStarted(`${minutesLeft(holdSecondsLeft)} left on ${hotel}'s hold, too little to pay safely`, "hold_short"));
    }
    const changed = changedAmounts(text, terms);
    if (changed.length > 0) {
      return say(notStarted(`the page no longer matches what you agreed to. ${changed.map(describeChange).join("; ")}`, "amounts_changed"));
    }
    // The traveller reads the hotel's own figures, currency included, not ours.
    const shown: Terms = { ...terms, total: shownAs(text, terms.total) ?? terms.total, chargedNow: shownAs(text, terms.chargedNow) ?? terms.chargedNow, dueAtHotel: shownAs(text, terms.dueAtHotel) ?? terms.dueAtHotel };
    // A hold nobody could put a number on gets a short wait, never the long default, and the traveller is told.
    const unknownWait = Math.min(timing.unknownHoldWaitSeconds, (hold.atMostSeconds ?? Infinity) - timing.marginSeconds);
    const waitSeconds = holdSecondsLeft !== undefined ? holdSecondsLeft - timing.marginSeconds : holdUnknown ? unknownWait : timing.defaultWaitSeconds;
    log.event("handoff.start", { attempt, where: at, terms, holdSecondsLeft, holdUnknown, holdFromPage: hold.secondsLeft !== undefined, waitSeconds, foreignFrames: seen.text.filter((f) => !boundary.known(f.frameUrl)).length });

    let signal: Signal | undefined;
    const endBlind = boundary.beginBlind("traveller takes over");
    progress.handedOver = true;
    try {
      await driver.bringToFront();
      signal = await waitForSignal({
        driver,
        boundary,
        chat,
        log,
        paymentPath: at.path,
        card: handoffCard(hotel, shown, holdSecondsLeft, holdUnknown ? waitSeconds : undefined),
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
