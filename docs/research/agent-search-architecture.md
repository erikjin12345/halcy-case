# Agent Search Architecture: Re-scorable Results on GCP

Architecture for a mobile app where an AI agent searches for the best candidate under a goal function (for example the best hotel room), and the user can change the goals without discarding earlier results.

## 1. Core principle

Store observations separately from evaluations.

- **Observations** are facts the agent learned about a candidate (price, location, amenities). They are expensive to collect and reusable.
- **Evaluations** are scores derived from those facts under one specific objective. They are cheap to recompute and disposable.

A goal change then means recomputing scores over stored facts, not searching again.

## 2. Reusing old results after a goal change

Re-scoring is valid, with three limits:

| Limit | Problem | Mitigation |
|---|---|---|
| Coverage bias | The old search was steered by the old objective, so the candidate set is not a neutral sample | Use the re-scored set as a warm start, then explore where the new objective differs most from the old one |
| Missing features | The new objective may need attributes that were never collected | Enrich lazily: compute an optimistic bound per candidate and fetch the attribute only for those that could still beat the current best |
| Staleness | Price and availability expire in minutes to hours; location and amenities last months | Per-field timestamp and TTL; re-verify volatile fields of the top-k before answering |

Also store rejected candidates with the rejection reason, so a relaxed hard constraint makes them eligible again without a new search.

If an LLM does the scoring, have it extract structured features once (`quiet: 0.8, walk_min: 12, has_desk: true`) and compute the score with a deterministic function over them. Holistic LLM scores require a full re-evaluation on every goal change and are not comparable across rubric versions.

## 3. Data model

```
raw_fetch_cache   key: hash(tool, args)            -> response, fetched_at, ttl
candidates        key: entity_id                   -> features (JSON), per-field observed_at, source
evaluations       key: (entity_id, objective_hash) -> score, components, feasible, computed_at
```

`objective_hash` is a hash of the objective spec (weights, constraints, rubric version). A new goal produces a new hash, so nothing needs explicit invalidation.

## 4. Where data lives

| Data | Location | Reason |
|---|---|---|
| Raw fetch cache, candidate facts | Backend, shared across all users | Facts are not user-specific, so one user's search warms the cache for the next |
| Objective spec, evaluations, session state | Backend, keyed by `session_id`, with TTL | Per-user and disposable |
| Feature vectors of the current candidate set | Phone (SQLite or in-memory) | Enables local re-scoring |

- Use one shared multi-tenant store partitioned by `session_id`. Do not provision a database instance per session: provisioning takes minutes, is billed per instance, and adds no isolation beyond what row-level access rules give.
- The phone copy is a cache. The app must work if it is wiped; the server is the source of truth.
- When the user changes weights or filters, re-score locally on the phone. Call the backend only when the new objective needs missing attributes, more exploration, or re-verification of the top results.

## 5. Why the agent loop runs on the backend

- **API key:** the model API key cannot ship in the app binary.
- **Backgrounding:** mobile OSes suspend backgrounded apps, which would kill a multi-minute search.
- **Flaky connections:** with server-side state, a dropped connection loses nothing and the client reattaches by `session_id`.

## 6. GCP infrastructure

### Required

| Component | GCP service | Role |
|---|---|---|
| Auth | Firebase Authentication | Issues ID tokens to the app; the backend verifies them and derives `user_id` |
| API and agent worker | Cloud Run | One service for the app-facing API, one for running the agent loop |
| Job dispatch | Cloud Tasks | Decouples "start search" from the run; retries and per-user rate limiting |
| State | Firestore | Sessions, objectives, evaluations (with TTL), and shared candidate facts |
| Secrets | Secret Manager | Model API key and hotel/search API keys, mounted into Cloud Run |
| Abuse protection | Firebase App Check | Ensures only the real app can call the API, since each call costs model spend |

### Add when needed

| Service | Use |
|---|---|
| Firebase Cloud Messaging | Push a "search finished" notification when the app is backgrounded |
| Memorystore (Redis) | Faster raw-fetch cache, only if Firestore latency becomes a measured problem; needs a VPC connector and has a fixed monthly cost |
| Cloud Storage | Large raw payloads (scraped pages, long API responses) |
| Vertex AI | Calling the model through GCP with IAM instead of an external API key |

## 7. Request flow

1. The app signs in and sends `POST /sessions` with the objective spec and its ID token.
2. The API service writes `sessions/{id}` and enqueues a Cloud Task.
3. The task calls the worker service, which runs the agent loop and writes candidates and progress to Firestore as it goes.
4. The app listens to the session through the Firestore SDK, so progress streams in without a custom socket layer.
5. On a goal change, the app re-scores locally and calls `POST /sessions/{id}/objective` only if more exploration or enrichment is needed.

## 8. Implementation details

- **Run the loop inside a request.** Cloud Run throttles CPU once a response is sent, so work continued after responding stalls. The worker's request must stay open for the whole run, which is the reason for the Cloud Tasks hop. HTTP tasks time out after 30 minutes at most; use Cloud Run jobs for longer runs.
- **One document per candidate.** Firestore documents are capped at 1 MiB. Store candidates in a subcollection (`sessions/{id}/candidates/{entity_id}`), not as an array in the session document.
- **Security rules.** Clients get read access only to sessions where `user_id == request.auth.uid`, and no write access to candidates or the shared `entities/{entity_id}` collection. All writes go through the backend.
- **TTL is lazy.** Firestore TTL deletion can lag expiry by up to about a day, so also check `expires_at` in queries.
