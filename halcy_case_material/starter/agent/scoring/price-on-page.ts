// Is a recorded price really on the page the agent read, and in which
// currency? Code reads the page text; no model in between. The model still
// chooses which line to record. This checks that the number is there, takes
// its currency from what is written next to it, refuses a figure the page
// marks as a guide, and refuses to choose when a page shows prices in two
// currencies and does not say which one is charged.

import { shownAs } from "../payment/page-facts.ts";
import { currenciesOf, sameCurrency } from "./currency.ts";

export type PriceCheck = { ok: true; currency?: string } | { ok: false; reason: string };

const UNIT = /[€$£¥]|\b[A-Z]{3}\b/;
// The same token shape as payment/page-facts.ts uses for amounts.
const PRICED = /(?:[€$£¥]|\b[A-Z]{3}\b)\s?\d[\d.,]*\d|(?:[€$£¥]|\b[A-Z]{3}\b)\s?\d|\d[\d.,]*\s?(?:[€$£¥]|\b[A-Z]{3}\b)/g;
const GUIDE_BEFORE = /(?:\bas a guide\b|\bguide\b|\bapprox(?:\.|imately)?\b|\babout\b|\baround\b|\bca\.|≈|~)\s*$/i;
const GUIDE_AFTER = /^\s*\(?\s*(?:as a guide|guide|approx(?:\.|imately)?|indicative)/i;
const CHARGED_IN = /\b(?:we|you will be|you'll be|payment is|payments are|prices are)\s+(?:charge[sd]?|taken|made|billed|paid)\s+in\s+([A-Za-z€$£¥]+)/i;
const STATED_GUIDE = /\b([A-Za-z€$£¥]+)\s+(?:prices|figures|amounts)?\s*(?:are|is)?\s*(?:shown\s+)?(?:as\s+)?(?:a\s+)?guide\b/i;

/** The currency written in a money token such as "£140.00" or "140 GBP". */
export function currencyOfToken(token: string): string | undefined {
  return token.match(UNIT)?.[0];
}

/** Every currency a page shows prices in, as written. */
export function currenciesOnPage(text: string): string[] {
  const out: string[] = [];
  for (const m of text.match(PRICED) ?? []) {
    const c = currencyOfToken(m);
    if (c && !out.some((o) => sameCurrency(o, c))) out.push(c);
  }
  return out;
}

/** True for a code, a symbol, or a currency word such as "pounds" or "euros". */
function isCurrency(word: string): boolean {
  return /^[A-Z]{3}$|^[€$£¥]$/.test(word) || currenciesOf(word).some((c) => c !== word.trim().toUpperCase());
}

/** The currency the page says it charges in, if it says so in a recognisable sentence. */
export function chargeCurrencyStated(text: string): string | undefined {
  const word = text.match(CHARGED_IN)?.[1];
  return word && isCurrency(word) ? word : undefined;
}

/** A currency the page says its figures in are only a guide ("Prices in euros are a guide"). */
function guideCurrency(text: string): string | undefined {
  const word = text.match(STATED_GUIDE)?.[1];
  return word && isCurrency(word) ? word : undefined;
}

/** Where `token` occurs in `text`, and whether the page marks that occurrence as a guide figure. */
function occurrences(text: string, token: string): { guide: boolean }[] {
  const out: { guide: boolean }[] = [];
  for (let i = text.indexOf(token); i >= 0; i = text.indexOf(token, i + 1)) {
    const before = text.slice(Math.max(0, i - 24), i).split("\n").pop() ?? "";
    const after = text.slice(i + token.length, i + token.length + 24).split("\n")[0];
    out.push({ guide: GUIDE_BEFORE.test(before) || GUIDE_AFTER.test(after) });
  }
  return out;
}

/** The check `add_candidate` runs on every recorded price. `charge` is what the model says is charged, if anything. */
export function checkPriceOnPage(text: string, amount: number, charge?: string, nights?: number): PriceCheck {
  const whole = checkFigure(text, amount, charge);
  // A page that prices per night: the stay's total is the night price times the nights, and the night price must be on the page.
  if (!whole.ok && nights && nights > 1 && /not on the page/.test(whole.reason)) {
    const perNight = checkFigure(text, Math.round((amount / nights) * 100) / 100, charge);
    if (perNight.ok) return perNight;
  }
  return whole;
}

function checkFigure(text: string, amount: number, charge?: string): PriceCheck {
  const shown = currenciesOnPage(text);
  if (shown.length === 0) return { ok: true }; // A page with no currency at all: nothing to check against.
  // Find the amount written with each currency the page uses.
  const tokens = text.match(PRICED) ?? [];
  const hits = [...new Set(tokens)].filter((t) => shownAs(t, amount) !== undefined);
  const genuine = hits.filter((t) => occurrences(text, t).some((o) => !o.guide));
  if (hits.length === 0) return { ok: false, reason: `${amount} is not on the page you read. Record a figure exactly as the page writes it` };
  const guideCur = guideCurrency(text);
  const priced = genuine.filter((t) => !(guideCur && sameCurrency(guideCur, currencyOfToken(t) ?? "")));
  if (priced.length === 0) return { ok: false, reason: `${amount} appears on the page only as a guide figure, which is not the price` };
  const stated = chargeCurrencyStated(text) ?? charge;
  const pick = stated ? priced.find((t) => sameCurrency(stated, currencyOfToken(t) ?? "")) : priced[0];
  if (!pick) return { ok: false, reason: `the page charges in ${stated}, but ${amount} is written in ${currencyOfToken(priced[0])}` };
  if (!stated && shown.length > 1) {
    return { ok: false, reason: `the page shows prices in ${shown.join(" and ")} and does not say which is charged. Name it in charge_currency if the page says so, or switch the page to one currency` };
  }
  return { ok: true, currency: currencyOfToken(pick) };
}
