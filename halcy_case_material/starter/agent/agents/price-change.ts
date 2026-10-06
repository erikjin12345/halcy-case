// Two questions about money are asked by code, not by a model: the hotel's
// price differs from the one the room was found at, and the total on the
// hotel's page is over the traveller's own limit. The card carries the
// figures exactly as recorded, the answer is logged with them, and only an
// accepted answer changes what approval compares against.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunnableTool } from "../llm/client.ts";
import { askOrType } from "../tools/chat.ts";
import type { Button, Card } from "../../types.ts";
import type { AgentContext } from "../types.ts";
import { overLimit, priceChangeOffer, type OverLimit, type PriceChangeOffer } from "./approval.ts";

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
      // It is a question in the chat like any other: log it as one, so the record of what the traveller saw is complete.
      a.log.event("chat.ask", { title: card.title, lines: card.lines, buttons: card.buttons });
      const answer = await askOrType(a.chat, card, timeoutMs);
      if (answer.kind === "typed") {
        a.log.event("price.typed", { candidateId, text: answer.text });
        return `typed: ${answer.text}. The traveller wrote instead of pressing; nothing is accepted. Answer them, then call ask_price_change again if they want to go on.`;
      }
      const pressed = answer.kind === "pressed" ? answer.button : "timeout";
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

export const ACCEPT_OVER = "accept_over_limit";
export const DECLINE_OVER = "decline_over_limit";

export function overLimitCard(hotel: string, o: OverLimit): Card & { buttons: Button[] } {
  const m = (v: number | undefined) => (v === undefined ? undefined : money(v, o.currency));
  const extras = o.room !== undefined && o.total - o.room > 0.005 ? `Room ${m(o.room)}, plus ${m(o.total - o.room)} in taxes, fees and extras that ${hotel} adds` : undefined;
  const lines = [
    `Your limit: ${m(o.limit)}`,
    `Total on ${hotel}'s own payment page: ${m(o.total)}`,
    `Over your limit by: ${m(o.over)}`,
    extras,
    o.chargedNow !== undefined ? `Charged now: ${m(o.chargedNow)}` : undefined,
    o.atHotel !== undefined ? `Paid at the hotel: ${m(o.atHotel)}` : undefined,
    "Nothing is booked yet.",
  ].filter((l): l is string => Boolean(l));
  return {
    title: `Over your limit at ${hotel}`,
    lines,
    buttons: [
      { id: ACCEPT_OVER, label: `Yes, continue at ${m(o.total)}` },
      { id: DECLINE_OVER, label: "No, keep to my limit" },
    ],
  };
}

export function overLimitTool(a: AgentContext): RunnableTool {
  const timeoutMs = Number(process.env.REPLY_TIMEOUT_MS ?? 10 * 60 * 1000);
  return betaZodTool({
    name: "ask_over_limit",
    description:
      "Use when run_validation accepted a candidate but reported that its total is over the traveller's limit, and no cheaper candidate fits. Shows the traveller the limit, the total and the amount over, and waits. Returns accepted, declined or timeout. Do not ask about this with ask_traveller.",
    inputSchema: z.object({ candidateId: z.string() }),
    run: async ({ candidateId }) => {
      const over = overLimit(a.state, candidateId);
      if (!over) return `Refused: the validated total of ${candidateId} is not over a limit in the same currency, or the traveller has already accepted it.`;
      const hotel = a.state.goal?.hotel.name ?? "the hotel";
      const card = overLimitCard(hotel, over);
      a.log.event("limit.ask", { candidateId, ...over, title: card.title, lines: card.lines });
      a.log.event("chat.ask", { title: card.title, lines: card.lines, buttons: card.buttons });
      const answer = await askOrType(a.chat, card, timeoutMs);
      if (answer.kind === "typed") {
        a.log.event("limit.typed", { candidateId, text: answer.text });
        return `typed: ${answer.text}. The traveller wrote instead of pressing; nothing is accepted. Answer them, then call ask_over_limit again if they want to go on.`;
      }
      const pressed = answer.kind === "pressed" ? answer.button : "timeout";
      if (pressed !== ACCEPT_OVER) {
        a.log.event(pressed === "timeout" ? "limit.timeout" : "limit.declined", { candidateId, total: over.total, limit: over.limit });
        return pressed === "timeout" ? "timeout" : "declined: the traveller keeps to the limit. Validate a candidate whose total fits, or say plainly that nothing does. Nothing is booked.";
      }
      a.state.overLimitAcceptances.push({ candidateId, total: over.total, limit: over.limit, currency: over.currency, at: new Date().toISOString() });
      a.log.event("limit.accepted", { candidateId, total: over.total, limit: over.limit, over: over.over, currency: over.currency });
      return `accepted: the traveller agreed to a total of ${over.total}, ${over.over} over their limit of ${over.limit}. Call mark_approved for ${candidateId} now, without another question. If the total changes, you will be refused and must ask again.`;
    },
  });
}
