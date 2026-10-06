// Redaction by field, not only by origin (DESIGN.md P1, P2, P11). The origin
// allowlist only helps when the card fields sit in the payment provider's
// frame. Some hotels put them on their own page, and a hotel's confirmation
// page shows the last four digits. This runs on every observation, blind or
// not, before anything reaches a model or a log.

import type { Observation, PageElement } from "../../browser.ts";
import { looksLikeCard, redactCardNumbers } from "../evidence/card-number.ts";

export const WITHHELD = "[withheld]";

/** Labels of fields whose content is the traveller's to type and nobody's to read. */
const SENSITIVE_NAME =
  /card\s*(number|no\b|holder)|cardholder|name on (the )?card|\bcvc\b|\bcvv\b|security code|expir|mm\s*\/\s*yy|one[- ]time|verification code|\botp\b|passcode|password/i;

/** "ending 4242", "ends in 4242", "last four digits: 4242". */
const LAST_FOUR = /\b(ending(?:\s+in)?|ends\s+in|last\s+(?:4|four)(?:\s+digits)?(?:\s*(?:are|is|:))?)\s*[*•x·\s-]*\d{4}\b/gi;

export function isSensitiveField(el: PageElement): boolean {
  if (el.tag !== "input" && el.tag !== "textarea") return false;
  return el.type === "password" || SENSITIVE_NAME.test(el.name) || looksLikeCard(el.value ?? "") || looksLikeCard(el.name);
}

/** Card-like numbers and last-four mentions removed from free text. */
export function redactText(text: string): string {
  return redactCardNumbers(text).data.replace(LAST_FOUR, "$1 ••••");
}

/**
 * The observation with sensitive fields emptied and text scrubbed. `sensitive`
 * lists the ids of fields the agent must not act on either.
 */
export function redactObservation(seen: Observation): { seen: Observation; sensitive: Set<string> } {
  const sensitive = new Set<string>();
  const elements = seen.elements.map((el) => {
    if (!isSensitiveField(el)) return { ...el, name: redactText(el.name), value: el.value === null ? null : redactText(el.value) };
    sensitive.add(el.id);
    // The starter falls back to the field's value as its name when it has no label.
    return { ...el, name: looksLikeCard(el.name) ? WITHHELD : el.name, value: WITHHELD };
  });
  const text = seen.text.map((f) => ({ ...f, text: redactText(f.text) }));
  return { seen: { ...seen, title: redactText(seen.title), text, elements }, sensitive };
}
