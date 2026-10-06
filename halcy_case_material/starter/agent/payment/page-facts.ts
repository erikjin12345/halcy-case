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

/** A line that says the room is being held. Only such a line may give the hold's length or its end time. */
const HOLD_VERB = /\b(hold|holding|held|keeping|kept|set aside)\b|reserved (for|until)/i;
/** A line with a running timer. Enough for a countdown, not for a time of day (cancellation deadlines look like that). */
const TIMER_WORDS = /expire|remaining|time left|minutes? left/i;
const HOLD_WORDS = new RegExp(`${HOLD_VERB.source}|${TIMER_WORDS.source}|reserv`, "i");
const CLOCK = /\b(\d{1,2}):([0-5]\d)\b/;
/** A time of day the hold runs to: "until 15:47", "by 3.47 pm". */
const UNTIL = /\b(?:until|till|by|before)\s+(\d{1,2})[:.]([0-5]\d)\s*(am|pm)?/i;
const IN_WORDS = /\b(\d{1,3})\s*(?:minutes?|mins?)\b/i;
const GONE = /expired|released|timed out|lapsed|no longer (held|available|reserved)/i;

export interface HoldReading {
  /** Time left, when the page gives a countdown or a time of day we can trust. */
  secondsLeft?: number;
  /** "for 10 minutes": the whole length of the hold. An upper bound, since we do not know when it began. */
  atMostSeconds?: number;
  /** The page talks about holding the room, whether or not it says for how long. */
  mentioned: boolean;
}

function secondsUntil(match: RegExpMatchArray, now: Date): number {
  let hour = Number(match[1]) % (match[3] ? 12 : 24);
  if (match[3]?.toLowerCase() === "pm") hour += 12;
  const at = new Date(now);
  at.setHours(hour, Number(match[2]), 0, 0);
  const left = (at.getTime() - now.getTime()) / 1000;
  return left < -12 * 3600 ? left + 24 * 3600 : left;
}

/** What the page says about the hotel's hold: a countdown, a time of day, a length in words, or nothing. */
export function readHold(text: string, now: Date = new Date()): HoldReading {
  const reading: HoldReading = { mentioned: false };
  for (const line of text.split("\n")) {
    const verb = HOLD_VERB.test(line);
    if ((!verb && !TIMER_WORDS.test(line)) || GONE.test(line)) continue;
    const words = line.match(IN_WORDS);
    const until = verb ? line.match(UNTIL) : null;
    const countdown = line.replace(UNTIL, "").match(CLOCK);
    if (!verb && !words && !countdown) continue;
    reading.mentioned = true;
    if (words) reading.atMostSeconds = Number(words[1]) * 60;
    if (countdown) return { ...reading, secondsLeft: Number(countdown[1]) * 60 + Number(countdown[2]) };
    if (until) {
      // Trusted only if it fits the stated length: a page in another time zone would be hours off.
      const left = secondsUntil(until, now);
      if (left >= 0 && left <= (reading.atMostSeconds ?? 2 * 3600) + 60) return { ...reading, secondsLeft: Math.round(left) };
    }
  }
  return reading;
}

/** Seconds left on the hold, if the page gives a countdown or a trustworthy time of day. */
export function holdSecondsFrom(text: string, now: Date = new Date()): number | undefined {
  return readHold(text, now).secondsLeft;
}

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
