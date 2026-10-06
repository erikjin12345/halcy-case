// Gasthof Alpenblick (hotel, port 4600) and ZahlBar (payment provider, port 4601). State in memory.
import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import * as R from './rules.mjs';
import * as P from './pages.mjs';
import * as B from './pages-booking.mjs';
import { html, json, redirect, readForm, cookies } from './http.mjs';
import { createPayment, providerHandler, payments, phone, PAY_PORT } from './provider.mjs';

const PORT = Number(process.env.HOTEL3_PORT || 4600);
const COOKIE = 'ab_sitzung';
const reservations = new Map();
const bookings = [];
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isExpired = (r) => !r.booking && Date.now() > r.expiresAt;

function newRef() {
  let ref;
  do ref = `AB-${randomInt(10000, 100000)}`; while (bookings.some((b) => b.ref === ref));
  return ref;
}

/** Payment result from ZahlBar. Books the room if approved while the hold is still valid. */
function onResult(p) {
  const r = reservations.get(p.resId);
  if (!r || r.payment?.id !== p.id) return;
  r.payment.status = p.status;
  if (p.status !== 'approved' || isExpired(r)) return;
  const q = R.quote({ roomId: r.roomId, rateId: r.rateId, nights: r.naechte, guests: r.gaeste, service: r.service });
  r.booking = { ref: newRef(), last4: p.last4 };
  bookings.push({ ref: r.booking.ref, hotel: R.HOTEL, room: R.room(r.roomId).name, rate: R.rate(r.rateId).name,
    arrival: isoDate(r.arrival), departure: isoDate(r.departure), nights: r.naechte, guests: r.gaeste,
    guest: r.guest, serviceCharge: r.service, currency: 'CHF', prices: q,
    card: { last4: p.last4, charged: R.rate(r.rateId).payNow }, createdAt: new Date().toISOString() });
}

/** The reservation named by ?r=, only if it belongs to this browser's session cookie. */
function load(req, url) {
  const r = reservations.get(url.searchParams.get('r'));
  return r && r.sid === cookies(req)[COOKIE] ? r : null;
}

