# Mobile limitation: no browser extension to drive the user's session

_Last updated: 2026-10-06_

## Context

Halcy is an AI agent that helps users find and book hotels. It never processes payment itself: the agent prepares the booking and the user completes payment.

Where a hotel has no booking API, the agent can fill in the booking form in a browser (dates, room, guest details) and hand control to the user at the payment step. On desktop, the recommended way to do this is a **browser extension** that acts in a tab of the user's own browser. That gives us:

- the user's existing logins and cookies,
- traffic that looks like a real user, not a data-center bot,
- a visible, natural handoff when payment is reached.

## The limitation

**On mobile, this approach is mostly unavailable.** Phone browsers (Safari on iOS, Chrome on Android) have little or no support for extensions that can script pages. So on a phone the agent cannot drive the user's own browser session the way it can on desktop.

What this means in practice:

- The agent cannot reuse the user's mobile browser logins or cookies.
- There is no background tab the agent can quietly fill in for the user.
- Any page automation must happen either inside our own app or on our servers.

## Options on mobile

| Option | How it works | Pros | Cons |
| --- | --- | --- | --- |
| **API + deep link** | Agent searches and prices through booking APIs, then opens the provider's checkout page or app with details prefilled. User confirms and pays. | Most reliable; payment stays with the user; works well with Apple Pay / Google Pay | Only covers hotels and providers with APIs or deep-link support |
| **In-app browser** | Our app opens the hotel page in an embedded web view it can script. Agent fills in details; user taps through payment on the same screen. | Covers hotels without an API; handoff stays in-app | No shared logins with the user's browser; some payment pages block embedded views; layouts change and break scripts |
| **Cloud browser streamed to the phone** | Agent runs a browser on our server; the user watches and takes over through a live view in the app. | Works on any phone; no per-site app integration | Sites see data-center traffic, so more bot checks and CAPTCHAs; added latency and infra cost |

## Recommendation

For a phone-first product:

1. **Lead with API + deep link.** It is the most reliable path and keeps payment entirely with the user.
2. **Add the in-app browser** for hotels no API covers. If the payment page refuses to load in the embedded view, open it in Safari or Chrome instead.
3. **Fall back to a plain link** when automation fails (CAPTCHA, bot check, layout change).

In every path, the user completes payment themselves.

## Guardrails that apply on every platform

- **Confirm before handoff.** Show hotel, dates, total price and cancellation terms before the user reaches payment.
- **Respect site terms.** Some hotel sites forbid automated booking; filling in forms on a user's behalf can cross that line even where reading the site is fine.
- **Expect breakage.** Page layouts change and bot checks stop automation, so always keep the plain-link fallback.
