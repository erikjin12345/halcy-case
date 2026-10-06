// PageDriver over one Playwright page: the prototype's hands. This is the raw
// driver. It reads every frame, so it must only ever be handed to
// guardedDriver, never to an agent or a tool.

import type { Page } from "playwright";
import { act, observe } from "../../browser.ts";
import { locationOf, type PageDriver, type PageLocation } from "./driver.ts";

export function playwrightDriver(page: Page): PageDriver {
  const listeners = new Set<(to: PageLocation) => void>();
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const to = locationOf(frame.url());
    for (const cb of [...listeners]) cb(to);
  });

  return {
    observe: () => observe(page),
    // The starter's act waits for domcontentloaded after the action.
    act: (action) => act(page, action),
    goto: async (url) => {
      await page.goto(url);
    },
    location: () => locationOf(page.url()),
    // Same index scheme as the starter's observe: "<frame index>:<n>".
    frameUrlOf(id) {
      const frame = page.frames()[Number(id.split(":")[0])];
      return frame ? frame.url() : null;
    },
    screenshot: () => page.screenshot({ mask: [page.locator("iframe")] }),
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
