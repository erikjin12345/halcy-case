// Fakes for the payment tests: a raw driver that serves scripted pages and
// counts every call that touches the page, a chat whose buttons the test
// presses, and a log that keeps its events in memory.

import type { Observation } from "../../browser.ts";
import type { RunLog } from "../../log.ts";
import type { Button, Card, Chat } from "../../types.ts";
import { locationOf, type PageDriver, type PageLocation } from "../tools/driver.ts";

export const HOTEL = "http://localhost:4100";
export const PAY_FRAME = "http://localhost:4101/fields?intent=pi_1";

export function fakeLog() {
  const events: { type: string; data: Record<string, unknown> }[] = [];
  const log = { event: (type: string, data: Record<string, unknown> = {}) => void events.push({ type, data }), screenshot: () => "001.png" } as unknown as RunLog;
  return { log, events, types: () => events.map((e) => e.type) };
}

export function fakeChat() {
  const said: string[] = [];
  const cards: Card[] = [];
  const pending = new Map<string, (id: string) => void>();
  const chat: Chat = {
    say: (text) => void said.push(text),
    card: (card) => String(cards.push(card)),
    choose: (card: Card & { buttons: Button[] }) => (cards.push(card), new Promise((resolve) => pending.set(card.title, resolve))),
    reply: () => new Promise(() => {}),
  };
  /** Presses a button on the open card whose title starts with `title`. */
  const press = (title: string, id: string) => {
    for (const [t, resolve] of pending) if (t.startsWith(title)) return resolve(id);
    throw new Error(`no open card "${title}"`);
  };
  return { chat, said, cards, press };
}

/** A raw driver over scripted pages: `pages` maps a path to the hotel's visible text there. */
export function fakeRaw(pages: Record<string, string>, start: string) {
  const calls = { observe: 0, act: 0, goto: 0, screenshot: 0, front: 0 };
  let at = start;
  const navigated: ((to: PageLocation) => void)[] = [];
  const closed: (() => void)[] = [];
  const raw: PageDriver = {
    observe: async (): Promise<Observation> => {
      calls.observe++;
      const { path } = locationOf(at);
      const text = [{ frameUrl: at, text: pages[path] ?? "" }];
      if (path === "/payment") text.push({ frameUrl: PAY_FRAME, text: "" });
      return { url: at, title: path, text, elements: [] };
    },
    act: async () => void calls.act++,
    goto: async (url) => void (calls.goto++, (at = url)),
    location: () => locationOf(at),
    frameUrlOf: () => at,
    screenshot: async () => (calls.screenshot++, Buffer.from("png")),
    bringToFront: async () => void calls.front++,
    waitForNavigation: async () => "timeout",
    onNavigated: (cb) => void navigated.push(cb),
    onClosed: (cb) => void closed.push(cb),
    close: async () => {},
  };
  return {
    raw,
    calls,
    /** The traveller's browser goes somewhere. */
    navigate: (url: string) => ((at = url), navigated.forEach((cb) => cb(locationOf(url)))),
    closeTab: () => closed.forEach((cb) => cb()),
  };
}

/** Lets pending promise callbacks and zero-delay timers run. */
export const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
