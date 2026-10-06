// When the hotel's price differs from the one the room was found at, the
// traveller is asked by code, not by a model: the card carries the two room
// prices exactly as recorded, the answer is logged with both, and only an
// accepted answer changes what validation and approval compare against.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunnableTool } from "../llm/client.ts";
import type { Button, Card } from "../../types.ts";
import type { AgentContext } from "../types.ts";
import { priceChangeOffer, type PriceChangeOffer } from "./approval.ts";

export const ACCEPT = "accept_new_price";
export const DECLINE = "decline_new_price";

/** An amount with its currency as the hotel writes it: a symbol in front, a code behind. */
export function money(amount: number, currency?: string): string {
  const n = amount.toFixed(2);
  if (!currency) return n;
  return /^[A-Za-z]{3,}$/.test(currency.trim()) ? `${n} ${currency.trim()}` : `${currency.trim()}${n}`;
}

export function priceChangeCard(hotel: string, o: PriceChangeOffer): Card & { buttons: Button[] } {
  const m = (v: number | undefined) => (v === undefined ? undefined : money(v, o.currency));
  const lines = [
    `Room when I found it: ${m(o.was)}`,
    `Room now, on ${hotel}'s own payment page: ${m(o.now)}`,
    o.total !== undefined ? `Total now: ${m(o.total)}` : undefined,
    o.chargedNow !== undefined ? `Charged now: ${m(o.chargedNow)}` : undefined,
    o.atHotel !== undefined ? `Paid at the hotel: ${m(o.atHotel)}` : undefined,
    `${hotel} sets this price, not Halcy. Nothing is booked yet.`,
  ].filter((l): l is string => Boolean(l));
  return {
    title: o.now > o.was ? `${hotel}'s price has gone up` : `${hotel}'s price has changed`,
    lines,
    buttons: [
      { id: ACCEPT, label: `Yes, continue at ${m(o.total ?? o.now)}` },
      { id: DECLINE, label: "No, don't book" },
    ],
  };
}

export function priceChangeTool(a: AgentContext): RunnableTool {
  const timeoutMs = Number(process.env.REPLY_TIMEOUT_MS ?? 10 * 60 * 1000);
  return betaZodTool({
    name: "ask_price_change",
    description:
      "Use when run_validation rejected a candidate because the room price on the hotel's page differs from the price it was found at. Shows the traveller the old and the new price and waits for their answer. Returns accepted, declined or timeout. Do not ask about a changed price with ask_traveller.",
    inputSchema: z.object({ candidateId: z.string() }),
    run: async ({ candidateId }) => {
      const offer = priceChangeOffer(a.state, candidateId);
      if (typeof offer === "string") {
        a.log.event("price.ask.refused", { candidateId, reason: offer });
        return `Refused: ${offer}`;
      }
      const hotel = a.state.goal?.hotel.name ?? "the hotel";
      const card = priceChangeCard(hotel, offer);
      a.log.event("price.ask", { candidateId, ...offer, title: card.title, lines: card.lines });
      // The timer is cleared once the traveller answers, so it cannot keep the process alive.
      let timer: NodeJS.Timeout | undefined;
      const quiet = new Promise<string>((r) => (timer = setTimeout(() => r("timeout"), timeoutMs)));
      const pressed = await Promise.race([a.chat.choose(card), quiet]);
      clearTimeout(timer);
      if (pressed !== ACCEPT) {
        a.log.event(pressed === "timeout" ? "price.timeout" : "price.declined", { candidateId, was: offer.was, now: offer.now });
        return pressed === "timeout" ? "timeout" : "declined: the traveller does not want the new price. Offer another candidate or stop. Nothing is booked.";
      }
      a.state.priceAcceptances.push({ candidateId, was: offer.was, now: offer.now, total: offer.total, currency: offer.currency, at: new Date().toISOString() });
      a.log.event("price.accepted", { candidateId, was: offer.was, now: offer.now, total: offer.total, currency: offer.currency });
      return `accepted: the traveller agreed to a room price of ${offer.now} (it was ${offer.was}). Now call run_validation for ${candidateId} again; do not search again. If it is accepted, call mark_approved without another question: the traveller has just agreed to these figures. If the price has changed again, it will be rejected and you ask again.`;
    },
  });
}
