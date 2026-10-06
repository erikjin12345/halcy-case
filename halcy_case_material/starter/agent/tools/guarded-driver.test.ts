import { test } from "node:test";
import assert from "node:assert/strict";
import type { Observation } from "../../browser.ts";
import type { RunLog } from "../../log.ts";
import { PaymentBoundary } from "./boundary.ts";
import { browserTools } from "./browser.ts";
import type { PageDriver, PageLocation } from "./driver.ts";
import { BoundaryError, guardedDriver } from "./guarded-driver.ts";

const HOTEL = "http://localhost:4100/payment?hold=h1";
const PAY = "http://localhost:4101/fields?intent=pi_1";
const CARD = "4242 4242 4242 4242";

const seen: Observation = {
  url: HOTEL,
  title: "Payment",
  text: [
    { frameUrl: HOTEL, text: "Charged now €0.00" },
    { frameUrl: PAY, text: `Card number ${CARD}` },
  ],
  elements: [
    { id: "0:0", frameUrl: HOTEL, tag: "input", role: null, type: "checkbox", name: "I accept the terms", value: "on", checked: false, disabled: false },
    { id: "1:0", frameUrl: PAY, tag: "input", role: null, type: "text", name: "Card number", value: CARD, checked: null, disabled: false },
  ],
};

/** A raw driver that reads everything, like Playwright does, and counts every call that touches the page. */
function fake(at = HOTEL) {
  const calls = { observe: 0, act: 0, goto: 0, screenshot: 0 };
  const events: string[] = [];
  let navigated: (to: PageLocation) => void = () => {};
  const where = () => ({ origin: new URL(at).origin, path: new URL(at).pathname });
  const raw: PageDriver = {
    observe: async () => (calls.observe++, { ...seen, url: at }),
    act: async () => void calls.act++,
    goto: async () => void calls.goto++,
    location: where,
    frameUrlOf: (id) => (id.startsWith("0:") ? HOTEL : id.startsWith("1:") ? PAY : null),
    screenshot: async () => (calls.screenshot++, Buffer.from("png")),
    bringToFront: async () => {},
    waitForNavigation: async () => where(),
    onNavigated: (cb) => void (navigated = cb),
    onClosed: () => {},
    close: async () => {},
  };
  const log = { event: (type: string) => void events.push(type), screenshot: () => "001.png" } as unknown as RunLog;
  const boundary = new PaymentBoundary("http://localhost:4100", log);
  return { calls, events, raw, log, boundary, driver: guardedDriver(raw, boundary), navigate: (to: PageLocation) => navigated(to) };
}

test("while blind, nothing that reads or touches the page reaches the raw driver", async () => {
  const f = fake();
  f.boundary.beginBlind("traveller takes over");
  await assert.rejects(f.driver.observe(), BoundaryError);
  await assert.rejects(f.driver.act({ kind: "click", id: "0:0" }), BoundaryError);
  await assert.rejects(f.driver.goto("http://localhost:4100/"), BoundaryError);
  await assert.rejects(f.driver.screenshot(), BoundaryError);
  assert.deepEqual(f.calls, { observe: 0, act: 0, goto: 0, screenshot: 0 });
});

test("while blind, the model's tools get a refusal and make no driver call", async () => {
  const f = fake();
  const tools = Object.fromEntries(browserTools({ driver: f.driver, boundary: f.boundary, log: f.log }).map((t) => [(t as { name: string }).name, t])) as Record<
    string,
    { run: (input: unknown) => unknown }
  >;
  f.boundary.beginBlind("traveller takes over");
  for (const [name, input] of [
    ["observe", {}],
    ["act", { kind: "click", id: "0:0" }],
    ["goto", { url: "http://localhost:4100/" }],
    ["screenshot", {}],
  ] as const) {
    assert.match(String(await tools[name].run(input)), /blind|refused/i, name);
  }
  assert.deepEqual(f.calls, { observe: 0, act: 0, goto: 0, screenshot: 0 });
  assert.equal(f.events.some((e) => ["observe", "act", "goto", "screenshot"].includes(e)), false, "no observation was logged");
});

