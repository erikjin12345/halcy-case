// Villa Aurora: a second mock hotel, for running the agent on a site it has
// not seen. Zero dependencies. Run with `npm run hotel2`.
//
//   http://localhost:4500   Villa Aurora's own booking site
//   http://localhost:4501   PayBridge, its payment provider. The whole tab is
//                           sent there to pay and comes back afterwards.
//   http://localhost:4501/__phone            the guest's phone (bank codes)
//   http://localhost:4500/__admin/bookings   confirmed bookings, for checking
//
// How it differs from Casa Halcy is listed in README.md. State is in memory.
// Test cards are the same: 4242 4242 4242 4242 pays, 4000 0000 0000 0002 is
// declined. Never type a real card here.

import http from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import * as page from "./pages.mjs";
import { HOLD_MINUTES, RATES, ROOMS, bill, parseStay, refusal, takenOnReserve } from "./rules.mjs";

const HOTEL_PORT = Number(process.env.HOTEL2_PORT ?? 4500);
const PAY_PORT = Number(process.env.PAY2_PORT ?? 4501);
const HOTEL = `http://localhost:${HOTEL_PORT}`;
const PAY = `http://localhost:${PAY_PORT}`;
const COOKIE = "va_sid";

const bookings = new Map(); // session id -> booking in progress
const confirmed = [];
const payments = new Map(); // payment id -> { id, sid, amount, status, code, last4, tries }
const phone = [];
const taken = new Set(); // "arrival|nights" for which the Tower Room has gone

const id = (n = 8) => randomBytes(n).toString("hex");
const html = (res, body, status = 200, headers = {}) => res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers }).end(body);
const go = (res, to, headers = {}) => res.writeHead(303, { location: to, ...headers }).end();
const sessionOf = (req) => (req.headers.cookie ?? "").split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === COOKIE)?.[1];

async function form(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return Object.fromEntries(new URLSearchParams(raw));
}

const hotel = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", HOTEL);
  const q = Object.fromEntries(url.searchParams);
  const route = `${req.method} ${url.pathname}`;
  const b = bookings.get(sessionOf(req));

  if (route === "GET /") return html(res, page.searchPage(q));
  if (route === "GET /conditions") return html(res, page.conditionsPage());
  if (route === "GET /__admin/bookings") return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(confirmed, null, 2));
  if (route === "GET /availability") {
    const stay = parseStay(q);
    if (stay.error) return html(res, page.searchPage(q, stay.error), 400);
    return html(res, page.availabilityPage(stay, q.cur === "GBP" ? "GBP" : "EUR", taken.has(`${stay.arrival}|${stay.nights}`)));
  }
  if (route === "POST /reserve") {
    const f = await form(req);
    const stay = parseStay(f);
    if (stay.error || !RATES[f.rate] || refusal(f.room, stay)) return go(res, "/");
    const key = `${stay.arrival}|${stay.nights}`;
    if (f.room === "tower" && (taken.has(key) || takenOnReserve(f.room, stay))) {
      taken.add(key);
      return html(res, page.takenPage(stay), 409);
    }
    const sid = id();
    bookings.set(sid, { ...stay, room: f.room, rate: f.rate, insurance: true, breakfast: false, heldUntil: Date.now() + HOLD_MINUTES * 60_000 });
    return go(res, "/guest", { "set-cookie": `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax` });
  }
  if (!b) return html(res, page.lostPage(), 404);
  if (!b.ref && Date.now() > b.heldUntil) return html(res, page.lapsedPage(), 410);

  if (route === "GET /guest") return html(res, page.guestPage(b));
  if (route === "POST /guest") {
    const f = await form(req);
    Object.assign(b, { given: f.given?.trim(), family: f.family?.trim(), mail: f.mail?.trim(), mobile: f.mobile?.trim(), eta: f.eta, insurance: f.insurance === "on", breakfast: f.breakfast === "on" });
    if (!b.given || !b.family || !/.+@.+/.test(b.mail ?? "")) return html(res, page.guestPage(b, "Please give your names and an e-mail address."), 400);
    return go(res, "/review");
  }
  if (!b.given) return go(res, "/guest");
  if (route === "GET /review") return html(res, page.reviewPage(b, q.declined ? "Your card was declined by your bank. Nothing has been charged. You can try another card." : ""));
  if (route === "POST /pay") {
    const f = await form(req);
    if (f.agree !== "on") return html(res, page.reviewPage(b, "Please accept the booking conditions to continue."), 400);
    const p = { id: id(), sid: sessionOf(req), amount: bill(b).dueToday, status: "open", tries: 0 };
    payments.set(p.id, p);
    return go(res, `${PAY}/checkout/${p.id}`);
  }
  if (route === "GET /done") {
    const p = payments.get(q.p);
    if (!p || p.sid !== sessionOf(req) || p.status !== "paid") return go(res, "/review");
    if (!b.ref) {
      Object.assign(b, { ref: `VA-${randomInt(10000, 99999)}`, last4: p.last4 });
      confirmed.push({ ...b, ...bill(b), room: ROOMS[b.room].name, rate: RATES[b.rate].name });
    }
    return html(res, page.confirmationPage(b));
  }
  return html(res, page.lostPage(), 404);
});

const pay = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", PAY);
  if (req.method === "GET" && url.pathname === "/__phone") return html(res, page.phonePage(phone));
  const [, step, pid] = url.pathname.split("/");
  const p = payments.get(pid);
  if (!p || (step !== "checkout" && step !== "challenge")) return html(res, "<h1>PayBridge</h1><p>No such payment.</p>", 404);
  if (req.method === "GET") return html(res, step === "checkout" ? page.checkoutPage(p) : page.challengePage(p));

  const f = await form(req);
  if (step === "checkout") {
    const pan = (f.pan ?? "").replace(/\D/g, "");
    if (pan !== "4242424242424242" && pan !== "4000000000000002") return html(res, page.checkoutPage(p, "We only accept the two test cards."), 400);
    Object.assign(p, { pan, last4: pan.slice(-4), code: String(randomInt(100000, 999999)) });
    phone.unshift({ code: p.code, what: p.amount ? `a payment of GBP ${p.amount.toFixed(2)} to Villa Aurora` : "a card check by Villa Aurora" });
    console.log(`Bank code for ${p.id}: ${p.code}`);
    return go(res, `/challenge/${p.id}`);
  }
  if (f.otp?.trim() !== p.code) {
    if (++p.tries >= 3) return go(res, `${HOTEL}/review?declined=1`);
    return html(res, page.challengePage(p, "That code is not right. Try again."), 400);
  }
  if (p.pan === "4000000000000002") return go(res, `${HOTEL}/review?declined=1`);
  p.status = "paid";
  return go(res, `${HOTEL}/done?p=${p.id}`);
});

hotel.listen(HOTEL_PORT, "127.0.0.1", () => console.log(`Villa Aurora   ${HOTEL}`));
pay.listen(PAY_PORT, "127.0.0.1", () => console.log(`PayBridge      ${PAY}   (phone: ${PAY}/__phone)`));