function validateGuest(f) {
  const e = [];
  if (!f.vorname?.trim()) e.push('Bitte geben Sie Ihren Vornamen ein.');
  if (!f.nachname?.trim()) e.push('Bitte geben Sie Ihren Nachnamen ein.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email?.trim() || '')) e.push('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
  if ((f.telefon || '').replace(/\D/g, '').length < 6) e.push('Bitte geben Sie eine gültige Telefonnummer ein.');
  return e;
}

function validateCard(f) {
  if (f.agb !== '1') return 'Bitte akzeptieren Sie die Buchungsbedingungen.';
  if (!f.inhaber?.trim()) return 'Bitte geben Sie den Namen des Karteninhabers ein.';
  if (!R.cardOutcome(f.karte)) return 'Diese Kartennummer wird nicht akzeptiert. Bitte prüfen Sie die Eingabe oder verwenden Sie eine andere Karte.';
  if (!R.validExpiry(f.ablauf)) return 'Das Ablaufdatum ist ungültig. Bitte geben Sie es im Format MM/JJ ein.';
  if (!R.validCvc(f.cvc)) return 'Die Prüfnummer (CVC) muss aus drei Ziffern bestehen.';
  return '';
}

async function hotel(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname, post = req.method === 'POST';
  const wantsJson = (req.headers.accept || '').includes('application/json');
  if (path === '/') return html(res, P.home(new Date()));
  if (path === '/bedingungen') return html(res, P.conditions());
  if (path === '/anfahrt') return html(res, P.directions());
  if (path === '/zimmer') {
    const q = Object.fromEntries(url.searchParams);
    const { search, error } = R.parseSearch(q);
    return error ? html(res, P.searchError(error, q), 400) : html(res, P.roomList(search, new Date()));
  }
  if (path === '/reservieren' && post) {
    const f = await readForm(req);
    const { search, error } = R.parseSearch(f);
    const rm = R.room(f.zimmer), rt = R.rate(f.tarif);
    if (error) return html(res, P.searchError(error, f), 400);
    if (!rm || !rt) return html(res, P.searchError('Bitte wählen Sie ein Zimmer und einen Tarif.', f), 400);
    if (rm.sleeps < search.gaeste) return html(res, P.searchError(`Das ${rm.name} ist für ${R.guestsLabel(search.gaeste)} zu klein.`, f), 400);
    const sid = cookies(req)[COOKIE] || randomUUID();
    const id = randomUUID().slice(0, 12);
    reservations.set(id, { id, sid, roomId: rm.id, rateId: rt.id, ...search, service: true, guest: null, payment: null,
      booking: null, expiresAt: Date.now() + R.HOLD_MINUTES * 60000 });
    return redirect(res, `/angaben?r=${id}`, { 'Set-Cookie': `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax` });
  }
  if (path === '/__admin/bookings') return json(res, bookings);
  if (path === '/__admin/reset' && post) {
    reservations.clear(); bookings.length = 0; payments.clear(); phone.length = 0;
    return json(res, { ok: true });
  }
  if (!['/angaben', '/zahlung', '/zahlung/karte', '/zahlung/status', '/bestaetigung'].includes(path)) return html(res, P.page404(), 404);

  const r = load(req, url);
  if (path === '/zahlung/status') {
    const status = !r ? 'notfound' : r.booking ? 'approved' : isExpired(r) ? 'expired' : r.payment?.status || 'none';
    return json(res, { status });
  }
  if (!r) return wantsJson ? json(res, { ok: false, reload: true }, 404) : html(res, P.notFound(), 404);
  if (isExpired(r)) return wantsJson ? json(res, { ok: false, reload: true }, 410) : html(res, P.expired(), 410);
  const at = (p) => `${p}?r=${r.id}`;
  if (r.booking && path !== '/bestaetigung') return redirect(res, at('/bestaetigung'));

  if (path === '/angaben' && post) {
    const f = await readForm(req);
    const errors = validateGuest(f);
    r.service = f.service === '1';
    const guest = { vorname: f.vorname?.trim(), nachname: f.nachname?.trim(), email: f.email?.trim(), telefon: f.telefon?.trim(), wuensche: f.wuensche?.trim() || '' };
    if (errors.length) return html(res, B.details(r, errors, guest), 400);
    r.guest = guest;
    return redirect(res, at('/zahlung'));
  }
  if (path === '/angaben') return html(res, B.details(r));
  if (!r.guest) return redirect(res, at('/angaben'));
  if (path === '/zahlung') return html(res, B.payment(r));
  if (path === '/zahlung/karte' && post) {
    const f = await readForm(req);
    const error = r.payment?.status === 'pending' ? 'Ihre Zahlung wird bereits von Ihrer Bank geprüft.' : validateCard(f);
    if (error) return wantsJson ? json(res, { ok: false, error }, 400) : html(res, B.payment(r, error), 400);
    const q = R.quote({ roomId: r.roomId, rateId: r.rateId, nights: r.naechte, guests: r.gaeste, service: r.service });
    const rt = R.rate(r.rateId);
    const last4 = R.last4(f.karte);
    const p = createPayment({ resId: r.id, last4, outcome: R.cardOutcome(f.karte), amount: q.dueNow, payNow: rt.payNow, merchant: R.HOTEL, onResult });
    r.payment = { id: p.id, status: 'pending', verifyUrl: p.verifyUrl, last4 };
    return wantsJson ? json(res, { ok: true, verifyUrl: p.verifyUrl, statusUrl: at('/zahlung/status') }) : redirect(res, at('/zahlung'));
  }
  if (path === '/bestaetigung') return r.booking ? html(res, B.confirmation(r)) : redirect(res, at('/zahlung'));
  return html(res, P.page404(), 404);
}

const guard = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  if (!res.headersSent) html(res, P.layout('Fehler', '<h1>Ein Fehler ist aufgetreten</h1><p>Bitte versuchen Sie es erneut.</p>'), 500);
});
createServer(guard(hotel)).listen(PORT, '127.0.0.1', () => console.log(`${R.HOTEL}: http://localhost:${PORT}`));
createServer(guard(providerHandler)).listen(PAY_PORT, '127.0.0.1', () => console.log(`ZahlBar: http://localhost:${PAY_PORT} (Telefon: http://localhost:${PAY_PORT}/__phone)`));
