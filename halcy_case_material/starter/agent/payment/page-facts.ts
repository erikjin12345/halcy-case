// Facts read from the hotel's page by code, with no model in between: how
// long the hold has left, and whether the amounts the traveller agreed to are
// still on the page. Patterns only, nothing specific to one hotel.

import type { Observation } from "../../browser.ts";

/** All text from frames that were read. Frames outside the hotel's site are empty already. */
export function pageText(seen: Observation): string {
  return seen.text
    .map((f) => f.text)
    .filter(Boolean)
    .join("\n");
}

const HOLD_WORDS = /hold|held|reserv|expire|remaining|time left|minutes left/i;
const CLOCK = /\b(\d{1,2}):([0-5]\d)\b/;

/** Seconds left on a hold timer, if a line that talks about a hold shows a mm:ss clock. */
export function holdSecondsFrom(text: string): number | undefined {
  for (const line of text.split("\n")) {
    if (!HOLD_WORDS.test(line)) continue;
    const m = line.match(CLOCK);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return undefined;
}

const GONE = /expired|released|timed out|no longer (held|available|reserved)/i;

/** The hotel's own line saying the hold or session is gone, if the page has one. */
export function holdExpiredLine(text: string): string | undefined {
  return text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => (HOLD_WORDS.test(line) || /session|room/i.test(line)) && GONE.test(line) && !CLOCK.test(line));
}

/** "1,234.56", "1.234,56", "358,00", "358" -> a number. Undefined if it is not money-shaped. */
export function parseMoney(token: string): number | undefined {
  const s = token.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return undefined;
  const lastSep = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  if (lastSep === -1) return Number(s);
  const decimals = s.length - lastSep - 1;
  const hasBoth = s.includes(",") && s.includes(".");
  const isDecimal = hasBoth || decimals !== 3;
  const whole = (isDecimal ? s.slice(0, lastSep) : s).replace(/[.,]/g, "");
  const n = Number(isDecimal ? `${whole}.${s.slice(lastSep + 1)}` : whole);
  return Number.isFinite(n) ? n : undefined;
}

/** Every number on the page that could be an amount. */
export function amountsIn(text: string): number[] {
  return [...text.matchAll(/\d[\d.,]*\d|\d/g)].map((m) => parseMoney(m[0])).filter((n): n is number => n !== undefined);
}

/** The values that the page no longer shows. Empty means every amount is still there. */
export function missingAmounts(text: string, values: (string | number | undefined)[]): (string | number)[] {
  const onPage = amountsIn(text);
  return values.filter((v): v is string | number => {
    if (v === undefined) return false;
    const want = typeof v === "number" ? v : parseMoney(v);
    if (want === undefined) return false;
    return !onPage.some((n) => Math.abs(n - want) < 0.005);
  });
}

const MONEY = /(?:[€$£¥]|\b[A-Z]{3}\b)\s?\d[\d.,]*\d|(?:[€$£¥]|\b[A-Z]{3}\b)\s?\d|\d[\d.,]*\s?(?:[€$£¥]|\b[A-Z]{3}\b)/g;

/** The amount as the hotel's page writes it, currency included ("€420.00" for 420). Undefined if the page has no such figure. */
export function shownAs(text: string, value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const want = typeof value === "number" ? value : parseMoney(value);
  if (want === undefined) return undefined;
  return text.match(MONEY)?.find((token) => {
    const n = parseMoney(token);
    return n !== undefined && Math.abs(n - want) < 0.005;
  });
}

/** The first money figure on a line that starts with `label`, as written. Undefined if no line starts that way. */
export function figureLabelled(text: string, label: RegExp): string | undefined {
  for (const line of text.split("\n")) {
    if (!label.test(line.trim())) continue;
    const figure = line.match(MONEY)?.[0];
    if (figure) return figure;
  }
  return undefined;
}

/** True if `quote` appears on the page, ignoring differences in whitespace. */
export function appearsOnPage(text: string, quote: string): boolean {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return quote.trim().length > 0 && squash(text).includes(squash(quote));
}
