// A driver whose browser is opened on first use, not when the run starts. A
// run that ends before search (an unknown hotel, a card typed into the chat,
// the traveller stopping) never opens a window. One browser per run still:
// `open` is called at most once, and every later call goes to that page.

import type { PageDriver, PageLocation } from "./driver.ts";

export interface LazyDriver extends PageDriver {
  readonly opened: boolean;
}

const NOWHERE: PageLocation = { origin: "about:blank", path: "" };

export function lazyDriver(open: () => Promise<PageDriver>): LazyDriver {
  let real: PageDriver | undefined;
  let opening: Promise<PageDriver> | undefined;
  const navigated: ((to: PageLocation) => void)[] = [];
  const closed: (() => void)[] = [];
  const get = () =>
    (opening ??= open().then((d) => {
      real = d;
      for (const cb of navigated) d.onNavigated(cb);
      for (const cb of closed) d.onClosed(cb);
      return d;
    }));

  return {
    get opened() {
      return opening !== undefined;
    },
    observe: async () => (await get()).observe(),
    act: async (action) => (await get()).act(action),
    goto: async (url) => (await get()).goto(url),
    location: () => real?.location() ?? NOWHERE,
    frameUrlOf: (id) => real?.frameUrlOf(id) ?? null,
    labelOf: (id) => real?.labelOf?.(id) ?? null,
    screenshot: async () => (await get()).screenshot(),
    bringToFront: async () => (await get()).bringToFront(),
    waitForNavigation: async (ms) => (await get()).waitForNavigation(ms),
    onNavigated: (cb) => (real ? real.onNavigated(cb) : void navigated.push(cb)),
    onClosed: (cb) => (real ? real.onClosed(cb) : void closed.push(cb)),
    close: async () => {
      if (opening) await (await opening).close();
    },
  };
}
