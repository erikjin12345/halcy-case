// The orchestrator's two money tools. Every estimate and every comparison
// across currencies is made here, in code, from ECB rates; the model quotes
// the returned text and never converts, rounds or compares on its own.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunnableTool } from "../llm/client.ts";
import { compareText, estimateNote, explainText, loadRates, shortEstimate } from "../scoring/fx.ts";
import type { AgentContext } from "../types.ts";

/** The traveller's own currency: their profile, else the currency of a budget they gave, else none. */
export function travellerCurrency(a: Pick<AgentContext, "ctx" | "state">): string | undefined {
  return a.ctx.traveller.currency ?? a.state.goal?.budget?.currency;
}

/** The hotel's own figure as the traveller reads it: "€706.24", "GBP 594.00". */
const hotelFigure = (n: number, currency: string) => (currency.trim().length === 1 ? `${currency.trim()}${n.toFixed(2)}` : `${currency.trim()} ${n.toFixed(2)}`);

const amount = z.object({
  label: z.string().describe("What the amount is, e.g. 'Total', 'Charged now', 'Paid at the hotel', or a hotel and room name"),
  amount: z.number().describe("The hotel's own figure, a plain number"),
  currency: z.string().describe("The hotel's currency exactly as the page writes it"),
  atHotel: z.boolean().optional().describe("True for an amount paid later at the hotel"),
});

export function fxTools(a: AgentContext): RunnableTool[] {
  const estimate = betaZodTool({
    name: "estimate_prices",
    description:
      "Estimate hotel amounts in the traveller's own currency at today's ECB rate. Returns one line per amount, the hotel's figure then the estimate in brackets ('Total: €706.24 (≈ 7,947 kr)'), and, when any ≈ figure is shown, one last note line. Put the amount lines on the card as returned and the note once, at the end. Never convert or round yourself.",
    inputSchema: z.object({ amounts: z.array(amount).min(1).max(8) }),
    run: async ({ amounts }) => {
      const to = travellerCurrency(a);
      const rates = await loadRates();
      const lines = amounts.map((x) => {
        const est = shortEstimate(x.amount, x.currency, to, rates);
        return `${x.label}: ${hotelFigure(x.amount, x.currency)}${est ? ` ${est}` : ""}`;
      });
      if (rates && lines.some((l) => l.includes("(≈"))) lines.push(estimateNote(rates));
      a.log.event("fx.estimate", { to: to ?? null, rateDate: rates?.date ?? null, source: rates?.source ?? null, lines });
      return lines.join("\n");
    },
  });

  const explain = betaZodTool({
    name: "explain_estimate",
    description: "Only when the traveller asks how an ≈ figure was worked out or what ≈ means: returns the explanation to quote exactly.",
    inputSchema: z.object({}),
    run: async () => explainText(await loadRates(), travellerCurrency(a)),
  });

  const compare = betaZodTool({
    name: "compare_prices",
    description:
      "Say which of several options is cheaper when they may be priced in different currencies. Returns one short sentence made by code, marked (≈) when it rests on an estimate, or 'too close to call' under 3%. Quote it exactly; never compare across currencies yourself.",
    inputSchema: z.object({
      options: z
        .array(amount.omit({ atHotel: true }).extend({ fees: z.number().optional().describe("Taxes, levies and fees the hotel states as not included, in the same currency; added by code") }))
        .min(2)
        .max(6)
        .describe("Like for like: each option's `amount` is the same kind of figure (all room prices before fees, with stated fees in `fees`)"),
    }),
    run: async ({ options }) => {
      const to = travellerCurrency(a);
      const rates = await loadRates();
      // Fees are added in code, so a room price is never compared with another hotel's total.
      const totals = options.map((o) => ({ label: o.label, currency: o.currency, amount: o.amount + (o.fees ?? 0) }));
      const text = compareText(totals, to, rates) ?? "These cannot be compared: no exchange rate for one of the currencies. Show each in its own currency.";
      a.log.event("fx.compare", { to: to ?? null, rateDate: rates?.date ?? null, text });
      return text;
    },
  });

  return [estimate, compare, explain];
}
