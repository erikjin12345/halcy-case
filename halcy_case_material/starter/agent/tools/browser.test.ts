import { test } from "node:test";
import assert from "node:assert/strict";
import type { Observation } from "../../browser.ts";
import type { RunLog } from "../../log.ts";
import { PaymentBoundary } from "./boundary.ts";
import { renderObservation } from "./browser.ts";

const HOTEL = "http://localhost:4100/payment?hold=h1";
const PAY = "http://localhost:4101/fields?intent=pi_1";
const CARD = "4242 4242 4242 4242";

// What the starter's observe() returns on the mock's payment page: the hotel
// frame and the payment provider's iframe, read straight through.
const seen: Observation = {
  url: HOTEL,
  title: "Payment",
  text: [
    { frameUrl: HOTEL, text: "Total €358.00\nCharged now €0.00\nPaid at the hotel €358.00" },
    { frameUrl: PAY, text: `Card number ${CARD}\nExpiry 12/30\nCVC 123` },
  ],
  elements: [
    { id: "0:0", frameUrl: HOTEL, tag: "input", role: null, type: "checkbox", name: "I accept the terms", value: "on", checked: false, disabled: false },
    { id: "1:0", frameUrl: PAY, tag: "input", role: null, type: "text", name: "Card number", value: CARD, checked: null, disabled: false },
    { id: "1:1", frameUrl: PAY, tag: "input", role: null, type: "text", name: "CVC", value: "123", checked: null, disabled: false },
  ],
};

const log = { event() {} } as unknown as RunLog;

test("the payment provider's frame is never rendered for the model", () => {
  const out = renderObservation(seen, new PaymentBoundary("http://localhost:4100", log));
  assert.ok(out.includes("Charged now €0.00"), "the hotel's own text is there");
  assert.ok(out.includes("0:0 | input/checkbox | I accept the terms"), "the hotel's own elements are there");
  assert.ok(out.includes("[frame on http://localhost:4101: not read"), "the hidden frame is named by origin only");
  assert.equal(out.includes("4242"), false, "no card number");
  assert.equal(out.includes("CVC"), false, "no card field");
  assert.equal(out.includes("1:0"), false, "no id the model could act on");
  assert.equal(out.includes("intent=pi_1"), false, "no provider URL details");
});

test("in blind mode not even the hotel's frame is rendered", () => {
  const b = new PaymentBoundary("http://localhost:4100", log);
  b.beginBlind("test");
  const out = renderObservation(seen, b);
  assert.equal(out.includes("€358.00"), false);
  assert.equal(out.includes("4242"), false);
  assert.equal(/^\d+:\d+ \|/m.test(out), false, "no element lines at all");
});
