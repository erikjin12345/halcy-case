# WebView plan: the hotel site inside the Halcy app

Initial plan for the production path named in `../docs/infrastructure.md`
section 3: the traveller uses the Halcy app on a phone, the hotel's site runs
in a WebView inside the app, the agents run on the server. Nothing here is
built or tested. It is **outside the 8-hour build** except phase 0.

## 1. The idea in one picture

```
PHONE (Halcy app)                               SERVER (Cloud Run worker)
+----------------------------------+           +---------------------------+
| chat UI                          |           | orchestrator, search,     |
| WebView: hotel site              |  command  | objective, validation     |
|   bridge script (main frame,     | <-------- | payment module (code)     |
|   hotel origin only)             |  result   | RemoteDriver              |
|   payment provider frame: closed | --------> | Luhn scrub, GuardedLog    |
+----------------------------------+   event   +---------------------------+
        | card, bank code                               | text only
        v                                               v
  hotel's payment provider, traveller's bank       model provider
```

The server is the brain, the WebView is the hands. The session cookie and
User-Agent are the phone's from the first click, so the hotel's same-browser
rule (`payment/TRAPS.md` trap 1) holds without tricks. The card goes from the
phone to the payment provider and never to a Halcy server.

Be exact about the claim: the card never reaches a Halcy **server**, but the
WebView is part of Halcy's **app**, and an app can inject scripts into its own
WebView and read fields. So the boundary here is "the app does not", proven by
code, tests and audit. It is not "the app cannot". Section 6 has the
alternative that gives "cannot", and what it costs.

What stays the same: the four agents, the prompts, the scoring, the Store,
`PaymentResult` and the hand-off sequence in `payment/DESIGN.md`. What moves:
the browser, and with it the first layer of every guard.

## 2. What has to be built

### A. Driver seam on the server (phase 0, fits the case)

Today `tools/browser.ts`, the three browser agents and `index.ts` take a
Playwright `Page`. Replace that with an interface:

```ts
interface PageDriver {
  observe(): Promise<Observation>;       // already filtered to allowed origins
  act(action: Action): Promise<void>;
  goto(url: string): Promise<void>;
  location(): { origin: string; path: string };
  onNavigated(cb: (to: { origin: string; path: string }) => void): void;
  onClosed(cb: () => void): void;
}
```

`PlaywrightDriver` wraps the starter's `observe` and `act` and is what the
prototype runs. `RemoteDriver` (phase 2) sends the same calls to the app.
Agents and prompts do not change. This makes the design document's claim
"same agents, different hands" true in code.

### B. Bridge script (runs inside the WebView)

One JavaScript file, injected into the main frame, active only when
`location.origin` is on the hotel allowlist.

- `observe`: port of the function inside `observe()` in `starter/browser.ts`:
  visible text, actionable elements, a `data-agent-id` on each.
- Sensitive-field redaction from `payment/DESIGN.md` P1, applied before
  anything leaves the page.
- `act`: click, fill, select, check. Playwright does the hard part of `fill`
  today; the bridge must set the value through the native setter and dispatch
  `input` and `change` itself.
- Never reads into frames. From the main frame a script cannot read a frame on
  another origin anyway, so the browser enforces the boundary that
  `tools/boundary.ts` enforces by policy under Playwright.
- Blind flag: when set, `observe` and `act` return a refusal.

The same file can be loaded into the mock with Playwright, so it is developed
and tested in CI long before an app exists.

### C. App screen (native work)

