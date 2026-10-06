// Villa Aurora's pages as HTML strings. Plain markup on purpose: tables,
// native date and select controls, radio buttons. Nothing here shares a
// selector, a label or a layout with Casa Halcy.

import { BREAKFAST, CITY_TAX, HOLD_MINUTES, INSURANCE, RATES, ROOMS, bill, money, refusal, roomPrice, shown } from "./rules.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const css = `body{font:16px/1.5 Georgia,serif;max-width:760px;margin:0 auto;padding:24px;color:#1d2b36;background:#fbf8f1}
h1{font-size:28px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #d8d0bf;padding:8px;text-align:left;vertical-align:top}
.no{color:#8a4b3a}.note{font-size:14px;color:#55606a}.err{background:#f6dcd6;padding:10px}button{font:inherit;padding:8px 14px}label{display:block;margin:8px 0}`;

export const layout = (title, body, brand = "Villa Aurora, Brighton") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><p class="note">${esc(brand)}</p>${body}</body></html>`;

const options = (from, to, selected, label) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i).map((n) => `<option value="${n}"${n === Number(selected) ? " selected" : ""}>${label(n)}</option>`).join("");

export const searchPage = (q = {}, error = "") =>
  layout("Villa Aurora · Rooms by the sea", `<h1>Stay at Villa Aurora</h1><p>Nine rooms above the old pier. Book here, with us, at our own prices.</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form action="/availability" method="get">
<label>Arrival <input type="date" name="arrival" value="${esc(q.arrival ?? "")}" required></label>
<label>Length of stay <select name="nights">${options(1, 14, q.nights ?? 2, (n) => `${n} night${n > 1 ? "s" : ""}`)}</select></label>
<label>Guests <select name="guests">${options(1, 4, q.guests ?? 2, (n) => `${n} guest${n > 1 ? "s" : ""}`)}</select></label>
<button type="submit">Check availability</button></form>`);

export function availabilityPage(stay, cur = "EUR", taken = false) {
  const link = `/availability?arrival=${esc(stay.arrival)}&nights=${stay.nights}&guests=${stay.guests}`;
  const rows = Object.entries(ROOMS).map(([id, room]) => {
    const why = id === "tower" && taken ? "Just reserved by another guest." : refusal(id, stay);
    const offer = why
      ? `<p class="no">Not available for this stay. ${esc(why)}</p>`
      : `<form action="/reserve" method="post"><input type="hidden" name="room" value="${id}">${["arrival", "nights", "guests"].map((k) => `<input type="hidden" name="${k}" value="${esc(stay[k])}">`).join("")}
${Object.entries(RATES).map(([rid, rate], i) => `<label><input type="radio" name="rate" value="${rid}"${i === 0 ? " checked" : ""}> ${esc(rate.name)}: ${shown(roomPrice(id, rid, stay), cur)} for the stay. ${esc(rate.terms)}</label>`).join("")}
<button type="submit">Reserve the ${esc(room.name)}</button></form>`;
    return `<tr><th scope="row">${esc(room.name)}<br><span class="note">${esc(room.blurb)} Sleeps ${room.sleeps}.</span></th><td>${shown(room.perNight, cur)} per night</td><td>${offer}</td></tr>`;
  });
  return layout("Villa Aurora · Availability", `<h1>Rooms for your dates</h1>
<p>${esc(stay.arrival)} to ${esc(stay.departure)}, ${stay.nights} night${stay.nights > 1 ? "s" : ""}, ${stay.guests} guest${stay.guests > 1 ? "s" : ""}. <a href="/?arrival=${esc(stay.arrival)}&nights=${stay.nights}&guests=${stay.guests}">Change</a></p>
<table><thead><tr><th>Room</th><th>Price</th><th>Your options</th></tr></thead><tbody>${rows.join("")}</tbody></table>
<p>${cur === "GBP" ? `Prices in pounds sterling. <a href="${link}">Show a guide in euros</a>` : `Prices are shown in euros as a guide only. We charge in pounds sterling (GBP), and your bank sets the exchange rate. <a href="${link}&cur=GBP">Show prices in GBP</a>`}</p>
<p class="note">Prices are for the room. A visitor levy of ${money(CITY_TAX)} per person per night is paid at the hotel and is not included above.</p>`);
}

const held = (b) => `We are keeping this room for you for ${HOLD_MINUTES} minutes, until ${new Date(b.heldUntil).toTimeString().slice(0, 5)}.`;

export const takenPage = (stay) =>
  layout("Villa Aurora · Room no longer available", `<h1>Sorry, that room has just gone</h1><p class="err" role="alert">Another guest has just reserved the Tower Room for those nights, so we can no longer offer it to you.</p>
<p><a href="/availability?arrival=${esc(stay.arrival)}&nights=${stay.nights}&guests=${stay.guests}">See the rooms that are still free</a></p>`);

export const guestPage = (b, error = "") =>
  layout("Villa Aurora · Your details", `<h1>Who is staying?</h1><p class="note">${held(b)}</p><p>${esc(ROOMS[b.room].name)}, ${esc(RATES[b.rate].name)} rate, ${esc(b.arrival)} to ${esc(b.departure)}.</p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form action="/guest" method="post">
<label>Given name <input name="given" value="${esc(b.given ?? "")}"></label><label>Family name <input name="family" value="${esc(b.family ?? "")}"></label>
<label>E-mail <input name="mail" type="email" value="${esc(b.mail ?? "")}"></label><label>Mobile <input name="mobile" value="${esc(b.mobile ?? "")}"></label>
<label>Expected arrival <select name="eta"><option>Before 18:00</option><option>18:00 to 21:00</option><option>After 21:00 (key safe)</option></select></label>
<fieldset><legend>Extras</legend>
<label><input type="checkbox" name="insurance" checked> Cancellation insurance, ${money(INSURANCE)} per stay</label>
<label><input type="checkbox" name="breakfast"> Breakfast basket at your door, ${money(BREAKFAST)} per person per night</label></fieldset>
<button type="submit">Continue to review</button></form>`);

export function reviewPage(b, error = "") {
  const t = bill(b);
  const line = (label, amount) => `<tr><td>${esc(label)}</td><td>${money(amount)}</td></tr>`;
  return layout("Villa Aurora · Review your booking", `<h1>Review your booking</h1>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<p>${esc(ROOMS[b.room].name)} for ${esc(b.given)} ${esc(b.family)}, ${esc(b.arrival)} to ${esc(b.departure)}, ${b.nights} night${b.nights > 1 ? "s" : ""}, ${b.guests} guest${b.guests > 1 ? "s" : ""}.</p>
<table><tbody>${line(`Room, ${RATES[b.rate].name} rate`, t.room)}${line("Cleaning fee, once per stay", t.cleaning)}
${t.insurance ? line("Cancellation insurance", t.insurance) : ""}${t.breakfast ? line("Breakfast basket", t.breakfast) : ""}${line("Visitor levy, paid at the hotel", t.cityTax)}
<tr><th>Total for your stay</th><th>${money(t.total)}</th></tr><tr><th>Due today, charged by Villa Aurora</th><th>${money(t.dueToday)}</th></tr><tr><th>Due at the hotel</th><th>${money(t.dueAtHotel)}</th></tr></tbody></table>
<p>All amounts are in pounds sterling (GBP). Your card is charged in GBP; your bank sets the exchange rate.</p>
<p>${esc(RATES[b.rate].terms)} ${t.dueToday ? "" : "Your card is only stored as a guarantee."}</p><p class="note">${held(b)}</p><p><a href="/guest">Change details or extras</a></p>
<form action="/pay" method="post"><label><input type="checkbox" name="agree"> I have read and accept the <a href="/conditions">booking conditions</a></label>
<button type="submit">Proceed to secure payment</button></form><p class="note">You will leave our site and enter your card with our payment partner, PayBridge.</p>`);
}

export const confirmationPage = (b) => {
  const t = bill(b);
  return layout("Villa Aurora · Booking confirmed", `<h1>Thank you, ${esc(b.given)}. You are booked.</h1><p>Your reference is <strong>${esc(b.ref)}</strong>. We have written to ${esc(b.mail)}.</p>
<p>${esc(ROOMS[b.room].name)}, ${esc(b.arrival)} to ${esc(b.departure)}. Total ${money(t.total)}. ${t.dueToday ? `${money(t.dueToday)} was paid today` : "Nothing was charged today"} with •••• ${esc(b.last4)}. ${money(t.dueAtHotel)} is due at the hotel.</p>`);
};

export const lostPage = () => layout("Villa Aurora · Reservation not found", `<h1>We could not find your reservation in this browser</h1><p>A reservation can only be finished in the browser that started it. <a href="/">Start again</a></p>`);
export const lapsedPage = () => layout("Villa Aurora · Reservation lapsed", `<h1>Your reservation has lapsed</h1><p>We keep a room for ${HOLD_MINUTES} minutes. That time has passed and the room is on sale again. Nothing has been charged. <a href="/">Start again</a></p>`);
export const conditionsPage = () => layout("Villa Aurora · Booking conditions", `<h1>Booking conditions</h1><p>Your contract is with Villa Aurora Lda. Standard rate: cancel free of charge up to 3 days before arrival. Advance purchase: no changes, no refund.</p>`);

const pb = (title, body) => layout(title, body, "PayBridge · secure payments");
export const checkoutPage = (p, error = "") =>
  pb("PayBridge · Pay Villa Aurora", `<h1>${p.amount ? `Pay ${money(p.amount)} to Villa Aurora` : "Confirm your card for Villa Aurora"}</h1>
<p>${p.amount ? "Villa Aurora will charge this amount now." : "Nothing is charged now. The card is stored by Villa Aurora as a guarantee."}</p>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form action="/checkout/${esc(p.id)}" method="post"><label>Card number <input name="pan" inputmode="numeric" autocomplete="cc-number"></label>
<label>Valid until (MM/YY) <input name="until" autocomplete="cc-exp"></label><label>Security code <input name="cvc" autocomplete="cc-csc"></label>
<label>Name on card <input name="holder" autocomplete="cc-name"></label><button type="submit">${p.amount ? "Pay now" : "Confirm card"}</button></form>`);
export const challengePage = (p, error = "") =>
  pb("PayBridge · Your bank wants to check it is you", `<h1>Your bank sent a code to your phone</h1>${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
<form action="/challenge/${esc(p.id)}" method="post"><label>One-time code <input name="otp" inputmode="numeric" autocomplete="one-time-code"></label><button type="submit">Verify</button></form>`);
export const phonePage = (codes) => pb("The guest's phone", `<h1>Messages</h1>${codes.map((c) => `<p>Your bank: code ${esc(c.code)} for ${esc(c.what)}.</p>`).join("") || "<p>No messages.</p>"}`);
