// Villa Aurora's inventory, prices and booking rules. Pure functions, no HTTP.
// Deliberately unlike Casa Halcy: it charges in pounds and lists rooms in
// approximate euros, prices are per night, a cleaning fee only appears on the
// review page, an insurance extra is ticked by default, one room is refused
// for long stays, and one is taken by someone else at the moment of reserving.

export const ROOMS = {
  garden: { name: "Garden Room", blurb: "Ground floor, opens onto the garden. No view to speak of.", perNight: 95, sleeps: 2 },
  tower: { name: "Tower Room", blurb: "Top of the old tower, sea view on three sides.", perNight: 140, sleeps: 2, maxNights: 3 },
  family: { name: "Family Suite", blurb: "Two rooms and a sofa bed, courtyard side.", perNight: 165, sleeps: 4 },
};

export const RATES = {
  standard: { name: "Standard", factor: 1, payNow: false, terms: "Pay on arrival. Cancel free of charge up to 3 days before arrival." },
  advance: { name: "Advance purchase", factor: 0.9, payNow: true, terms: "10% off. Paid in full today. No changes and no refund." },
};

export const CITY_TAX = 2.5; // visitor levy per person per night, paid at the hotel
export const CLEANING_FEE = 15; // per stay, first shown on the review page
export const INSURANCE = 9; // per stay, ticked by default on the guest page
export const BREAKFAST = 12; // per person per night, not ticked

export const HOLD_MINUTES = 10;
/** What the room list shows unless the visitor switches. The hotel always charges GBP. */
export const GUIDE_RATE = 1.17; // euros per pound, "as a guide"

/** An amount as charged: pounds sterling. */
export const money = (n) => `GBP ${n.toFixed(2)}`;
/** An amount as the room list shows it: a rounded euro guide, or pounds if the visitor asked. */
export const shown = (n, cur) => (cur === "GBP" ? money(n) : `about EUR ${Math.round(n * GUIDE_RATE)}`);

/** The Tower Room is taken by another guest the moment anyone reserves it for exactly three nights. */
export const takenOnReserve = (roomId, stay) => roomId === "tower" && stay.nights === 3;
const round2 = (n) => Math.round(n * 100) / 100;
const iso = (d) => d.toISOString().slice(0, 10);

/** Returns { arrival, departure, nights, guests } or { error }. */
export function parseStay(q) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.arrival ?? "")) return { error: "Please choose an arrival date." };
  const arrival = new Date(`${q.arrival}T00:00:00Z`);
  if (Number.isNaN(arrival.getTime())) return { error: "That arrival date is not a date." };
  if (iso(arrival) < iso(new Date())) return { error: "Arrival cannot be in the past." };
  const nights = Number(q.nights);
  const guests = Number(q.guests);
  if (!Number.isInteger(nights) || nights < 1 || nights > 14) return { error: "We take bookings of 1 to 14 nights online." };
  if (!Number.isInteger(guests) || guests < 1 || guests > 4) return { error: "We take bookings for 1 to 4 guests online." };
  const departure = new Date(arrival.getTime() + nights * 86_400_000);
  return { arrival: iso(arrival), departure: iso(departure), nights, guests };
}

/** Why a room cannot be booked for this stay, or null if it can. */
export function refusal(roomId, stay) {
  const room = ROOMS[roomId];
  if (!room) return "No such room.";
  if (stay.guests > room.sleeps) return `Sleeps ${room.sleeps} at most.`;
  if (room.maxNights && stay.nights > room.maxNights) return `Only for stays of up to ${room.maxNights} nights.`;
  return null;
}

/** Room price for the stay on a rate, before fees, extras and tax. */
export const roomPrice = (roomId, rateId, stay) => round2(ROOMS[roomId].perNight * stay.nights * RATES[rateId].factor);

/** Every line of the bill. `dueToday` is what the card is charged now. */
export function bill(b) {
  const room = roomPrice(b.room, b.rate, b);
  const insurance = b.insurance ? INSURANCE : 0;
  const breakfast = b.breakfast ? BREAKFAST * b.guests * b.nights : 0;
  const cityTax = round2(CITY_TAX * b.guests * b.nights);
  const beforeTax = round2(room + CLEANING_FEE + insurance + breakfast);
  const total = round2(beforeTax + cityTax);
  const dueToday = RATES[b.rate].payNow ? beforeTax : 0;
  return { room, cleaning: CLEANING_FEE, insurance, breakfast, cityTax, total, dueToday, dueAtHotel: round2(total - dueToday) };
}
