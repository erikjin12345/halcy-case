# AI chat logs

The brief asks for the AI chat logs: what was asked, what the tools got wrong,
and what was overruled. The logs themselves are not in this repo (about 33 MB,
and they hold everything typed, including local paths); they are handed in
next to it as `halcy-case-ai-chat-logs.zip`.

## What is in the zip

| File | What it is |
| ---- | ---------- |
| `halcy-case-*.md` | One readable file per session: every message from the developer or another session, every Claude reply, and each tool call by its one-line description, with UTC times |
| `raw/*.jsonl` | The Claude Code transcripts as written, one per session |
| `raw/subagents/` | The subagent that built the blind test hotel (Gasthof Alpenblick) from the starter README only |

All work used Claude Code (Claude Fable 5.1 and Claude Opus 5.5) in four
sessions on one machine that talked to each other with cross-session messages.
The transcripts were scanned for API keys before export; none were found. Card
numbers in them are the mock's two test cards.

## The four sessions

| Session | Transcript | Did |
| ------- | ---------- | --- |
| halcy-case-2b | `2404b99b…` | Agent architecture and scaffolding, the chat wiring, scoring, model choice and measurements, currency handling, the accepted-price-rise fix, the limit on the final total, typed answers to button questions, speed (objective reuse, session cache, parallel search wiring), the concise chat, the design document |
| halcy-case-fc | `0edd0983…` | The payment hand-off as a fixed code sequence, the `PageDriver` seam, the WebView plan, payment failure paths against the mock, the hold clock, the browser kept out of sight, parallel headless search, the activity log, language-free card-field redaction, the reachability check, the closing note and the documentation reviews |
| halcy-case-60 | `5e8d9023…` | Store, CI and the run-log audit, the scenario pack and grader, the second mock hotel (Villa Aurora), estimates in the traveller's currency, the blind unseen-hotel rehearsal (Gasthof Alpenblick) and the search fixes it led to |
| halcy-case-8c | `bf84602b…` | Orchestrator of the other three from about 15:15 HKT: status, merge order, routing findings to the session that owned the code, the time log and its breaks, small fixes (`npm run dev`, chat cards cut off, timestamps) |

## Where the tools were wrong

`docs/closing-note.md` lists the cases that mattered most. Searching the
readable files for "reasoning_extraction", "overwrote", "too close to call" or
"not on the page you read" finds several of them in context.
