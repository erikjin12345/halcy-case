# docs

Everything to be submitted besides the code, per
`halcy_case_material/BRIEF.md`. Time budget is tracked in `TIME-LOG.md`.

## Deliverables

| File (planned)     | Content                                                                                   | Status      |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------- |
| `design.md`        | The design document, about 4 pages plus diagrams                                          | not started |
| `money-flow.*`     | The diagram from question 2: how card details and money move, and where Halcy stays out   | not started |
| `closing-note.md`  | What we deliberately left out, what we are least sure about, what we would build next     | not started |
| `ai-chat-logs/`    | Exports or screenshots of AI chats during the work                                        | ongoing     |
| `runs/`            | Selected run logs from `halcy_case_material/runs/` that we want to show                   | later       |
| `TIME-LOG.md`      | Session start, deadline and where the hours went                                          | started     |
| `infrastructure.md` | Where the agents run: local for the prototype, GCP layout for the design document        | done        |
| `concerns.md`      | Register of everything flagged so far, with status; feeds the closing note                | ongoing     |
| `research/`        | Source documents brought in by the developer, kept verbatim                               | reference   |

## The design document must cover

1. **Model selection.** Which models do which jobs, why, cost per booking,
   what happens when a model is wrong, and what we measure to know the choice
   was right.
2. **Staying out of payments.** Who sees the card number, who holds the money
   and when, who proves the traveller agreed. What change would pull Halcy in,
   and where we are unsure.
3. **The user journey.** From chat message to confirmation, including: the
   room is gone, the price moved, the card is declined, the bank wants to
   verify, the traveller goes quiet.
4. **Architecture.** What runs where, step by step when a booking runs.
5. **Failure modes.** What can go wrong, how we detect it, what the traveller
   sees.
6. **Test plan.** What we test against before launch and which numbers we look
   at.

## The debrief (60 min)

- Live run in the chat on requests they choose, including an unseen hotel.
- Draw the money flow on a whiteboard.
- Defend model choices and cost per booking.
- Walk through every point where the flow can fail.
- Go through the AI chat logs: what we asked, what the tools got wrong, what
  we overruled.
