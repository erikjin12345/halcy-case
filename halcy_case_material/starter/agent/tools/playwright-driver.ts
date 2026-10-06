// PageDriver over one Playwright page: the prototype's hands. This is the raw
// driver: it must only ever be handed to guardedDriver, never to an agent or
// a tool. `canRead` keeps it out of frames it has no business in: a frame
// that fails it is never entered, so nothing in it is read into this process.

import type { Page } from "playwright";
import { act, frameUrlOf, observe } from "../../browser.ts";
import { locationOf, type PageDriver, type PageLocation } from "./driver.ts";

/** Everything that embeds another document. All of it is masked in every screenshot. */
export const EMBEDDED = "iframe, frame, object, embed";

type Bounds = { windowState?: "minimized" | "normal"; left?: number; top?: number; width?: number; height?: number };

/** Sets the window's bounds through CDP, one step at a time. False when there is no window (headless) or it is not Chromium. */
async function setWindow(page: Page, ...steps: Bounds[]): Promise<boolean> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    for (const bounds of steps) await cdp.send("Browser.setWindowBounds", { windowId, bounds });
    await cdp.detach();
    return true;
  } catch {
    return false;
  }
}

/**
 * `background`: minimise the window as soon as it opens, so the agent's work
 * does not take focus from the chat. Reading, clicking and navigating work
 * minimised; screenshots do not (Chromium does not paint a minimised window),
 * so they are refused until the hand-off brings the window forward.
 */
export async function playwrightDriver(page: Page, canRead: (frameUrl: string) => boolean, opts: { background?: boolean } = {}): Promise<PageDriver> {
  let inBackground = opts.background === true && (await setWindow(page, { windowState: "minimized" }));
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
    screenshot: async () => {
      if (inBackground) throw new Error("no screenshot while the window is in the background; it is taken once the traveller has the window");
      return page.screenshot({ mask: [page.locator(EMBEDDED)] });
    },
    // The hand-off: restore a minimised window, then activate the tab.
    bringToFront: async () => {
      // Restore, then give it its full size near the top left of the main display.
      if (inBackground) await setWindow(page, { windowState: "normal" }, { left: 60, top: 40, width: 1240, height: 980 });
      inBackground = false;
      await page.bringToFront();
    },
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
