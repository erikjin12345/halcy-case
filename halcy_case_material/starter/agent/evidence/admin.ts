// The hotel's own booking record, read after a run by the developer's tools.
// The agent never reads /__admin; this is the independent record a trap check
// compares the run log with. Each mock hotel writes it differently, so one
// small adapter per shape turns it into the same few facts.

export interface AdminBooking {
  reference: string;
  room: string;
  rate: string;
  /** Add-ons the hotel recorded, true when booked: breakfast, marketing, insurance, service. */
  extras: Record<string, boolean>;
  payNow: number;
  payAtHotel: number;
  /** The hotel recorded a price change between search and booking. */
  priceChanged: boolean;
  /** Undefined when the hotel's record does not say. */
  termsAccepted?: boolean;
  createdAt?: string;
}

export interface AdminRecord {
  bookings: AdminBooking[];
  /** Cards the bank approved with no booking behind them, with when it happened. */
  chargedWithoutBooking: { at: string }[];
}

type Raw = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? NaN));
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Raw) : {});

/** Casa Halcy: { bookings: [{ reference, room, rate, breakfast, marketing, price: { payNow, payAtHotel }, priceChange, termsAccepted }], chargedWithoutBooking }. */
function casa(raw: Raw): AdminRecord {
  const bookings = (raw.bookings as Raw[]).map((b) => ({
    reference: String(b.reference),
    room: String(b.room),
    rate: String(b.rate),
    extras: { breakfast: b.breakfast === true, marketing: b.marketing === true },
    payNow: num(obj(b.price).payNow),
    payAtHotel: num(obj(b.price).payAtHotel),
    priceChanged: b.priceChange !== null && b.priceChange !== undefined,
    termsAccepted: typeof b.termsAccepted === "boolean" ? b.termsAccepted : undefined,
    createdAt: typeof b.createdAt === "string" ? b.createdAt : undefined,
  }));
  const cwb = ((raw.chargedWithoutBooking as Raw[]) ?? []).map((c) => ({ at: String(c.approvedAt ?? "") }));
  return { bookings, chargedWithoutBooking: cwb };
}

/** Villa Aurora: [{ ref, room, rate, insurance, breakfast, dueToday, dueAtHotel }]. Its form requires the terms box. */
function villa(raw: Raw[]): AdminRecord {
  return {
    bookings: raw.map((b) => ({
      reference: String(b.ref),
      room: String(b.room),
      rate: String(b.rate),
      extras: { insurance: num(b.insurance) > 0, breakfast: num(b.breakfast) > 0 },
      payNow: num(b.dueToday),
      payAtHotel: num(b.dueAtHotel),
      priceChanged: false,
      termsAccepted: true,
    })),
    chargedWithoutBooking: [],
  };
}

/** Gasthof Alpenblick: [{ ref, room, rate, serviceCharge, prices: { dueNow, dueAtHotel }, createdAt }]. Its form requires the terms box. */
function alpen(raw: Raw[]): AdminRecord {
  return {
    bookings: raw.map((b) => ({
      reference: String(b.ref),
      room: String(b.room),
      rate: String(b.rate),
      extras: { service: b.serviceCharge === true },
      payNow: num(obj(b.prices).dueNow),
      payAtHotel: num(obj(b.prices).dueAtHotel),
      priceChanged: false,
      termsAccepted: true,
      createdAt: typeof b.createdAt === "string" ? b.createdAt : undefined,
    })),
    chargedWithoutBooking: [],
  };
}

/** Picks the adapter by the record's shape. Null for a shape none of them knows. */
export function readAdmin(raw: unknown): AdminRecord | null {
  if (raw && typeof raw === "object" && Array.isArray((raw as Raw).bookings)) return casa(raw as Raw);
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { bookings: [], chargedWithoutBooking: [] };
    const first = obj(raw[0]);
    if (first.prices && typeof first.prices === "object") return alpen(raw as Raw[]);
    if ("dueToday" in first) return villa(raw as Raw[]);
  }
  return null;
}

/** The hotel's record, or null when it cannot be read (hotel down or restarted, unknown shape). */
export async function fetchAdmin(origin: string): Promise<AdminRecord | null> {
  try {
    const res = await fetch(`${origin}/__admin/bookings`, { signal: AbortSignal.timeout(3000) });
    return res.ok ? readAdmin(await res.json()) : null;
  } catch {
    return null;
  }
}
