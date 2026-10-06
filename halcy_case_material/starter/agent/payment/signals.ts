// The wait in the middle of the hand-off. Blind mode is on, so nothing here
// reads the page: it listens for where the main tab goes, for a chat button,
// for the tab closing, and for the clock (DESIGN.md section 3, step 6).

import type { RunLog } from "../../log.ts";
import type { Button, Card, Chat } from "../../types.ts";
import type { PaymentBoundary } from "../tools/boundary.ts";
import type { PageDriver } from "../tools/driver.ts";
import { reminderHalfway, reminderLast } from "./messages.ts";
import type { Signal } from "./types.ts";

export interface WaitDeps {
  driver: PageDriver;
  boundary: PaymentBoundary;
  chat: Chat;
  log: RunLog;
  /** Path of the payment page. Reloads of it are not an outcome. */
  paymentPath: string;
  card: Card & { buttons: Button[] };
  /** Give up after this long. */
  deadlineMs: number;
  /** Send the last reminder this long before the deadline. */
  lastReminderMs?: number;
}

/**
 * Resolves with whatever ends the wait first. A main tab that leaves the
 * hotel's site (hosted payment page, bank check) is not an outcome: only its
 * return to the hotel's site on another page is (DESIGN.md P3).
 */
export function waitForSignal(deps: WaitDeps): Promise<Signal> {
  const { driver, boundary, chat, log, paymentPath, card, deadlineMs } = deps;
  const lastReminderMs = deps.lastReminderMs ?? 3 * 60 * 1000;

  return new Promise((resolve) => {
    let done = false;
    const timers: NodeJS.Timeout[] = [];
    const finish = (signal: Signal) => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      log.event("handoff.signal", signal.kind === "navigated" ? { kind: signal.kind, to: signal.to } : { ...signal });
      resolve(signal);
    };
    const remind = (afterMs: number, text: (secondsLeft: number) => string) => {
      if (afterMs <= 0 || afterMs >= deadlineMs) return;
      timers.push(
        setTimeout(() => {
          const message = text(Math.round((deadlineMs - afterMs) / 1000));
          chat.say(message);
          log.event("handoff.reminder", { text: message });
        }, afterMs),
      );
    };

    driver.onNavigated((to) => {
      if (done) return;
      if (!boundary.known(to.origin)) return void log.event("handoff.away", { origin: to.origin });
      if (to.path !== paymentPath) finish({ kind: "navigated", to });
    });
    driver.onClosed(() => finish({ kind: "closed" }));
    void chat.choose(card).then((id) => {
      if (id === "done" || id === "failed" || id === "cancel") finish({ kind: "button", id });
    });

    remind(deadlineMs / 2, reminderHalfway);
    if (deadlineMs - lastReminderMs > deadlineMs / 2) remind(deadlineMs - lastReminderMs, reminderLast);
    timers.push(setTimeout(() => finish({ kind: "deadline" }), deadlineMs));
    log.event("handoff.wait", { deadlineMs, title: card.title, lines: card.lines });
  });
}
