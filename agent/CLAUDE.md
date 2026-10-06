# Conventions for agent/

These rules apply to everything in this folder and to the code that grows out of
it (planned location: `halcy_case_material/starter/agent/`).

## Language

- All code, comments, identifiers, commit messages and documentation are in
  **English**. Conversation with the developer may be in Swedish, but nothing
  written to disk is.

## File size

- Keep every source file **as short as possible, preferably under 200 lines**.
  If a file grows past that, split it by responsibility before adding more.
- One file, one job. A file that both observes the page and talks to the chat
  is two files.
- Documentation files follow the same spirit: one topic per file, no catch-all
  notes.

## Code style

- TypeScript, ESM, `strict` on. Match the starter's existing style
  (`starter/*.ts`): small exported functions, explicit types on public
  signatures, no classes unless state genuinely needs them.
- No new runtime dependencies without a written reason in the PR or commit.
  The starter only depends on Playwright. Model SDKs are the one expected
  exception.
- No hard-coded selectors, texts or URLs from Casa Halcy. Every rule must be a
  pattern that can work on a hotel site we have never seen. If something is
  mock-specific, say so in a comment and keep it out of the decision path.
- Secrets come from environment variables only. Never commit `.env`.

## Payment boundary (non-negotiable, see `payment/`)

- Never read, fill, screenshot or log frames from a payment provider origin.
- Never read `/__phone`, the hotel's terminal output or `/__admin/*`.
- Never tick the terms checkbox on the traveller's behalf without an explicit,
  logged approval in the chat.
- Every run log must show the blind interval (`handoff.blind.start` to
  `handoff.blind.end`) with no observations inside it.

## Logging

- Use `RunLog` from the starter. One event per decision, with the inputs the
  decision was based on. Money amounts are logged exactly as the hotel page
  shows them, never recomputed.

## Documentation

- Planning and decisions live in this folder as Markdown. The submission
  documents live in `../docs/`.
- When a decision in `ARCHITECTURE.md` or `payment/TRAPS.md` is made, record
  it in the "Decisions" section of `README.md` with a date.
- A limitation, a trade-off or a claim nobody has checked goes in
  `../docs/limitations/`, in the same pull request as the change that causes
  it.
- Documents are reviewed against the repository about every two hours and on
  request (`/docs-review`). The rule is in the root `CLAUDE.md`, the procedure
  in `../docs/DOCS-REVIEW.md`.

## Time budget

- The case is capped at 8 hours. Session start and deadline are in
  `../docs/TIME-LOG.md`. Prefer a working narrow slice over a broad unfinished
  one.
