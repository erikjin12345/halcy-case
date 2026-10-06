import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright";
import { EMBEDDED, playwrightDriver } from "./playwright-driver.ts";

const HOTEL = "http://localhost:4100/payment?hold=h1";
const PAY = "http://localhost:4101/fields?intent=pi_1";
const onHotel = (url: string) => url.startsWith("http://localhost:4100");

/** A frame that counts how often code is run inside it. `urls` are returned in order, the last one repeating. */
function frame(urls: string[], found: unknown) {
  const f = {
    evaluated: 0,
    url: () => (urls.length > 1 ? urls.shift()! : urls[0]),
    evaluate: async () => (f.evaluated++, found),
  };
  return f;
}

function page(frames: ReturnType<typeof frame>[]) {
  const shots: unknown[] = [];
  const fake = {
    frames: () => frames,
    mainFrame: () => frames[0],
    url: () => HOTEL,
    title: async () => "Payment",
    on: () => {},
    locator: (selector: string) => ({ selector }),
    screenshot: async (opts: unknown) => (shots.push(opts), Buffer.from("png")),
  };
  return { page: fake as unknown as Page, shots };
}

const hotelFound = { text: "Charged now €0.00", elements: [{ id: "0:0", tag: "input", role: null, type: "checkbox", name: "I accept the terms", value: "on", checked: false, disabled: false }] };
const payFound = { text: "Card number 4242 4242 4242 4242", elements: [{ id: "1:0", tag: "input", role: null, type: "text", name: "Card number", value: "4242 4242 4242 4242", checked: null, disabled: false }] };

test("observe never runs code inside a frame outside the hotel's site", async () => {
  const hotel = frame([HOTEL], hotelFound);
  const pay = frame([PAY], payFound);
  const driver = await playwrightDriver(page([hotel, pay]).page, onHotel);
  const seen = await driver.observe();
  assert.equal(hotel.evaluated, 1);
  assert.equal(pay.evaluated, 0, "the provider's frame was not entered");
  assert.deepEqual(seen.text, [{ frameUrl: HOTEL, text: "Charged now €0.00" }, { frameUrl: PAY, text: "" }], "frame indexes are kept");
  assert.deepEqual(seen.elements.map((e) => e.id), ["0:0"]);
  assert.equal(JSON.stringify(seen).includes("4242"), false);
  assert.equal(driver.frameUrlOf("1:0"), PAY, "the id still resolves to the frame it would be in, for the refusal check");
});

test("a frame that leaves the hotel's site while it is being read is dropped", async () => {
  const moved = frame([HOTEL, PAY], payFound);
  const seen = await (await playwrightDriver(page([moved]).page, onHotel)).observe();
  assert.deepEqual(seen.text, [{ frameUrl: PAY, text: "" }]);
  assert.equal(seen.elements.length, 0);
});

test("every screenshot masks every embedded document", async () => {
  const { page: p, shots } = page([frame([HOTEL], hotelFound)]);
  await (await playwrightDriver(p, onHotel)).screenshot();
  assert.deepEqual(shots, [{ mask: [{ selector: EMBEDDED }] }]);
  for (const tag of ["iframe", "frame", "object", "embed"]) assert.ok(EMBEDDED.split(", ").includes(tag), tag);
});

test("in the background a screenshot is refused rather than hanging, and the hand-off brings the window back", async () => {
  const { page: p, shots } = page([frame([HOTEL], hotelFound)]);
  const calls: string[] = [];
  const cdp = { send: async (method: string, params?: { bounds?: { windowState?: string } }) => (calls.push(params?.bounds?.windowState ?? method), { windowId: 1 }), detach: async () => {} };
  (p as unknown as { context: () => unknown }).context = () => ({ newCDPSession: async () => cdp });
  (p as unknown as { bringToFront: () => Promise<void> }).bringToFront = async () => void calls.push("bringToFront");
  const driver = await playwrightDriver(p, onHotel, { background: true });
  assert.deepEqual(calls, ["Browser.getWindowForTarget", "minimized"]);
  assert.equal((await driver.observe()).elements.length, 1, "reading works in the background");
  await assert.rejects(driver.screenshot(), /background/);
  assert.equal(shots.length, 0);
  await driver.bringToFront();
  const after = calls.slice(2);
  assert.ok(after.indexOf("normal") >= 0 && after.indexOf("normal") < after.indexOf("maximized"), "restored, then maximised");
  assert.equal(calls.at(-1), "bringToFront", "then shown");
  await driver.screenshot();
  assert.equal(shots.length, 1, "after the hand-off screenshots work again");
});

test("only index.ts and the parallel search build the raw driver, each wrapping it at once", () => {
  const root = new URL("..", import.meta.url).pathname;
  const users: string[] = [];
  for (const entry of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || entry.endsWith("playwright-driver.ts")) continue;
    if (/from "[^"]*playwright-driver/.test(readFileSync(join(root, entry), "utf8"))) users.push(entry);
  }
  assert.deepEqual(users.sort(), ["agents/search-parallel.ts", "index.ts"]);
});
