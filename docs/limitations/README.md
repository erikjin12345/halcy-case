# Limitations and trade-offs

What the prototype cannot do, what we chose to give up, and what we have not
checked. Written so the closing note and the design document can be taken
from it, and so a reviewer can find the weak points without reading the code.

| File              | Question it answers                                              |
| ----------------- | ---------------------------------------------------------------- |
| `trade-offs.md`   | Where we had a choice: what we picked, what we gave up, what it costs |
| `limitations.md`  | What the thing we built does not do, and what the traveller would notice |
| `not-verified.md` | What we believe but have not run, measured or had checked        |

How this differs from `../concerns.md`: that file is the running register of
everything flagged, with a status per line. This folder is the settled
picture. When a concern is closed by a decision, the decision goes in
`trade-offs.md`; when it is closed by "we live with it", it goes in
`limitations.md`.

## Rules for entries

- One row per item. Say what the traveller, the hotel or the reviewer would
  actually see, not only the mechanism.
- Name where it lives (file, PR, run log) so it can be checked.
- Nothing moves out of `not-verified.md` without a run log, a test or a
  source to point at.
- Numbers carry their sample size. One run is an observation.
- Kept current by the review routine in `../DOCS-REVIEW.md`.
