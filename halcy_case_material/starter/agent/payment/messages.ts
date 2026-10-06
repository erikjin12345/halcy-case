// Everything the traveller is told during and after the payment step. Fixed
// templates in code, so "booked" can never be invented by a model
// (DESIGN.md section 2). Only `confirmed` and `declined` say anything about
// money, and they quote the hotel.

import type { Button, Card } from "../../types.ts";
import type { PaymentResult, Terms } from "./types.ts";

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

export function handoffCard(hotel: string, terms: Terms, holdSecondsLeft: number | undefined, unknownHoldWait?: number): Card & { buttons: Button[] } {
  const now = shown(terms.chargedNow);
  const later = shown(terms.dueAtHotel);
  const lines = [
    `${hotel}'s payment page is open in the browser window. You pay ${hotel} directly; Halcy never sees your card or your bank code.`,
    terms.room ? `Room: ${terms.room}` : undefined,
    shown(terms.total) ? `Total: ${shown(terms.total)}` : undefined,
    now !== undefined ? `Charged now: ${now}` : undefined,
    later !== undefined ? `Paid at the hotel: ${later}` : undefined,
    terms.cancellable === undefined ? undefined : terms.cancellable ? "Can be cancelled, on the hotel's conditions." : "Cannot be cancelled or refunded.",
    "In that window: enter your card, read and accept the hotel's booking conditions, and confirm with your bank.",
    now !== undefined ? `Your bank should ask you to approve ${now} to ${hotel}, or to save your card as a guarantee. If it shows anything else, stop.` : `Your bank should name ${hotel}. If it shows anything else, stop.`,
    holdSecondsLeft !== undefined ? `The hotel holds the room for about ${minutes(holdSecondsLeft)} more.` : undefined,
    unknownHoldWait !== undefined ? `${hotel} is holding the room, but its page does not say for how long. I'll wait about ${minutes(unknownHoldWait)}; please don't leave it longer.` : undefined,
    "Come back here when you are done.",
  ].filter((l): l is string => Boolean(l));
  return { title: `Over to you: pay at ${hotel}`, lines, buttons: HANDOFF_BUTTONS };
}

export const reminderHalfway = (secondsLeft: number) => `Still with me? The hotel holds the room for about ${minutes(secondsLeft)} more.`;

export const reminderLast = (secondsLeft: number) =>
  `About ${minutes(secondsLeft)} left on the hotel's hold. If you have not entered your bank code yet, stop now; I'd rather start over than have you pay for a room the hotel has released.`;

const CANNOT_SEE = (hotel: string) =>
  `I can't see your card or your bank, so I can't tell whether anything was approved. If you confirmed a payment or entered a bank code, check with ${hotel} before trying again.`;

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

export const freshHoldNote = (hotel: string) => `I'll ask ${hotel} to hold the same room again and check the price once more. This takes a minute.`;

export const notConfirmedAgain = (hotel: string) => `I could not confirm the same room at ${hotel} again. Nothing is booked and you have not been asked to pay. Tell me if you'd like me to look at the other options.`;

/** Shown when a fresh hold came back with different figures. Nothing continues without a press. */
export function changedTermsCard(hotel: string, changes: { label: string; agreed: string; now: string }[]): Card & { buttons: Button[] } {
  return {
    title: `${hotel}'s price has changed`,
    lines: [...changes.map((c) => `${c.label}: was ${c.agreed}, is now ${c.now}`), `These are ${hotel}'s figures for the same room and dates. Nothing is booked yet.`],
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
      r.holdSecondsLeft !== undefined ? `${hotel} still holds the room for about ${minutes(r.holdSecondsLeft)}.` : `${hotel} may still be holding the room.`,
      "I'll reload the payment page and hand it back to you.",
    ],
    buttons: [
      { id: "retry", label: "Try again" },
      { id: "stop", label: "Stop here" },
    ],
  };
}
