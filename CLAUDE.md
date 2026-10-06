# halcy-case

Agentic hotel checkout case: brief in `halcy_case_material/BRIEF.md`, code in
`halcy_case_material/starter/agent/`, planning in `agent/`, submission
documents in `docs/`.

## Conventions

`agent/CLAUDE.md` holds the conventions (English on disk, short files, the
payment boundary, logging). They apply to the whole repository, not only to
`agent/`.

Several Claude sessions work here at once. `main` is protected: every change
goes through a pull request. Work in your own git worktree and stage files by
path; the shared working tree may be running another session's server.

## Keep the documents true: review every two hours

When you start a piece of work in this repository, look at the last row of the
log in `docs/DOCS-REVIEW.md` as it is on `origin/main` (`git fetch` first).

- If that review started **more than two hours ago**, a documentation review
  is due. Finish the step you are on, then arrange it: ask an idle halcy-case
  session to run it (`ListAgents`, `SendMessage`, point it at
  `docs/DOCS-REVIEW.md`), or run it yourself if none is idle. Tell the user in
  one line that you did.
- If another session announced a review in the last 30 minutes, do nothing.
- The user can start one at any time with `/docs-review`, or by asking for a
  docs review. Then it runs regardless of the clock.

The procedure, the list of documents and the log are in `docs/DOCS-REVIEW.md`.
Limitations, trade-offs and unverified claims live in `docs/limitations/`; a
change that adds or removes one updates that folder in the same pull request.
