// PageDriver over one Playwright page: the prototype's hands. This is the raw
// driver: it must only ever be handed to guardedDriver, never to an agent or
// a tool. `canRead` keeps it out of frames it has no business in: a frame
// that fails it is never entered, so nothing in it is read into this process.

import type { Page } from "playwright";
import { act, frameUrlOf, observe } from "../../browser.ts";
import { locationOf, type PageDriver, type PageLocation } from "./driver.ts";

/** Everything that embeds another document. All of it is masked in every screenshot. */
export const EMBEDDED = "iframe, frame, object, embed";

export function playwrightDriver(page: Page, canRead: (frameUrl: string) => boolean): PageDriver {
  const listeners = new Set<(to: PageLocation) => void>();
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const to = locationOf(frame.url());
    for (const cb of [...listeners]) cb(to);
  });

  return {
    observe: () => observe(page, 4000, canRead),
    // The starter's act waits for domcontentloaded after the action.
    act: (action) => act(page, action),
    goto: async (url) => {
      await page.goto(url);
    },
    location: () => locationOf(page.url()),
    // Resolved from the frame list of the last observe, the same one act uses.
    frameUrlOf: (id) => frameUrlOf(page, id),
    screenshot: () => page.screenshot({ mask: [page.locator(EMBEDDED)] }),
    bringToFront: () => page.bringToFront(),
    waitForNavigation(timeoutMs) {
      return new Promise((resolve) => {
        const finish = (result: PageLocation | "timeout") => {
          clearTimeout(timer);
          listeners.delete(finish);
          resolve(result);
        };
        const timer = setTimeout(() => finish("timeout"), timeoutMs);
        listeners.add(finish);
      });
    },
    onNavigated(cb) {
      listeners.add(cb);
    },
    onClosed(cb) {
      page.on("close", cb);
    },
    close: async () => {
      const context = page.context();
      await (context.browser() ?? context).close();
    },
  };
}
