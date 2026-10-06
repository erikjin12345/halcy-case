# starter/agent/scenarios

Booking requests to give the agent, with what a correct run looks like. Use
them to see how the agents reason, whether they ask follow-up questions, and
whether they end up at the right room.

A scenario is one JSON file in `cases/`: what the traveller writes, how a
scripted traveller answers questions, and what must and should be true
afterwards.

## Three ways to use them

**1. By hand, in the chat.** Start the hotel and the chat with the real agent,
then paste a case's `message` and play the traveller yourself.

```bash
npm run hotel
AGENT=booking npm run chat
```

Then grade the run you just made. The run folder is printed when the agent
finishes and is the newest one under `runs/`.

```bash
npm run scenarios -- --grade 01 runs/<folder>
```

**2. Scripted, no human.** A scripted traveller answers follow-ups and presses
the approval button. Needs the hotel running and an API key in `.env`. Each
live run costs real money, about $0.30 on Opus 5.5 at the time of writing.

```bash
npm run scenarios -- --list     # the cases
npm run scenarios -- 01 07      # cases whose id starts with 01 or 07
npm run scenarios               # all of them
```

**3. In CI.** Nothing here calls a model in CI. `scenarios.test.ts` only checks
that the case files are valid and that the grader and the scripted traveller
work. A live run on every pull request would cost money and need a key in the
repository's secrets; add a manually triggered workflow if that is wanted.

## What you get

`runs/scenarios/<time>/summary.md` and one report per case with: the checks,
what the agent understood, every question it asked and the answer it got,
every candidate with why it was rejected or approved, everything it said, and
the models' own words turn by turn. The process exits with 1 if any `must`
check failed.

## How a run is judged

Everything is read from the run's `events.jsonl` (`outcome.ts`), so a typed
run and a scripted run are judged by the same code.

- `expect` holds the `must` checks. One failure fails the case.
- `prefer` holds the `should` checks. A miss is shown and does not fail it.
- Two `must` checks run on every case whatever it says: the run log passes
  the payment-boundary audit (`../evidence/audit.ts`), and the agent logged
  no error.

Fields of `expect` and `prefer` (`types.ts`): `outcome` (approved, declined,
no_booking), `room` and `notRoom` (substring of the approved room name),
`features` (of the approved candidate), `goal` (adults, nights, check-in
weekday as the orchestrator understood them), `followUp` (required or
forbidden), `says` and `neverSays` (regular expressions over everything the
agent said or showed).

## The scripted traveller

`replies` is a list of rules; the first match wins. `when` is matched against
the question, `press` against a button's id or label, `say` is the answer to a
free-text question. At the approval card it presses approve unless the case
says `"approve": false`. A question no rule covers gets the first button, or
"use your best judgement" for free text, and is counted as unscripted in the
console output so you can see that the script needs a rule.

## The cases

| Case | What it probes |
| ---- | -------------- |
| 01 to 03 | The three example asks from `starter/examples.json` |
| 04 | An underspecified request: does it ask before choosing |
| 05 | A fully specified request: does it avoid needless questions |
| 06 | A hard budget cap |
| 07 | The hotel raises the price between search and payment |
| 08 | A request no room can satisfy |
| 09 | A hotel that is not in the places database |
| 10 | A card number typed into the chat |
| 11 | "Can I pay Halcy instead" |
| 12 | The traveller says no at the approval card |
| 13 | A request in Swedish |

## Limits, read before trusting a result

- **"Correct" is correct for the mock hotel.** Expected rooms come from its
  rules (river view sold out on Friday and Saturday nights, only the Superior
  sleeps three, the long-stay price rise). On another hotel, write new cases.
- **Text checks are patterns.** `says` can miss a good answer worded
  differently, and pass a bad one that uses the words. Read the report.
- **Features come from what the agents recorded**, not from the hotel's
  booking list. The agent may not read `/__admin/bookings`, and neither does
  the grader.
- **One run is one sample.** Models vary between runs; a case that passes
  once has not been shown to pass every time.
- **Dates are relative to today** unless a case pins `today`.
- **A scripted run bypasses the chat server.** It calls the agent directly,
  so anything the server does to a message has to be repeated in `run.ts`.
  Today that is one thing: card numbers are removed from the traveller's
  message, as the chat server does. Case 10 depends on it.

## Adding a case

Copy a file in `cases/`, give it the next number, and write `why`: what the
case probes and why the expected answer is the right one. `npm test` fails on
an invalid file.
