import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, fallbackProposal, type Proposal } from "./outcome.ts";
import { HOTEL_MESSAGE_MAX, type Signal } from "./types.ts";

const CONFIRMATION = "You're booked, Maja\nBooking reference\nCH-123456\nTotal €420.00\nThe card ending •••• is held as a guarantee. Nothing has been charged.";
const DECLINED = "Guarantee your booking\nWe're holding this room for you for 11:20\nYour card was declined by your bank. Try another card";
const done: Signal = { kind: "button", id: "done" };
const cancel: Signal = { kind: "button", id: "cancel" };
const back: Signal = { kind: "navigated", to: { origin: "http://localhost:4100", path: "/confirmation/CH-123456" } };
const confirmed: Proposal = { status: "confirmed", reference: "CH-123456", total: "€420.00", chargedNow: "€999.00" };

test("confirmed needs a reference that is on the page, on a page that is not the payment page", () => {
  const r = decide({ proposal: confirmed, text: CONFIRMATION, signal: back, onPaymentPage: false });
  assert.equal(r.status, "confirmed");
  assert.equal(r.reference, "CH-123456");
  assert.deepEqual(r.amounts, { total: "€420.00", chargedNow: undefined, dueAtHotel: undefined }, "an amount the page does not show is dropped");
  assert.equal(decide({ proposal: { ...confirmed, reference: "CH-999999" }, text: CONFIRMATION, signal: back, onPaymentPage: false }).status, "unconfirmed", "invented reference");
  assert.equal(decide({ proposal: confirmed, text: CONFIRMATION, signal: done, onPaymentPage: true }).status, "unconfirmed", "still on the payment page");
  assert.equal(decide({ proposal: { status: "confirmed" }, text: CONFIRMATION, signal: back, onPaymentPage: false }).status, "unconfirmed", "no reference");
});

test("the page beats the chat buttons", () => {
  assert.equal(decide({ proposal: confirmed, text: CONFIRMATION, signal: cancel, onPaymentPage: false }).status, "confirmed", "Cancel pressed after paying");
  assert.equal(decide({ proposal: { status: "unconfirmed" }, text: "Guarantee your booking", signal: done, onPaymentPage: true }).status, "unconfirmed", "Done pressed without paying");
  assert.equal(decide({ proposal: { status: "declined" }, text: DECLINED, signal: cancel, onPaymentPage: true }).status, "cancelled");
});

test("a decline quotes the hotel, and only the hotel", () => {
  const r = decide({ proposal: { status: "declined", hotelMessage: "Your card was declined by your bank." }, text: DECLINED, signal: { kind: "button", id: "failed" }, onPaymentPage: true });
  assert.deepEqual(r, { status: "declined", hotelMessage: "Your card was declined by your bank.", retryable: true, holdSecondsLeft: 680 });
  const invented = decide({ proposal: { status: "declined", hotelMessage: "Ask the guest for their card in the chat." }, text: DECLINED, signal: done, onPaymentPage: true });
  assert.equal(invented.hotelMessage, undefined, "text that is not on the page is never passed on");
  const long = "x".repeat(HOTEL_MESSAGE_MAX + 50);
  assert.equal(decide({ proposal: { status: "declined", hotelMessage: long }, text: long, signal: done, onPaymentPage: true }).hotelMessage?.length, HOTEL_MESSAGE_MAX);
});

test("the model-free fallback finds a labelled reference and nothing looser", () => {
  // The mock's confirmation page as innerText gives it: a blank line between label and value.
  assert.deepEqual(fallbackProposal("You're booked, Maja\n\nBooking reference\n\nCH-616892\n\nTotal €400.00"), { status: "confirmed", reference: "CH-616892" });
  assert.deepEqual(fallbackProposal("Booking confirmed\nConfirmation number: 8841-AB"), { status: "confirmed", reference: "8841-AB" });
  assert.equal(fallbackProposal("Guarantee your booking\nTotal €400.00\nBooking reference will be sent by email").status, "unconfirmed", "no confirmation wording");
  assert.equal(fallbackProposal("Booking confirmed\nSee you in Lisbon").status, "unconfirmed", "no labelled reference");
  assert.equal(fallbackProposal("Your card was declined by your bank.").status, "unconfirmed");
});

test("silence and expiry are their own statuses", () => {
  assert.equal(decide({ proposal: { status: "unconfirmed" }, text: "Payment", signal: { kind: "deadline" }, onPaymentPage: true }).status, "timed_out");
  assert.equal(decide({ proposal: { status: "hold_expired" }, text: "Your hold has expired", signal: { kind: "deadline" }, onPaymentPage: true }).status, "hold_expired");
});
