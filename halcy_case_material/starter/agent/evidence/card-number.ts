// Card-number detection for the evidence trail. Anything that looks like a
// card number (13 to 19 digits, Luhn-valid, optional spaces or dashes) must
// never reach disk, whatever path it took to get there.

const CANDIDATE = /\d(?:[ -]?\d){12,18}/g;

/** Luhn checksum over a digits-only string. */
export function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length >= 13 && sum % 10 === 0;
}

/** True if the text contains something that passes as a card number. */
export function looksLikeCard(text: string): boolean {
  return [...text.matchAll(CANDIDATE)].some((m) => luhn(m[0].replace(/\D/g, "")));
}

export const REDACTED = "[redacted card-like number]";

/** Deep copy with every card-like number replaced. `redacted` says whether anything was. */
export function redactCardNumbers<T>(value: T): { data: T; redacted: boolean } {
  let redacted = false;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      return v.replace(CANDIDATE, (m) => {
        if (!luhn(m.replace(/\D/g, ""))) return m;
        redacted = true;
        return REDACTED;
      });
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && !(v instanceof Buffer)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return { data: walk(value) as T, redacted };
}
