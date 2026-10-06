// Everything the traveller is told during and after the payment step. Fixed
// templates in code, so "booked" can never be invented by a model
// (DESIGN.md section 2). Only `confirmed` and `declined` say anything about
// money, and they quote the hotel.

import type { Button, Card } from "../../types.ts";
import { estimateNote, shortEstimate, type Rates } from "../scoring/fx.ts";
import type { PaymentResult, Terms } from "./types.ts";

/** What the hand-off card needs to add estimates: the traveller's currency and today's rates. */
export interface Estimates {
  to?: string;
  rates: Rates | null;
}

export const HANDOFF_BUTTONS: Button[] = [
  { id: "done", label: "I'm done" },
  { id: "failed", label: "It didn't work" },
  { id: "cancel", label: "Cancel" },
];

const minutes = (seconds: number) => {
  const n = Math.max(1, Math.floor(seconds / 60));
  return `${n} ${n === 1 ? "minute" : "minutes"}`;
};
const shown = (v: string | number | undefined) => (v === undefined ? undefined : String(v));

export function handoffCard(hotel: string, terms: Terms, holdSecondsLeft: number | undefined, unknownHoldWait?: number, fx?: Estimates): Card & { buttons: Button[] } {
  const est = (v: string | number | undefined) => (typeof v === "number" && terms.currency && fx ? shortEstimate(v, terms.currency, fx.to, fx.rates) : null);
  const withEst = (v: string | number | undefined) => (v === undefined ? undefined : [shown(v), est(v)].filter(Boolean).join(" "));
  const anyEstimate = [terms.total, terms.chargedNow, terms.dueAtHotel].some((v) => est(v));
  const now = shown(terms.chargedNow);
  const later = shown(terms.dueAtHotel);
  const lines = [
    `Pay ${hotel} in the browser window. Halcy never sees your card or bank code.`,
    terms.room ? `Room: ${terms.room}` : undefined,
    shown(terms.total) ? `Total: ${withEst(terms.total)}` : undefined,
    now !== undefined ? `Charged now: ${withEst(terms.chargedNow)}` : undefined,
    later !== undefined ? `Paid at the hotel: ${withEst(terms.dueAtHotel)}` : undefined,
    terms.cancellable === undefined ? undefined : terms.cancellable ? "Can be cancelled, on the hotel's conditions." : "Cannot be cancelled or refunded.",
    now !== undefined ? `Your bank should ask you to approve ${now} to ${hotel}, or to save the card. Anything else: stop.` : `Your bank should name ${hotel}. Anything else: stop.`,
    holdSecondsLeft !== undefined ? `Room held for about ${minutes(holdSecondsLeft)}.` : undefined,
    unknownHoldWait !== undefined ? `Hold time not stated; I'll wait about ${minutes(unknownHoldWait)}.` : undefined,
    anyEstimate && fx?.rates ? estimateNote(fx.rates) : undefined,
  ].filter((l): l is string => Boolean(l));
  return { title: `Over to you: pay at ${hotel}`, lines, buttons: HANDOFF_BUTTONS };
}

export const reminderHalfway = (secondsLeft: number) => `Room held for about ${minutes(secondsLeft)} more.`;

export const reminderLast = (secondsLeft: number) =>
  `About ${minutes(secondsLeft)} left on the hold. If you have not entered your bank code yet, stop now.`;

const CANNOT_SEE = (hotel: string) =>
  `If you confirmed a payment or entered a bank code, check with ${hotel} before trying again.`;

/** One message per status. `hotel` is the seller; Halcy is never named as one. */
export function resultMessage(hotel: string, r: PaymentResult): string {
  const quote = r.hotelMessage ? ` ${hotel}'s page says: "${r.hotelMessage}"` : "";
  switch (r.status) {
    case "confirmed": {
      const a = r.amounts ?? {};
      const money = [a.chargedNow ? `charged now ${a.chargedNow}` : "", a.dueAtHotel ? `paid at the hotel ${a.dueAtHotel}` : ""].filter(Boolean).join(", ");
      return `You're booked with ${hotel}. Booking reference ${r.reference}.${money ? ` ${hotel}'s confirmation shows: ${money}.` : ""} Your booking and your contract are with ${hotel}.`;
    }
    case "declined":
      return `The payment did not go through.${quote} Nothing is booked.`;
    case "hold_expired":
      return `${hotel} has released the room: the hold ran out.${quote} I can't see a booking on ${hotel}'s site. ${CANNOT_SEE(hotel)}`;
    case "cancelled":
      return `Stopped. I can't see a booking on ${hotel}'s site. ${CANNOT_SEE(hotel)}`;
    case "timed_out":
      return `I didn't hear back in time, so I've stopped. I can't see a booking on ${hotel}'s site. ${CANNOT_SEE(hotel)}`;
    case "session_lost":
      return `I lost the booking window${r.reason ? ` (${r.reason})` : ""}. I can't see a booking on ${hotel}'s site. ${CANNOT_SEE(hotel)}`;
    case "not_started":
      return `I haven't handed you ${hotel}'s payment page: ${r.reason ?? "something changed"}. Nothing is booked and you have not been asked to pay.`;
    case "unconfirmed":
      return `I can't see a confirmation on ${hotel}'s site.${quote} ${CANNOT_SEE(hotel)} Did a confirmation email from ${hotel} arrive?`;
  }
}

/** "I'm done" pressed while the hotel's payment form is still unsubmitted. */
export const notSubmitted = (hotel: string, secondsLeft: number) =>
  `${hotel}'s payment page has not been submitted yet: I can't see a confirmation or an error there, so nothing has been paid. ${hotel} holds the room for about ${minutes(secondsLeft)} more. Finish in the browser window, and press "I'm done" once ${hotel} shows your booking.`;

export const freshHoldNote = (hotel: string) => `Asking ${hotel} to hold the same room again.`;

export const notConfirmedAgain = (hotel: string) => `Could not confirm the same room at ${hotel} again. Nothing is booked and you have not been asked to pay.`;

/** Shown when a fresh hold came back with different figures. Nothing continues without a press. */
export function changedTermsCard(hotel: string, changes: { label: string; agreed: string; now: string }[]): Card & { buttons: Button[] } {
  return {
    title: `${hotel}'s price has changed`,
    lines: [...changes.map((c) => `${c.label}: was ${c.agreed}, is now ${c.now}`), `${hotel}'s figures, same room and dates. Nothing is booked yet.`],
    buttons: [
      { id: "continue", label: "Continue with the new price" },
      { id: "stop", label: "Stop here" },
    ],
  };
}

export function retryCard(hotel: string, r: PaymentResult): Card & { buttons: Button[] } {
  return {
    title: "Try another card?",
    lines: [
      r.holdSecondsLeft !== undefined ? `Room held for about ${minutes(r.holdSecondsLeft)}.` : `${hotel} may still be holding the room.`,
    ],
    buttons: [
      { id: "retry", label: "Try again" },
      { id: "stop", label: "Stop here" },
    ],
  };
}
