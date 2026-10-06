// After blind mode: one redacted read of the hotel's page, turned into a
// PaymentResult. A model may propose a status; `decide` is code and has the
// last word (DESIGN.md section 2). Page evidence beats chat buttons (P9).

import type { RunLog } from "../../log.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import type { PageDriver } from "../tools/driver.ts";
import { appearsOnPage, holdSecondsFrom, pageText } from "./page-facts.ts";
import { HOTEL_MESSAGE_MAX, type Amounts, type PaymentResult, type Signal } from "./types.ts";

/** What a reader of the page text suggests. Every field is checked against the page before use. */
export interface Proposal {
  status: "confirmed" | "declined" | "hold_expired" | "unconfirmed";
  reference?: string;
  hotelMessage?: string;
  total?: string;
  chargedNow?: string;
  dueAtHotel?: string;
}

export type Classify = (text: string) => Promise<Proposal>;

export interface DecideInput {
  proposal: Proposal;
  text: string;
  signal: Signal;
  onPaymentPage: boolean;
}

/** Only what the page literally shows survives. */
function quoted(text: string, value: string | undefined): string | undefined {
  return value && appearsOnPage(text, value) ? value.trim() : undefined;
}

export function decide({ proposal, text, signal, onPaymentPage }: DecideInput): PaymentResult {
  const hotelMessage = quoted(text, proposal.hotelMessage)?.slice(0, HOTEL_MESSAGE_MAX);
  const holdSecondsLeft = holdSecondsFrom(text);
  const reference = quoted(text, proposal.reference);

  if (proposal.status === "confirmed" && reference && !onPaymentPage) {
    const amounts: Amounts = { total: quoted(text, proposal.total), chargedNow: quoted(text, proposal.chargedNow), dueAtHotel: quoted(text, proposal.dueAtHotel) };
    return { status: "confirmed", reference, amounts, retryable: false };
  }
  if (signal.kind === "button" && signal.id === "cancel") return { status: "cancelled", hotelMessage, retryable: false, holdSecondsLeft };
  if (proposal.status === "hold_expired") return { status: "hold_expired", hotelMessage, retryable: false };
  if (proposal.status === "declined") return { status: "declined", hotelMessage, retryable: true, holdSecondsLeft };
  if (signal.kind === "deadline") return { status: "timed_out", hotelMessage, retryable: false, holdSecondsLeft };
  return { status: "unconfirmed", hotelMessage, retryable: false, holdSecondsLeft };
}

const REFERENCE_LABEL = /reference|confirmation (number|code|no\b)|booking (number|code|id|no\b)/i;
const REFERENCE_TOKEN = /\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/;
const CONFIRMED_WORDS = /\bbooked\b|\bconfirmed\b|confirmation/i;

/**
 * What code alone can say when the model is unavailable: a reference-shaped
 * token on a line that labels it, or on the next line with text, on a page
 * that talks about a confirmation. `decide` still applies every other rule.
 */
export function fallbackProposal(text: string): Proposal {
  if (!CONFIRMED_WORDS.test(text)) return { status: "unconfirmed" };
  const lines = text.split("\n").filter((line) => line.trim());
  for (const [i, line] of lines.entries()) {
    if (!REFERENCE_LABEL.test(line)) continue;
    const reference = (line.replace(REFERENCE_LABEL, "").match(REFERENCE_TOKEN) ?? lines[i + 1]?.match(REFERENCE_TOKEN))?.[0];
    if (reference) return { status: "confirmed", reference };
  }
  return { status: "unconfirmed" };
}

export interface OutcomeDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
  log: RunLog;
  paymentPath: string;
  signal: Signal;
  classify: Classify;
  /** Let the page finish what the traveller's last click started. */
  settleMs?: number;
}

/** Call only after blind mode has ended. */
export async function readOutcome(deps: OutcomeDeps): Promise<PaymentResult> {
  const { driver, boundary, log, paymentPath, signal, classify } = deps;
  if (signal.kind === "closed") return { status: "session_lost", retryable: false, reason: "the booking window was closed" };

  await new Promise((r) => setTimeout(r, deps.settleMs ?? 2000));
  const at = driver.location();
  if (!boundary.known(at.origin)) {
    return { status: "session_lost", retryable: false, reason: `the window is on another site (${at.origin})` };
  }

  // Redacted by the guarded driver; frames outside the hotel's site are not entered.
  const text = pageText(await driver.observe());
  let proposal: Proposal;
  try {
    proposal = await classify(text);
  } catch (e) {
    log.event("payment.classify.error", { error: String(e).slice(0, 300) });
    proposal = fallbackProposal(text);
  }
  const result = decide({ proposal, text, signal, onPaymentPage: at.path === paymentPath });
  log.event("payment.outcome", { where: at, proposed: proposal.status, ...result });
  return result;
}
