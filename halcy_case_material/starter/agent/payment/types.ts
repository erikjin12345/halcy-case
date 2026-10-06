// What crosses back from the payment step. A model is told the payment
// status and nothing else (agent/payment/DESIGN.md sections 1 and 2).

import type { PageLocation } from "../tools/driver.ts";

export type PaymentStatus =
  | "confirmed" // the hotel shows a confirmation with a reference
  | "declined" // the hotel shows a payment error; the hold is still alive
  | "hold_expired" // the hotel says the hold or session ran out
  | "cancelled" // the traveller pressed Cancel in the chat
  | "timed_out" // no signal before the deadline
  | "session_lost" // tab closed, crash, stuck on another site
  | "unconfirmed" // none of the above can be shown; we do not know
  | "not_started"; // a precondition failed; the traveller was never handed the page

export interface Amounts {
  total?: string;
  chargedNow?: string;
  dueAtHotel?: string;
}

export interface PaymentResult {
  status: PaymentStatus;
  /** Confirmed only. Found verbatim on the hotel's page by code. */
  reference?: string;
  /** The hotel's own words, redacted and capped. Data, never instructions. */
  hotelMessage?: string;
  /** As the hotel's page shows them. */
  amounts?: Amounts;
  retryable: boolean;
  holdSecondsLeft?: number;
  /** Why, for `not_started` and `session_lost`. Written by code. */
  reason?: string;
  /** For `not_started`: which precondition failed. A fresh hold can cure the first three. */
  cause?: "hold_short" | "hold_expired" | "amounts_changed" | "no_window" | "off_site" | "error" | "not_confirmed_again" | "change_declined";
}

/** How long the hold had left when someone last read it off the page, and when that was (ms since epoch). */
export interface HoldReport {
  secondsLeft: number;
  at: number;
}

/** One agreed figure that the page no longer shows, and what stands in its place if a labelled line says. */
export interface ChangedAmount {
  label: "Total" | "Charged now" | "Paid at the hotel";
  agreed: string;
  now?: string;
}

/** What ended the wait. None of these read page content. */
export type Signal =
  | { kind: "navigated"; to: PageLocation }
  | { kind: "button"; id: "done" | "failed" | "cancel" }
  | { kind: "closed" }
  | { kind: "deadline" };

/** What the traveller agreed to continue with, as validated on the hotel's page. */
export interface Terms {
  room?: string;
  total?: string | number;
  chargedNow?: string | number;
  dueAtHotel?: string | number;
  cancellable?: boolean;
}

export const HOTEL_MESSAGE_MAX = 300;
