// Entry point: an `Agent` the chat server can call instead of the starter one.
// Sets the payment boundary to the hotel's origin, runs the orchestrator, and
// then runs the payment hand-off on the page it left. The one browser of the
// run is opened when an agent first needs the page, not before.

import { openBrowser } from "../browser.ts";
import { GuardedLog } from "./evidence/log.ts";
import type { Agent } from "../types.ts";
import { runOrchestrator } from "./agents/orchestrator.ts";
import { HEADLESS, hasCredential, loadDotEnv } from "./config.ts";
import { modelClassifier } from "./payment/classify.ts";
import { runValidation } from "./agents/validation.ts";
import { holdReportFrom, revalidationNote, runPayment } from "./payment/fresh-hold.ts";
import { termsFrom } from "./payment/handoff.ts";
import { PaymentBoundary } from "./tools/boundary.ts";
import { guardedDriver } from "./tools/guarded-driver.ts";
import { lazyDriver } from "./tools/lazy-driver.ts";
import { playwrightDriver } from "./tools/playwright-driver.ts";
import { traceStep } from "./trace.ts";
import { newRunState } from "./types.ts";
import { loadRates } from "./scoring/fx.ts";
import { travellerCurrency } from "./agents/fx-tools.ts";

export const bookingAgent: Agent = async (message, chat, ctx) => {
  loadDotEnv();
  const log = new GuardedLog("booking");
  // The trace panel sees the run log's own events, after GuardedLog has scrubbed them.
  log.subscribe((type, data, blind) => {
    const step = traceStep(type, data, blind, ctx.traveller);
    if (step) chat.trace?.(step);
  });
  log.event("message", { message, traveller: ctx.traveller, today: ctx.today });

  if (!hasCredential()) {
    chat.say("I can't reach my model right now (no API credential configured). Ask whoever runs me to set ANTHROPIC_API_KEY.");
    log.event("error", { reason: "no credential" });
    return;
  }

  // The hotel is given by name; the orchestrator resolves it, but the boundary
  // needs an origin before any browser tool runs. Allow every known hotel site.
  const boundary = new PaymentBoundary(Object.values(ctx.hotels)[0] ?? "http://localhost", log);
  for (const url of Object.values(ctx.hotels)) boundary.allow(url);
  // The raw driver never enters a frame outside the hotel's site, and only the
  // guarded one leaves this function. The window starts minimised so it stays
  // out of the way; the hand-off brings it forward when the traveller pays.
  const raw = lazyDriver(async () => {
    const { page } = await openBrowser({ headless: HEADLESS, tucked: true });
    log.event("browser.open", {});
    return playwrightDriver(page, (url) => boundary.known(url), { background: true });
  });
  const driver = guardedDriver(raw, boundary);

  try {
    const state = newRunState();
    const agents = { chat, ctx, log, state };
    const approved = await runOrchestrator(agents, message, { driver, boundary });
    log.event("orchestrator.done", { approved });
    if (approved) {
      // Validation left the browser on the hotel's payment page. From here on
      // it is code, not a model: the traveller pays in the hotel's window.
      const validated = [...state.validations].reverse().find((v) => v.candidateId === approved && v.accepted);
      const handoff = { driver, boundary, chat, log, hotel: state.goal?.hotel.name ?? "the hotel", terms: termsFrom(validated?.observed ?? {}), holdReport: holdReportFrom(validated, state.store.candidate(approved)), visible: !HEADLESS, classify: modelClassifier(log), fx: { to: travellerCurrency(agents), rates: await loadRates() } };
      // If the hold ran down or the page changed while the traveller was
      // deciding, validate the same candidate once more for a fresh hold.
      await runPayment(handoff, async () => {
        const goal = state.goal;
        const notes = goal?.notes;
        if (goal) goal.notes = [notes, revalidationNote(handoff.terms)].filter(Boolean).join(" ");
        try {
          const again = await runValidation(agents, { driver, boundary, candidateId: approved });
          return again.accepted ? { terms: termsFrom(again.observed), holdReport: holdReportFrom(again, state.store.candidate(approved)) } : undefined;
        } finally {
          if (goal) goal.notes = notes;
        }
      });
    }
  } catch (e) {
    log.event("error", { error: String(e).slice(0, 500) });
    // The detail goes to the run log, never to the traveller.
    chat.say("Something went wrong on my side and I had to stop. I had not started the payment step, so nothing has been booked or charged.");
  } finally {
    await driver.close();
    log.event("done", { dir: log.dir });
  }
};
