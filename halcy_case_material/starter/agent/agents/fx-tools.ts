// The orchestrator's two money tools. Every estimate and every comparison
// across currencies is made here, in code, from ECB rates; the model quotes
// the returned text and never converts, rounds or compares on its own.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunnableTool } from "../llm/client.ts";
import { compareText, estimateText, loadRates } from "../scoring/fx.ts";
import type { AgentContext } from "../types.ts";

/** The traveller's own currency: their profile, else the currency of a budget they gave, else none. */
export function travellerCurrency(a: Pick<AgentContext, "ctx" | "state">): string | undefined {
  return a.ctx.traveller.currency ?? a.state.goal?.budget?.currency;
}

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
      "Estimate hotel amounts in the traveller's own currency at today's ECB rate. Returns one line per amount: the hotel's figure first, then the estimate text. Quote the lines exactly; never convert or round yourself. Returns the hotel's figure alone when no estimate can be made.",
    inputSchema: z.object({ amounts: z.array(amount).min(1).max(8) }),
    run: async ({ amounts }) => {
      const to = travellerCurrency(a);
      const rates = await loadRates();
      const lines = amounts.map((x) => {
        const est = estimateText(x.amount, x.currency, to, rates, x.atHotel ?? false);
        return `${x.label}: ${x.currency} ${x.amount.toFixed(2)}${est ? ` ${est}` : ""}`;
      });
      a.log.event("fx.estimate", { to: to ?? null, rateDate: rates?.date ?? null, source: rates?.source ?? null, lines });
      return lines.join("\n");
    },
  });

  const compare = betaZodTool({
    name: "compare_prices",
    description:
      "Say which of several options is cheaper when they may be priced in different currencies. Returns one sentence made by code, labelled as an estimate when currencies differ, or 'too close to call' under 3%. Quote it exactly; never compare across currencies yourself.",
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

  return [estimate, compare];
}
