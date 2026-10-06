// Estimates of a hotel's price in the traveller's own currency, made in code
// from the European Central Bank's euro reference rates. An estimate is never
// the price: the hotel's own figure is what the traveller agrees to and pays,
// and their bank's rate and fees decide the final amount. Every sentence that
// shows an estimate is made here, so no model converts or rounds anything.

import { readFileSync } from "node:fs";
import { currenciesOf } from "./currency.ts";

export const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const SNAPSHOT = new URL("./fx-snapshot.xml", import.meta.url);

/** Units of each currency per euro, on one date. */
export interface Rates {
  date: string;
  perEuro: Record<string, number>;
  /** "ECB" when fetched today, "snapshot" when read from the bundled file. */
  source: "ECB" | "snapshot";
}

/** Reads the ECB daily XML. Returns null when it holds no date or no rate. */
export function parseEcb(xml: string, source: Rates["source"] = "ECB"): Rates | null {
  const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
  const perEuro: Record<string, number> = { EUR: 1 };
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEuro[m[1]] = Number(m[2]);
  return date && Object.keys(perEuro).length > 1 ? { date, perEuro, source } : null;
}

let cached: { day: string; rates: Rates | null } | undefined;

/** Today's rates, fetched once per day per process; the bundled snapshot if the fetch fails; null if neither works. */
export async function loadRates(fetchText: (url: string) => Promise<string> = defaultFetch): Promise<Rates | null> {
  const day = new Date().toISOString().slice(0, 10);
  if (cached?.day === day) return cached.rates;
  let rates: Rates | null = null;
  try {
    rates = parseEcb(await fetchText(ECB_URL), "ECB");
  } catch {
    rates = null;
  }
  if (!rates) {
    try {
      rates = parseEcb(readFileSync(SNAPSHOT, "utf8"), "snapshot");
    } catch {
      rates = null;
    }
  }
  cached = { day, rates };
  return rates;
}

async function defaultFetch(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`ECB ${res.status}`);
  return res.text();
}

/** The one ISO code a written currency stands for, or null when it is ambiguous or unknown. */
export function isoOf(written: string | undefined): string | null {
  if (!written) return null;
  const all = currenciesOf(written);
  return all.length === 1 && /^[A-Z]{3}$/.test(all[0]) ? all[0] : null;
}

/** The amount in another currency, or null when either side has no rate. */
export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const f = isoOf(from);
  const t = isoOf(to);
  if (!f || !t || !rates.perEuro[f] || !rates.perEuro[t]) return null;
  return (amount / rates.perEuro[f]) * rates.perEuro[t];
}

const SUFFIX: Record<string, string> = { SEK: "kr", NOK: "kr", DKK: "kr", ISK: "kr" };
const SYMBOL: Record<string, string> = { EUR: "€", GBP: "£", USD: "US$" };

/** A whole-unit amount the way the traveller reads it: "7,450 kr", "€640". */
export function money(amount: number, currency: string): string {
  const n = Math.round(amount).toLocaleString("en-GB");
  const iso = isoOf(currency) ?? currency;
  if (SUFFIX[iso]) return `${n} ${SUFFIX[iso]}`;
  return SYMBOL[iso] ? `${SYMBOL[iso]}${n}` : `${iso} ${n}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const rateDay = (r: Rates) => `${Number(r.date.slice(8, 10))} ${MONTHS[Number(r.date.slice(5, 7)) - 1]}`;

/**
 * "≈ 7,450 kr (estimate at the ECB rate of 5 Oct; your bank's rate and fees
 * decide the final amount)". Null when no estimate can or need be made.
 * `atHotel` is for an amount paid later, at the rate of that day.
 */
export function estimateText(amount: number, from: string, to: string | undefined, rates: Rates | null, atHotel = false): string | null {
  if (!rates || !to || amount === 0 || isoOf(from) === isoOf(to)) return null;
  const value = convert(amount, from, to, rates);
  if (value === null) return null;
  const old = rates.source === "snapshot" ? ", the latest rate available here" : "";
  const when = atHotel ? "; you pay it at the hotel, at your bank's rate on that day" : "; your bank's rate and fees decide the final amount";
  return `≈ ${money(value, to)} (estimate at the ECB rate of ${rateDay(rates)}${old}${when})`;
}

/** Below this difference two prices are too close to call on an estimate. */
export const TOO_CLOSE = 0.03;

/** One sentence comparing prices that may be in different currencies, or null when they cannot be compared. */
export function compareText(options: { label: string; amount: number; currency: string }[], to: string | undefined, rates: Rates | null): string | null {
  if (options.length < 2) return null;
  const allSame = options.every((o) => isoOf(o.currency) && isoOf(o.currency) === isoOf(options[0].currency));
  const base = allSame ? options[0].currency : to;
  if (!base) return null;
  const valued = options.map((o) => ({ ...o, value: allSame ? o.amount : rates ? convert(o.amount, o.currency, base, rates) : null }));
  if (valued.some((o) => o.value === null)) return null;
  const sorted = [...valued].sort((a, b) => a.value! - b.value!);
  const [low, next] = sorted;
  const gap = (next.value! - low.value!) / next.value!;
  const basis = allSame ? "" : ` at the ECB rate of ${rateDay(rates!)} (an estimate; your bank's rate and fees decide the final amounts)`;
  if (gap < TOO_CLOSE) return `${low.label} and ${next.label} are too close to call${basis}: within ${Math.max(1, Math.round(gap * 100))}% of each other.`;
  return `${low.label} is about ${Math.round(gap * 100)}% cheaper than ${next.label}${basis}.`;
}
