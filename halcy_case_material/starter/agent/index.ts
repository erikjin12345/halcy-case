// Entry point: an `Agent` the chat server can call instead of the starter one.
// Opens one browser, sets the payment boundary to the hotel's origin, runs the
// orchestrator, and leaves the page where the payment hand-off takes over.

import { openBrowser } from "../browser.ts";
import { GuardedLog } from "./evidence/log.ts";
import type { Agent } from "../types.ts";
import { runOrchestrator } from "./agents/orchestrator.ts";
import { HEADLESS, hasCredential, loadDotEnv } from "./config.ts";
import { PaymentBoundary } from "./tools/boundary.ts";
import { newRunState } from "./types.ts";

export const bookingAgent: Agent = async (message, chat, ctx) => {
  loadDotEnv();
  const log = new GuardedLog("booking");
  log.event("message", { message, traveller: ctx.traveller, today: ctx.today });

  if (!hasCredential()) {
    chat.say("I can't reach my model right now (no API credential configured). Ask whoever runs me to set ANTHROPIC_API_KEY.");
    log.event("error", { reason: "no credential" });
    return;
  }

  // The hotel is given by name; the orchestrator resolves it, but the boundary
  // needs an origin before any browser tool runs. Allow every known hotel site.
  const { browser, page } = await openBrowser({ headless: HEADLESS });
  const boundary = new PaymentBoundary(Object.values(ctx.hotels)[0] ?? "http://localhost", log);
  for (const url of Object.values(ctx.hotels)) boundary.allow(url);

  try {
    const approved = await runOrchestrator({ chat, ctx, log, state: newRunState() }, message, { page, boundary });
    log.event("orchestrator.done", { approved });
    if (approved) {
      // TODO: payment hand-off (agent/payment in the planning folder). Until it
      // exists, say so instead of pretending.
      chat.say("The hand-off to payment isn't built yet. Nothing has been booked or charged.");
    }
  } catch (e) {
    log.event("error", { error: String(e).slice(0, 500) });
    // The detail goes to the run log, never to the traveller.
    chat.say("Something went wrong on my side and I had to stop. I had not started the payment step, so nothing has been booked or charged.");
  } finally {
    await browser.close();
    log.event("done", { dir: log.dir });
  }
};
