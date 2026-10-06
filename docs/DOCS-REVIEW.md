# Documentation review

A routine that keeps every Markdown document true to the repository and to
what the Claude sessions are doing. It runs about every two hours while work
is going on, and whenever someone asks for it.

## When it runs

- **On a timer.** `CLAUDE.md` in the repository root tells every session to
  check the log at the bottom of this file when it starts a piece of work. If
  the last review on `origin/main` started more than two hours ago, a review
  is due and that session arranges it.
- **By hand.** Type `/docs-review` in any session in this repository
  (`.claude/commands/docs-review.md`), or simply ask for "a docs review".
- **A real clock, if wanted.** The rule above only fires when a session is
  active. For a fixed interval, run `/loop 2h /docs-review` in one session.

Only one review at a time. Before starting, tell the other halcy-case
sessions (`ListAgents`, `SendMessage`) that you are doing it. If another
session announced one in the last 30 minutes, do not start a second.

## What to review

Every `*.md` under `agent/`, `docs/` and `halcy_case_material/starter/agent/`
(the code README and `scenarios/README.md`), plus the root `CLAUDE.md`.

Leave alone: `halcy_case_material/BRIEF.md` and `halcy_case_material/README.md`
(the case as given), `docs/research/*` (kept verbatim), and
`starter/agent/prompts/*.md` (system prompts: code, changed only with a run to
show for it).

## How

1. `git fetch`, then read what changed since the last review:
   `gh pr list --state merged`, `git log` on `origin/main` since the time in
   the log, and any open pull requests.
2. Find out what the other sessions are doing: `ListAgents`, then ask each
   halcy-case session for two lines on what it has in flight and which files
   it is touching. Do not edit a document another session is changing; tell
   it what you found instead.
3. For each document, check against the code and the run logs, not against
   memory:
   - every file, function, event name, command and pull request it mentions
     exists and says what the document says;
   - status words are still true: "not built", "to add", "planned", "open",
     "not started", "not run", "pending";
   - numbers match the run log or test output they came from;
   - decisions in `agent/README.md` are not contradicted elsewhere.
4. Update the registers: `docs/README.md` (deliverables table),
   `docs/concerns.md` (status per line), `docs/limitations/` (move rows
   between the three files as things get built, decided or verified).
5. Fix what is wrong. Append only in `agent/README.md` Decisions and
   `docs/TIME-LOG.md`; never rewrite an old row there. If a statement cannot
   be checked, say so in `docs/limitations/not-verified.md` rather than
   leaving it as fact.
6. Work in your own worktree on a branch named `docs/review-<HHMM>`, never in
   the shared working tree. Add a row to the log below and to
   `docs/TIME-LOG.md`, open a pull request, and give the user three lines:
   what changed, what you could not verify, what needs their decision.

Keep it to about 15 minutes. A review that finds nothing still adds its row.

## Log

Times in HKT. "Started" is what the two-hour rule counts from.

| Date       | Started | Session        | Result |
| ---------- | ------- | -------------- | ------ |
| 2026-10-06 | 13:30   | halcy-case-fc  | Routine created together with `docs/limitations/`. Baseline, not a full review: only `agent/payment/DESIGN.md`, `docs/concerns.md` and the limitations folder were brought up to date |
| 2026-10-06 | 15:35   | halcy-case-fc  | Payment documents only, at the orchestrator session's request, without asking the other sessions: `docs/limitations/` after the failure-path runs (N3, N4, N5, N7 moved out with run folders; L33 to L36, N24, N25 added), `agent/payment/README.md` and the code README no longer say the hand-off is unbuilt, `docs/README.md` deliverables, `docs/concerns.md` A4. Not reviewed: `ARCHITECTURE.md`, `MODELS.md`, `infrastructure.md`, `WEBVIEW-PLAN.md`, `scenarios/README.md` |
