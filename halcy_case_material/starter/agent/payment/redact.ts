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

/** "•••• 4242", "**** **** **** 4242", "xxxx-xxxx-xxxx-4242", "****4242": a masked prefix, then the last four. */
const MASKED_PREFIX = /(?<![A-Za-z0-9])((?:[*•·]{2,}|[xX]{4,})(?:[\s-]*(?:[*•·]+|[xX]+))*[\s-]*)\d{4}\b/g;

export function isSensitiveField(el: PageElement): boolean {
  if (el.tag !== "input" && el.tag !== "textarea") return false;
  return el.type === "password" || SENSITIVE_NAME.test(el.name) || looksLikeCard(el.value ?? "") || looksLikeCard(el.name);
}

/**
 * One run of asterisks or x, a space, then four digits. A masked card can look
 * like this, but so can a star rating before a year ("***** 2024") and a
 * footnote mark before a price ("** 1200"). Bullets, several groups, or a mask
 * that touches the digits are never weak: nothing else is written that way.
 */
const WEAK_PREFIX = /^(?:\*+|[xX]+)\s+$/;

/** Says a nearby masked number is a payment card. Only consulted for a weak prefix. */
const CARD_WORD = /card|visa|master|maestro|amex|american express|diners|discover|debit|credit|paid with|charged to|kort|karte|carte|tarjeta|cart[aã]o/i;

/** How far back to look for a card word: the same line and the one or two before it. */
const CONTEXT_CHARS = 80;

function maskAfterPrefix(text: string): string {
  return text.replace(MASKED_PREFIX, (match: string, prefix: string, offset: number) => {
    const weak = WEAK_PREFIX.test(prefix) && !CARD_WORD.test(text.slice(Math.max(0, offset - CONTEXT_CHARS), offset));
    return weak ? match : `${prefix}••••`;
  });
}

/** Card-like numbers and last-four mentions removed from free text. */
export function redactText(text: string): string {
  return maskAfterPrefix(redactCardNumbers(text).data.replace(LAST_FOUR, "$1 ••••"));
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
