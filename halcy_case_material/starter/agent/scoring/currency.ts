// Currencies as hotel pages write them: a symbol, a code, sometimes a word.
// Nothing here converts an amount. The only question answered is whether two
// ways of writing a currency can mean the same one, so that a price cap is
// never compared with a price in another currency and a payment page that
// charges in another currency than the room list is caught.

/** Symbols that stand for more than one currency map to every one they can mean. */
const SYMBOLS: Record<string, string[]> = {
  "€": ["EUR"],
  "£": ["GBP"],
  "$": ["USD", "CAD", "AUD", "NZD", "SGD", "HKD", "MXN"],
  "US$": ["USD"],
  "C$": ["CAD"],
  "CA$": ["CAD"],
  "A$": ["AUD"],
  "AU$": ["AUD"],
  "HK$": ["HKD"],
  "¥": ["JPY", "CNY"],
  "KR": ["SEK", "NOK", "DKK", "ISK"],
  "FR": ["CHF"],
  "ZŁ": ["PLN"],
  "KČ": ["CZK"],
  "₹": ["INR"],
  "₺": ["TRY"],
  "R$": ["BRL"],
};

const WORDS: Record<string, string[]> = {
  EURO: ["EUR"],
  EUROS: ["EUR"],
  DOLLAR: ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"],
  DOLLARS: ["USD", "CAD", "AUD", "NZD", "SGD", "HKD"],
  POUND: ["GBP"],
  POUNDS: ["GBP"],
  KRONA: ["SEK"],
  KRONOR: ["SEK"],
  KRONER: ["NOK", "DKK"],
  FRANC: ["CHF"],
  FRANCS: ["CHF"],
  YEN: ["JPY"],
};

/** The currencies a written form can mean. An unknown form means only itself. */
export function currenciesOf(written: string): string[] {
  const text = written.trim().replace(/\.$/, "").toUpperCase();
  if (!text) return [];
  if (SYMBOLS[text]) return SYMBOLS[text];
  if (WORDS[text]) return WORDS[text];
  return [text];
}

/** True when the two written forms can be the same currency. "€" and "EUR" are; "kr" and "EUR" are not. */
export function sameCurrency(a: string, b: string): boolean {
  const left = currenciesOf(a);
  const right = new Set(currenciesOf(b));
  return left.some((c) => right.has(c));
}