test("the payment provider's frame is emptied before the observation is returned", async () => {
  const f = fake();
  const out = await f.driver.observe();
  const dump = JSON.stringify(out);
  assert.ok(dump.includes("Charged now €0.00"), "the hotel's own text is there");
  assert.equal(dump.includes("4242"), false, "no card number anywhere in the object");
  assert.equal(dump.includes("intent=pi_1"), false, "no provider address details");
  assert.deepEqual(out.elements.map((e) => e.id), ["0:0"]);
  assert.deepEqual(out.text[1], { frameUrl: "http://localhost:4101", text: "" });
});

test("acting in the provider's frame or leaving the hotel's site is refused before the page is touched", async () => {
  const f = fake();
  await assert.rejects(f.driver.act({ kind: "fill", id: "1:0", value: "x" }), BoundaryError);
  await assert.rejects(f.driver.act({ kind: "click", id: "9:0" }), BoundaryError);
  await assert.rejects(f.driver.goto("http://localhost:4101/__phone"), BoundaryError);
  assert.equal(f.driver.frameUrlOf("1:0"), "http://localhost:4101", "a foreign frame is named by origin only");
  assert.deepEqual(f.calls, { observe: 0, act: 0, goto: 0, screenshot: 0 });
  await f.driver.act({ kind: "click", id: "0:0" });
  await f.driver.goto("http://localhost:4100/rooms");
  assert.deepEqual(f.calls, { observe: 0, act: 1, goto: 1, screenshot: 0 });
});

test("a main tab on another site is reported as an origin only", async () => {
  const f = fake("https://bank.example/3ds/challenge?token=secret");
  assert.deepEqual(f.driver.location(), { origin: "https://bank.example", path: "" });
  assert.deepEqual(await f.driver.waitForNavigation(10), { origin: "https://bank.example", path: "" });
  const out = await f.driver.observe();
  assert.equal(out.url, "https://bank.example");
  assert.equal(out.title, "");
  const got: PageLocation[] = [];
  f.driver.onNavigated((to) => got.push(to));
  f.navigate({ origin: "https://bank.example", path: "/3ds/done" });
  f.navigate({ origin: "http://localhost:4100", path: "/confirmation/CH-123456" });
  assert.deepEqual(got, [
    { origin: "https://bank.example", path: "" },
    { origin: "http://localhost:4100", path: "/confirmation/CH-123456" },
  ]);
});

test("navigation signals still work while blind, and say where the tab is on the hotel's site", async () => {
  const f = fake();
  f.boundary.beginBlind("traveller takes over");
  assert.deepEqual(f.driver.location(), { origin: "http://localhost:4100", path: "/payment" });
  assert.deepEqual(await f.driver.waitForNavigation(10), { origin: "http://localhost:4100", path: "/payment" });
});

test("an action's label is logged from the redacted observation, never for a sensitive field", async () => {
  const f = fake();
  const elements = [
    { id: "0:0", frameUrl: HOTEL, tag: "button", role: null, type: null, name: "Accept all cookies", value: null, checked: null, disabled: false },
    { id: "0:1", frameUrl: HOTEL, tag: "input", role: null, type: "text", name: "Card number", value: "", checked: null, disabled: false },
  ];
  f.raw.observe = async () => ({ url: HOTEL, title: "x", text: [], elements });
  await f.driver.observe();
  assert.equal(f.driver.labelOf?.("0:0"), "Accept all cookies");
  assert.equal(f.driver.labelOf?.("0:1"), null);
  const tools = Object.fromEntries(browserTools({ driver: f.driver, boundary: f.boundary, log: f.log }).map((t) => [(t as { name: string }).name, t])) as Record<string, { run: (input: unknown) => unknown }>;
  const logged: Record<string, unknown>[] = [];
  (f.log as unknown as { event: (t: string, d: Record<string, unknown>) => void }).event = (t, d) => void (t === "act" && logged.push(d));
  await tools.act.run({ kind: "click", id: "0:0" });
  assert.equal(logged[0]?.label, "Accept all cookies");
});