| Piece                | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| WebView container    | Loads the hotel URL, keeps cookies and one fixed User-Agent for the run |
| Bridge injection     | Main frame only, hotel origin only. iOS: `WKUserScript` with `forMainFrameOnly`, script checks origin. Android: `addDocumentStartJavaScript` with origin rules. Avoid Android `addJavascriptInterface`, which is exposed to every frame |
| Message channel      | Bridge to native (`WKScriptMessageHandler`, `WebMessageListener`), native to server |
| Navigation reporter  | Sends origin and path of main-frame navigations, never query strings or frame addresses (`DESIGN.md` P4) |
| New windows          | Links that open a new window (the hotel's conditions) show in a sheet with no bridge |
| Blind mode UI        | Banner "You are on <hotel>'s payment page. Halcy cannot see this screen", countdown, Done / It didn't work / Cancel |
| Capture off          | No WebView snapshots; Android `FLAG_SECURE` on the screen; analytics, crash and session-replay SDKs excluded from it |
| Survive backgrounding | The traveller switches to the bank app and back; the WebView and its session must still be there |

### D. Protocol between app and server

| Direction        | Message                                                          |
| ---------------- | ---------------------------------------------------------------- |
| app to server    | `POST /v1/bookings { message }` returns `bookingId`              |
| server to app    | `command { id, kind: observe / act / goto / blind.start / blind.end, ... }` |
| app to server    | `result { id, ok, observation? , error? }`                       |
| app to server    | `event { kind: navigated / closed / backgrounded / button, ... }` |
| server to app    | chat messages and cards, as the starter's `Chat` does today      |

Transport: one WebSocket per booking, the simplest match for the current code
(the agent loop awaits each tool call). Cloud Run supports it with a request
timeout long enough for a hold. Alternative: the app polls a step endpoint and
the loop is suspended in Firestore between steps; stateless, but the tool
runner in `llm/client.ts` must then be made resumable.

Server-side checks on every inbound message: schema, Firebase ID token, App
Check, reject any `result` with an observation while blind, Luhn scrub. The
server is the second layer; it must not rely on the app being correct.

### E. Hand-off on the server

`payment/DESIGN.md` section 3 unchanged, with three substitutions:
"bring the window forward" becomes `blind.start` to the app; signals come from
app events instead of Playwright; the outcome read is one `observe` command
after `blind.end`.

## 3. Phases

| Phase | Content                                                         | Needs an app | Size (guess) |
| ----- | --------------------------------------------------------------- | ------------ | ------------ |
| 0     | `PageDriver` seam, `PlaywrightDriver`, agents take the driver   | no           | under 1 hour |
| 1     | Bridge script with redaction, tested against the mock in CI     | no           | 1 to 2 days  |
| 2     | `RemoteDriver`, WebSocket endpoint, inbound checks, a fake app client for tests | no | 2 to 3 days |
| 3     | App screen: container, injection, channel, navigation reporter  | yes          | 1 to 2 weeks, one platform |
| 4     | Blind mode end to end, capture off, backgrounding, audit of server logs | yes  | about 1 week |
| 5     | Fallbacks, second platform, run against a set of real hotel layouts (read-only) | yes | open |

Phases 0 to 2 can be finished and demonstrated without any mobile code: a
script that plays the app over the WebSocket, driving Playwright with the
bridge file, proves the protocol and the guards.

## 4. Risks specific to the WebView

| #  | Risk                                                                | Handling |
| -- | ------------------------------------------------------------------- | -------- |
| W1 | Clicks from a script are not trusted events; some sites ignore them. Playwright sends real input, the bridge cannot | Measure on real layouts in phase 5. Fallback: ask the traveller to tap |
| W2 | A bank check or hosted payment page takes over the main frame; a script injected there would run on the bank's page | Bridge is inert off the hotel allowlist; injection is origin-scoped where the platform allows |
| W3 | Session-replay or crash SDKs record the payment screen              | Exclude the screen; test that no capture API is called while blind |
| W4 | A redaction bug ships to phones and stays until the app updates     | Server-side scrub as second layer; keep the bridge script server-delivered and versioned |
| W5 | Some payment pages refuse embedded views; wallet buttons may be missing there | Detect and fall back to the system browser; the session is lost on hotels that tie it |
| W6 | The OS kills the app while the traveller is in the bank app         | Persist the booking id; on return run the outcome read first (`DESIGN.md` P10) |
| W7 | Each step is a network round trip plus a model call                 | Batch observe after act; measure seconds per booking |
| W8 | Hotel terms may forbid automated form filling                       | Per-hotel allowlist; plain-link fallback |
| W9 | Testing against the mock from an emulator: the mock checks `localhost` as a string (`TRAPS.md` 17) | iOS simulator shares the host's localhost; Android needs `adb reverse` for 4100 and 4101 |

`payment/DESIGN.md` traps that go away: P7 (no live view), P13 (no headless
mode). P5 (recorders) becomes W3.

## 5. Open decisions and questions

1. Phase 0 inside the 8 hours: **done 2026-10-06, PR #7.** The sessions
   owning the touched files agreed. The seam came out stricter than section
   2A: agents get a guarded driver that enforces the boundary itself.
2. Transport: WebSocket (recommended) or resumable step endpoint.
3. App framework: not blocking for the case. The plan stays framework-neutral.
   The Halcy app is in the App Store, so iOS (`WKWebView`,
   `SFSafariViewController`) is the platform to describe first.
4. Is the bridge script bundled in the app or fetched from the server at
   start? Fetching fixes W4 faster but makes the server able to change what
   runs next to a payment page; it then needs signing and review.
5. Not verified: that main-frame-only injection behaves as described on both
   platforms, and how wallet payments behave in an embedded view. Both need a
   one-day spike before phase 3 is sized.

## 6. The alternative: pay in a system browser tab

From an outside review (2026-10-06): for the payment, open
`SFSafariViewController` on iOS or a Chrome Custom Tab on Android instead of
the WebView. The app cannot script or read those, and the traveller keeps
saved cards and passkeys.

It is the stronger boundary, and it collides with two things in this case:

| Point                 | WebView (sections 1 to 4)                      | System browser tab                               |
| --------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Can Halcy's app read the card | could, does not (code, tests, audit)   | cannot                                           |
| Saved cards, passkeys, wallets | often missing                         | work                                             |
| Hotel ties the booking to one browser (`payment/TRAPS.md` trap 1) | fine, same session | **breaks**: the tab is another browser with its own cookies, so the hotel says "session not found" |
| Payment status        | read from the hotel's confirmation page        | **none**: the app sees nothing in the tab; only what the traveller reports |
| Work left to the traveller | card, terms, bank check                   | everything after the point where the hotel creates the session |

The collision with trap 1 moves the hand-off point, it does not rule the tab
out. A hotel creates its session at some step; every step before it is a plain
address that works in any browser. On the mock that step is submitting the
details form, so a link to the details page with room, rate and dates opens
correctly in a fresh browser. The agent would then search and compare in its
own session, and hand over a link *before* the session exists. The traveller
does guest details, add-ons, card, terms and bank check. Costs: more work for
the traveller, the price with tax is first seen by the traveller and not
checked by the agent, pre-ticked add-ons are back in the traveller's hands,
and the status is `unconfirmed` until the traveller reports back. Do not put
the traveller's name, email or phone in the link.

Proposed rule for production, to decide later:

1. Hotel or provider offers a booking API or a deep link: use it, pay in the
   system browser tab, take the status from the provider's booking lookup or
   webhook. Most reliable source there is.
2. Hotel does not tie the session, or the link point is late enough: agent
   prepares, system browser tab for the rest.
3. Otherwise: WebView with the guards in section 2, and say plainly that the
   boundary is enforced by Halcy's code.

The prototype is unaffected: the visible Chromium window stands in for case 3.
