// Browser plumbing: open a page, describe what's on it, do one thing to it.
//
// This is deliberately dumb. It lists what is visible and clickable in every
// frame and lets you act on an element by id. Deciding what to look at, what a
// model is allowed to touch, and when to stop is yours.

import { chromium, type Browser, type Frame, type Page } from "playwright";

export interface PageElement {
  /** Stable for one observation only. Re-observe after every action. */
  id: string;
  frameUrl: string;
  tag: string;
  role: string | null;
  type: string | null;
  /** Best-effort accessible name: aria-label, label, placeholder or text. */
  name: string;
  value: string | null;
  checked: boolean | null;
  disabled: boolean;
  /** True for a field that cannot be typed into, e.g. a date field that opens a picker. */
  readOnly?: boolean;
  /** The field's own attributes, which say what it is in any language: autocomplete, inputmode, name, id. */
  autocomplete?: string | null;
  inputMode?: string | null;
  fieldName?: string | null;
  fieldId?: string | null;
}

export interface Observation {
  url: string;
  title: string;
  /** Visible text per frame, trimmed. Frame 0 is the top page. */
  text: { frameUrl: string; text: string }[];
  elements: PageElement[];
}

export type Action =
  | { kind: "click"; id: string }
  | { kind: "fill"; id: string; value: string }
  | { kind: "select"; id: string; value: string }
  | { kind: "check"; id: string; checked: boolean }
  | { kind: "goto"; url: string };

/**
 * `tucked`: start the window as small as the system allows, in the far corner
 * of the screen, so the moment before it is minimised shows next to nothing.
 * macOS keeps windows on a display and at least 500x375, so it cannot be
 * launched fully out of sight. The page's viewport is fixed below, so the
 * window's size does not change how the site lays out.
 */
export async function openBrowser(opts: { headless?: boolean; tucked?: boolean } = {}): Promise<{ browser: Browser; page: Page }> {
  const args = opts.tucked && !opts.headless ? ["--window-position=20000,20000", "--window-size=1,1"] : [];
  const browser = await chromium.launch({ headless: opts.headless ?? false, args });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, locale: "en-GB" });
  // tsx compiles functions passed to page.evaluate with a `__name` helper that
  // only exists in Node; without this shim every evaluate fails in the page.
  await context.addInitScript({ content: "globalThis.__name = (f) => f;" });
  const page = await context.newPage();
  return { browser, page };
}

const frames = new WeakMap<Page, Frame[]>();

/**
 * `canRead` decides per frame address whether the frame is entered at all. A
 * frame that fails it is listed with empty text and nothing is run inside it,
 * so its fields are never read and its DOM is never touched. Frame indexes
 * stay the same either way.
 */
export async function observe(page: Page, maxText = 4000, canRead: (frameUrl: string) => boolean = () => true): Promise<Observation> {
  const all = page.frames();
  frames.set(page, all);
  const text: Observation["text"] = [];
  const elements: PageElement[] = [];

  for (const [fi, frame] of all.entries()) {
    if (!canRead(frame.url())) {
      text.push({ frameUrl: frame.url(), text: "" });
      continue;
    }
    try {
      const found = await frame.evaluate(
        ({ fi, maxText }) => {
          const visible = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
          };
          const nameOf = (el: HTMLElement) => {
            const aria = el.getAttribute("aria-label");
            if (aria) return aria;
            const id = el.getAttribute("id");
            const forLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
            const wrap = el.closest("label");
            const label = (forLabel ?? wrap)?.textContent?.trim();
            if (label) return label;
            const ph = el.getAttribute("placeholder");
            if (ph) return ph;
            return (el.innerText || (el as HTMLInputElement).value || "").trim().slice(0, 120);
          };
          const sel = "a[href],button,input,select,textarea,[role=button],[onclick],[data-date]";
          const out: any[] = [];
          let n = 0;
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
            if ((el as HTMLInputElement).type === "hidden" || !visible(el)) continue;
            const id = `${fi}:${n++}`;
            el.setAttribute("data-agent-id", id);
            const input = el as HTMLInputElement;
            // A field whose attributes say it holds card data or a bank code is
            // never read, filled or empty: its value does not leave the page.
            const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
            const secret = /\bcc-|one-time-code/.test(ac) || input.type === "password";
            out.push({
              id,
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute("role"),
              type: el.getAttribute("type"),
              name: nameOf(el),
              value: secret ? null : "value" in el ? String(input.value ?? "") : null,
              checked: input.type === "checkbox" || input.type === "radio" ? input.checked : null,
              disabled: input.disabled === true,
              readOnly: input.readOnly === true,
              autocomplete: el.getAttribute("autocomplete"),
              inputMode: el.getAttribute("inputmode"),
              fieldName: el.getAttribute("name"),
              fieldId: el.getAttribute("id"),
            });
          }
          return { text: (document.body?.innerText ?? "").trim().slice(0, maxText), elements: out };
        },
        { fi, maxText },
      );
      // The frame may have navigated while we were reading it.
      if (!canRead(frame.url())) {
        text.push({ frameUrl: frame.url(), text: "" });
        continue;
      }
      text.push({ frameUrl: frame.url(), text: found.text });
      for (const e of found.elements) elements.push({ ...e, frameUrl: frame.url() });
    } catch (e) {
      // A frame can navigate away mid-evaluate; the next observe sees it again.
      text.push({ frameUrl: frame.url(), text: `[could not read this frame: ${String(e).slice(0, 200)}]` });
    }
  }
  return { url: page.url(), title: await page.title(), text, elements };
}

/** Address of the frame an element id points at, from the same frame list `act` uses. */
export function frameUrlOf(page: Page, id: string): string | null {
  const frame = frames.get(page)?.[Number(id.split(":")[0])];
  return frame ? frame.url() : null;
}

export async function act(page: Page, action: Action): Promise<void> {
  if (action.kind === "goto") {
    await page.goto(action.url);
    return;
  }
  const [fi] = action.id.split(":");
  const frame = frames.get(page)?.[Number(fi)];
  if (!frame) throw new Error(`no frame for ${action.id}; observe again`);
  const el = frame.locator(`[data-agent-id="${action.id}"]`);
  // An id from an observation that has since been redrawn (a calendar month, a
  // stepper) points at nothing. Say so at once instead of waiting 5 s for it.
  if ((await el.count()) === 0) throw new Error(`element ${action.id} is gone; the page changed, observe again`);
  switch (action.kind) {
    case "click":
      await el.click({ timeout: 5000 });
      break;
    case "fill":
      await el.fill(action.value, { timeout: 5000 });
      break;
    case "select":
      await el.selectOption({ label: action.value }, { timeout: 5000 });
      break;
    case "check":
      await el.setChecked(action.checked, { timeout: 5000 });
      break;
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

export async function screenshot(page: Page): Promise<Buffer> {
  return page.screenshot({ fullPage: false });
}
