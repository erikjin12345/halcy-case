import { test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { act, observe } from "./browser.ts";

/** A page with one frame whose element "0:0" exists only while `present` is true. */
function fakePage(present: { value: boolean }) {
  const clicks: number[] = [];
  const frame = {
    url: () => "http://localhost:4100/",
    evaluate: async () => ({ text: "Pick a date", elements: [{ id: "0:0", tag: "button", role: null, type: null, name: "13", value: null, checked: null, disabled: false }] }),
    locator: () => ({
      count: async () => (present.value ? 1 : 0),
      click: async (o: { timeout: number }) => void clicks.push(o.timeout),
    }),
  };
  const page = { frames: () => [frame], url: () => frame.url(), title: async () => "Rooms", waitForLoadState: async () => {} };
  return { page: page as unknown as Page, clicks };
}

test("an element that is gone fails at once, without the 5 s wait", async () => {
  const present = { value: true };
  const { page, clicks } = fakePage(present);
  await observe(page);
  present.value = false; // the first click redrew the calendar
  const started = Date.now();
  await assert.rejects(act(page, { kind: "click", id: "0:0" }), /element 0:0 is gone; the page changed, observe again/);
  assert.ok(Date.now() - started < 500, "no timeout was waited for");
  assert.deepEqual(clicks, [], "nothing was clicked");
});

test("an element that is still there is clicked with the usual timeout", async () => {
  const { page, clicks } = fakePage({ value: true });
  await observe(page);
  await act(page, { kind: "click", id: "0:0" });
  assert.deepEqual(clicks, [5000]);
});

test("a select picks the option by its text, its value or the start of its text, without waiting", async () => {
  const chosen: unknown[] = [];
  const options = [{ text: "12.", value: "12" }, { text: "13.", value: "13" }, { text: "October 2026", value: "2026-10" }];
  const select = {
    count: async () => 1,
    locator: () => ({ evaluateAll: async () => options.map((o) => ({ text: o.text.toLowerCase(), value: o.value })) }),
    selectOption: async (o: unknown) => void chosen.push(o),
  };
  const frame = {
    url: () => "http://localhost:4100/",
    evaluate: async () => ({ text: "", elements: [{ id: "0:0", tag: "select", role: null, type: null, name: "Day", value: "12", checked: null, disabled: false }] }),
    locator: () => select,
  };
  const page = { frames: () => [frame], url: () => frame.url(), title: async () => "t", waitForLoadState: async () => {} } as unknown as Page;
  await observe(page);
  for (const value of ["13", "13.", "October"]) await act(page, { kind: "select", id: "0:0", value });
  assert.deepEqual(chosen, [{ value: "13" }, { value: "13" }, { value: "2026-10" }]);
});
