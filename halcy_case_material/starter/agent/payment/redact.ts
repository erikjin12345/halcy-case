// Redaction by field, not only by origin (DESIGN.md P1, P2, P11). The origin
// allowlist only helps when the card fields sit in the payment provider's
// frame. Some hotels put them on their own page, and a hotel's confirmation
// page shows the last four digits. This runs on every observation, blind or
// not, before anything reaches a model or a log.

import type { Observation, PageElement } from "../../browser.ts";
import { looksLikeCard, redactCardNumbers } from "../evidence/card-number.ts";

export const WITHHELD = "[withheld]";

/** What the browser itself is told a field holds. Language-free; checked first. */
const CARD_AUTOCOMPLETE = /\bcc-(number|exp|exp-month|exp-year|name|given-name|family-name|csc|type)\b|\bone-time-code\b/i;

/** A field's own name or id: developers name card fields in English whatever the page's language. */
const CARD_ATTRIBUTE = /(^|[^a-z])(card|cc|pan|cvc|cvv|csc|exp|expiry|expiration|otp|cardholder|holder|security[-_]?code|card[-_]?number)([^a-z]|$)|cardnumber|cardholder|cc[-_]?num/i;

/**
 * Labels, as a fallback, in the languages hotel sites in Europe use: English,
 * German, French, Spanish, Portuguese, Italian, Swedish, Dutch. A label only
 * has to name the field; the value is never needed to decide.
 */
const SENSITIVE_NAME = new RegExp(
  [
    // English
    "card\\s*(number|no\\b|holder)|cardholder|name on (the )?card|\\bcvc\\b|\\bcvv\\b|\\bcsc\\b|security code|expir|valid (until|thru|through)|mm\\s*\\/\\s*(yy|jj|aa)|one[- ]time|verification code|confirmation code|\\botp\\b|passcode|password",
    // German
    "karten(nummer|inhaber|prüf)|kreditkarte|gültig bis|ablauf|prüf(nummer|ziffer|code)|sicherheitscode|bestätigungscode|einmal(code|passwort)",
    // French
    "num[ée]ro de (la )?carte|titulaire de (la )?carte|date d'?(expiration|validit[ée])|cryptogramme|code de s[ée]curit[ée]|code de (v[ée]rification|confirmation)",
    // Spanish
    "n[úu]mero de (la )?tarjeta|titular de (la )?tarjeta|fecha de (caducidad|vencimiento)|caducidad|c[óo]digo de (seguridad|verificaci[óo]n|confirmaci[óo]n)",
    // Portuguese
    "n[úu]mero do cart[ãa]o|validade|nome no cart[ãa]o|c[óo]digo de seguran[çc]a",
    // Italian
    "numero (della )?carta|intestatario (della )?carta|titolare (della )?carta|scadenza|codice di (sicurezza|verifica)",
    // Swedish
    "kortnummer|kortinnehavare|namn på kortet|utg[åa]ngsdatum|giltig till|s[äa]kerhetskod|verifieringskod|engångskod",
    // Dutch
    "kaartnummer|kaarthouder|vervaldatum|geldig tot|beveiligingscode|verificatiecode",
  ].join("|"),
  "i",
);

/** "ending 4242", "ends in 4242", "last four digits: 4242". */
const LAST_FOUR = /\b(ending(?:\s+in)?|ends\s+in|last\s+(?:4|four)(?:\s+digits)?(?:\s*(?:are|is|:))?)\s*[*•x·\s-]*\d{4}\b/gi;

/** "•••• 4242", "**** **** **** 4242", "xxxx-xxxx-xxxx-4242", "****4242": a masked prefix, then the last four. */
const MASKED_PREFIX = /(?<![A-Za-z0-9])((?:[*•·]{2,}|[xX]{4,})(?:[\s-]*(?:[*•·]+|[xX]+))*[\s-]*)\d{4}\b/g;

/**
 * True for a field that holds card data or a bank code, filled or empty.
 * Attributes first (language-free), then the label in several languages,
 * then the value itself as a last net (a Luhn-valid number).
 */
export function isSensitiveField(el: PageElement): boolean {
  if (el.tag !== "input" && el.tag !== "textarea" && el.tag !== "select") return false;
  if (el.type === "password" || CARD_AUTOCOMPLETE.test(el.autocomplete ?? "")) return true;
  if (el.tag !== "select" && [el.fieldName, el.fieldId].some((a) => a && CARD_ATTRIBUTE.test(a))) return true;
  return SENSITIVE_NAME.test(el.name) || looksLikeCard(el.value ?? "") || looksLikeCard(el.name);
}

/**
 * One run of asterisks or x, a space, then four digits. A masked card can look
 * like this, but so can a star rating before a year ("***** 2024") and a
 * footnote mark before a price ("** 1200"). Bullets, several groups, or a mask
 * that touches the digits are never weak: nothing else is written that way.
 */
const WEAK_PREFIX = /^(?:\*+|[xX]+)\s+$/;

/**
 * Says the nearby text is about a card or about paying. Only consulted for a
 * weak prefix, and deliberately broad: "Payment method: **** 4242" names no
 * card. So the weak rule spares a rating or a footnote only in text that is
 * not about paying at all.
 */
const CARD_WORD =
  /card|visa|master|maestro|amex|american express|diners|discover|debit|credit|pay|paid|charged|guarantee|kort|karte|carte|tarjeta|cart[aã]o|betal|garanti|zahl|paiement|pago/i;

/** How far back to look for such a word: the same line and the one or two before it. */
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
