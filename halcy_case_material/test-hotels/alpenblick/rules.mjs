// Inventory, prices and pure helpers for Gasthof Alpenblick. No I/O here.
export const HOTEL = 'Gasthof Alpenblick';
export const HOLD_MINUTES = Number(process.env.HOTEL3_HOLD_MINUTES || 12); // env override for testing only
export const KURTAXE = 4.5; // CHF per person per night, paid at the hotel
export const SERVICE = 15; // CHF per stay, optional
export const EUR_RATE = 1.07;
export const SPAR_DISCOUNT = 0.12;

export const ROOMS = [
  { id: 'einzel', name: 'Einzelzimmer', sleeps: 1, price: 120,
    desc: 'Ruhiges Zimmer zum Garten mit Einzelbett (90 × 200 cm), Schreibtisch und Dusche/WC. 14 m².' },
  { id: 'doppel', name: 'Doppelzimmer Seeblick', sleeps: 2, price: 180,
    desc: 'Helles Zimmer mit Blick auf den Thunersee, Doppelbett (160 × 200 cm), Sitzecke und Badewanne. 22 m².' },
  { id: 'familie', name: 'Familienzimmer', sleeps: 4, price: 260,
    desc: 'Zwei Schlafräume mit Doppelbett und zwei Einzelbetten, eigener Balkon mit Blick auf die Jungfrau. 34 m².' },
];

export const RATES = [
  { id: 'flex', name: 'Flexibel', factor: 1, payNow: false,
    desc: 'Kostenlose Stornierung bis 2 Tage vor Anreise. Bezahlung im Hotel, Ihre Karte dient nur als Garantie.' },
  { id: 'spar', name: 'Spartarif', factor: 1 - SPAR_DISCOUNT, payNow: true,
    desc: 'Rund 12 % günstiger. Der volle Betrag wird sofort belastet. Keine Stornierung, keine Rückerstattung.' },
];

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];

export const room = (id) => ROOMS.find((r) => r.id === id);
export const rate = (id) => RATES.find((r) => r.id === id);
const r2 = (n) => Math.round(n * 100) / 100;

export const chf = (n) => `CHF ${r2(n).toFixed(2)}`;
export const eur = (chfAmount) => `ca. EUR ${Math.round(chfAmount * EUR_RATE)}`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** The next 12 months, starting with the current one: [{ value: '2026-10', label: 'Oktober 2026' }]. */
export function monthOptions(now = new Date()) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ value, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

/** Validates the search. Returns { search } or { error } (German). */
export function parseSearch(q, now = new Date()) {
  const day = Number(q.tag), nights = Number(q.naechte), guests = Number(q.gaeste);
  const m = /^(\d{4})-(\d{2})$/.exec(q.monat || '');
  if (!m || !monthOptions(now).some((o) => o.value === q.monat)) return { error: 'Bitte wählen Sie einen Anreisemonat.' };
  if (!Number.isInteger(day) || day < 1 || day > 31) return { error: 'Bitte wählen Sie einen Anreisetag.' };
  if (!Number.isInteger(nights) || nights < 1 || nights > 14) return { error: 'Bitte wählen Sie 1 bis 14 Nächte.' };
  if (!Number.isInteger(guests) || guests < 1 || guests > 4) return { error: 'Bitte wählen Sie 1 bis 4 Gäste.' };
  const arrival = new Date(Number(m[1]), Number(m[2]) - 1, day);
  if (arrival.getDate() !== day) return { error: `Den ${day}. ${MONTHS[Number(m[2]) - 1]} gibt es nicht. Bitte wählen Sie ein gültiges Datum.` };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (arrival < today) return { error: 'Das Anreisedatum liegt in der Vergangenheit.' };
  const departure = new Date(arrival.getFullYear(), arrival.getMonth(), day + nights);
  return { search: { tag: day, monat: q.monat, naechte: nights, gaeste: guests, arrival, departure } };
}

export const fmtDate = (d) => `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const nightsLabel = (n) => (n === 1 ? '1 Nacht' : `${n} Nächte`);
export const guestsLabel = (n) => (n === 1 ? '1 Person' : `${n} Personen`);

/** Room price for the stay on a rate (CHF). */
export const roomTotal = (rm, rt, nights) => r2(rm.price * rt.factor * nights);

/** Full price breakdown. Spartarif: room + service now, Kurtaxe at the hotel. Flexibel: everything at the hotel. */
export function quote({ roomId, rateId, nights, guests, service }) {
  const rm = room(roomId), rt = rate(rateId);
  const roomPart = roomTotal(rm, rt, nights);
  const kurtaxe = r2(KURTAXE * guests * nights);
  const serviceFee = service ? SERVICE : 0;
  const total = r2(roomPart + kurtaxe + serviceFee);
  const dueNow = rt.payNow ? r2(roomPart + serviceFee) : 0;
  return { room: roomPart, kurtaxe, service: serviceFee, total, dueNow, dueAtHotel: r2(total - dueNow) };
}

/** Test cards only. 'approve' | 'decline' | null (rejected). */
export function cardOutcome(number) {
  const digits = String(number || '').replace(/[\s-]/g, '');
  if (digits === '4242424242424242') return 'approve';
  if (digits === '4000000000000002') return 'decline';
  return null;
}
export const last4 = (number) => String(number || '').replace(/\D/g, '').slice(-4);

/** MM/JJ, not in the past. */
export function validExpiry(s, now = new Date()) {
  const m = /^\s*(\d{2})\s*\/\s*(\d{2})\s*$/.exec(s || '');
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return false;
  const end = new Date(2000 + Number(m[2]), Number(m[1]), 1);
  return end > now;
}
export const validCvc = (s) => /^\d{3}$/.test(String(s || '').trim());

const clock = new Intl.DateTimeFormat('de-CH', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit' });
/** "Ihr Zimmer ist 12 Minuten für Sie reserviert (bis 21:47 Uhr)." Minutes left, rounded up. */
export function holdSentence(expiresAt, now = Date.now()) {
  const min = Math.max(1, Math.ceil((expiresAt - now) / 60000));
  const word = min === 1 ? '1 Minute' : `${min} Minuten`;
  return `Ihr Zimmer ist ${word} für Sie reserviert (bis ${clock.format(new Date(expiresAt))} Uhr).`;
}
