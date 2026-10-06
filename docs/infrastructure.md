# Infrastructure: where the agents run

Short answer: **locally for the prototype and the debrief, Google Cloud as the
designed target.** The design document describes the GCP layout; the 8-hour
build does not deploy it. Sources: the developer's GCP notes (pasted
2026-10-06) and `research/agent-search-architecture.md`,
`research/mobile-browser-limitation.md`.

## 1. Why not deploy for the prototype

- **The mock only listens on localhost.** Both servers bind to `127.0.0.1`
  and the payment provider checks origins against `http://localhost:4101`.
- **The debrief is a live run they watch.** A visible Chromium window next to
  the chat is the clearest demonstration and has no network latency in the
  hand-off.
- **The budget is 8 hours and rewards a working agent.** Containers, IAM,
  secrets and affinity are each an hour that produces nothing in the chat.
- **Nothing in the architecture needs the cloud.** Four agents, one browser,
  one chat fit in one Node process with in-process calls.

What we do instead: keep every external dependency behind the seams the
starter already has (`Model`, `RunLog`, the chat server) so the same code can
be containerised later without touching the agents.

## 2. Production layout on GCP

Merged from the three sources. "Core" is what the design document commits
to; "later" is named but not drawn.

### Core

| Concern                    | Service                              | Why                                                                                          |
| -------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| App-facing API + chat      | Cloud Run (API service)              | Stateless, scales to zero when idle. Verifies the Firebase ID token on every request          |
| Agent worker               | Cloud Run (worker service)           | Runs the orchestrator, search, scoring and validation loop **inside one request**, because Cloud Run throttles CPU after the response is sent |
| Job dispatch               | Cloud Tasks                          | Decouples "start booking" from the run; retries; per-user rate limit. HTTP tasks cap at 30 min, which also matches the hotel hold clock |
| Browser                    | Same worker instance, Chromium in the container, 2 to 4 GB | The hotel ties the booking to one browser, so the browser lives and dies with the run       |
| Auth                       | Firebase Authentication              | Phone users sign in; backend derives `user_id` from the token                                |
| Abuse protection           | Firebase App Check, plus Cloud Armor or API Gateway in front | Every call costs model spend; only the real app may call                                      |
| Secrets                    | Secret Manager                       | Model keys and hotel API keys mounted into Cloud Run. Each service gets its own service account that reads only its own secrets. Nothing in the app binary |
| State                      | Firestore                            | Sessions, objectives, evaluations with TTL, shared candidate facts, hotel directory. One multi-tenant store partitioned by `session_id`, never one instance per session |
| Run logs and screenshots   | Cloud Storage, one bucket per environment | Evidence trail. No object may exist from the blind interval (section 3)                        |
| Observability              | Cloud Logging and Monitoring         | Traces, errors, model cost per booking                                                        |

Cloud SQL for Postgres is the developer's alternative to Firestore for users,
conversations and hand-off records. The research doc argues for Firestore
because the app can listen to a session document directly and get progress
without a socket layer. Recommend Firestore for v1 and Postgres only if
reporting queries grow. Either way: **do not provision per session.**

### Later

| Service                   | When                                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| Firebase Cloud Messaging  | Push "results ready" or "your bank wants a code" when the app is backgrounded |
| Memorystore Redis         | Raw-fetch cache, only if Firestore latency is a measured problem; fixed monthly cost, needs a VPC connector |
| Vertex AI                 | Call the models with IAM instead of an external key; keeps billing in the project |
| Cloud Run jobs            | Runs longer than 30 minutes, which a single booking should never be     |

### Data model (from the research doc, adopted in `agent/ARCHITECTURE.md` 2.9)

```
raw_fetch_cache   hash(tool, args)            -> response, fetched_at, ttl   shared
candidates        entity_id                   -> features, per-field observed_at  shared
evaluations       (entity_id, objective_hash) -> score, components, feasible   per session, TTL
sessions/{id}/candidates/{entity_id}          one document each, never an array (1 MiB cap)
```

Security rules: clients read only sessions where `user_id == auth.uid`, never
write candidates or shared entities. All writes go through the backend.
Firestore TTL is lazy, so queries also check `expires_at`.

The phone keeps a local cache for fast loading and offline viewing, plus the
sign-in token. It must work when wiped; the server is the source of truth.
Weight changes re-score locally; the backend is called only for more
exploration, missing attributes or re-verification of the top results.

## 3. The hand-off on a phone

`research/mobile-browser-limitation.md` matters more than it first looks,
because of `agent/payment/TRAPS.md` trap 1 (same browser required).

| Option                       | Same-browser constraint                                   | Card data path                                  | Fit for Halcy                                   |
| ---------------------------- | --------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------- |
| API + deep link              | Not an issue: the provider's checkout starts fresh        | Never near Halcy                                | Best where an API exists. Not the case brief (drive the hotel's own site) |
| **In-app browser (WebView)** | **Satisfied naturally**: the session is on the phone from the start | Typed on the phone into the provider's frame; Halcy's scripting layer must stop at the payment page | **Target design.** The agent fills search, rooms and details in the WebView, then stops scripting |
| Cloud browser streamed       | Satisfied, but the session is on Halcy's server           | Keystrokes relayed through Halcy's WebSocket    | **What the prototype does**, because there is no app in 8 hours. Closest to the line |
| Plain link                   | Fails: the hotel says "started in another browser"        | Clean                                           | Fallback only when the hotel does not tie the session, or after a restart |

Reconciliation with the research doc's ranking: it puts API + deep link
first, in-app browser second, cloud browser third. For the case brief the
hotel's own site is the only channel, so in-app browser is the production
answer and the streamed cloud browser is the prototype stand-in. The design
document should say exactly that, and the closing note should name the gap.

Guardrails from the research doc apply on every path: confirm hotel, dates,
total and cancellation terms before the hand-off; respect site terms (some
forbid automated booking); keep the plain-link fallback for CAPTCHAs, bot
checks and layout changes.

## 4. What the cloud changes for the payment boundary

- The browser instance is the only place card fields are ever rendered. It
  must write no screenshot or DOM dump during blind mode, and the bucket must
  hold no object from that interval.
- In the streamed-browser path the traveller's keystrokes pass through
  Halcy's WebSocket into the browser, which sends them to the payment
  provider's iframe. Halcy relays input events but does not parse or store
  them. **This is the most careful sentence in the design document**: relaying
  keystrokes is close to the line. Mitigations: no logging of relayed input,
  no observe, blind interval in the run log, and the in-app WebView as the
  production design where the keystrokes never leave the phone.
- Data-center traffic draws bot checks and CAPTCHAs (research doc). Another
  reason the production path is the WebView on the phone, not a cloud browser.

## 5. Cost per booking, rough shape

- Worker instance minutes: 3 to 10 minutes of one 2 to 4 GB instance. Cents.
- Model calls: dominated by the search agent's page observations. Keep them
  text-only and bounded; reserve vision for the confirmation page.
- Everything else is negligible per booking.

## 6. Decision

Build and demo locally. Write section 2 into the design document as the
target, section 3 as the mobile answer. Name the streamed-browser stand-in
and the WebView gap in the closing note.
