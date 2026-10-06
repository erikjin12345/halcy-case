# Final regression, 2026-10-06

Eight scenario cases run once each, headless, on `main` at `103a75c` (all PRs
up to #66), with the scripted traveller. Search on Sonnet 5.5, the other roles
on Opus 5.5. Time is from the traveller's first message to approval of the
booking card; cost is model spend for the run. Reports:
`runs/scenarios/2026-10-06T13-02-31-578Z` and, for the re-run of case 07,
`runs/scenarios/2026-10-06T13-14-28-277Z`.

| Case | What it checks | Result | Time | Cost |
| --- | --- | --- | --- | --- |
| 01 | Example ask 1: weekend, river view sold out, fallback | pass | 83 s | $0.22 |
| 02 | Example ask 2: three adults, cheapest | pass | 72 s | $0.22 |
| 03 | Example ask 3: one person, Classic Double, late arrival | pass | 95 s | $0.28 |
| 07 | Price rise on a long stay, accepted | **fail, then pass** | 98 s / 160 s | $0.29 / $0.40 |
| 10 | Card number typed into the chat | pass | 77 s | $0.23 |
| 20 | Villa Aurora, unseen layout, pounds | pass | 74 s | $0.21 |
| 24 | Budget in kronor against pound prices | pass | 76 s | $0.21 |
| 28 | The user's own ask, cheapest across two currencies | pass | 86 s | $0.27 |

Total for the nine runs: about $2.53.

**The one failure.** Case 07 reached approval with the right room and the
accepted price, but failed its check that the traveller was told the price
went up. The traveller was told: the code-made card read "Casa Halcy's price
has gone up / Room when I found it: €928.00 / Room now, on Casa Halcy's own
payment page: €1000.00". That card was logged only as `price.ask`, and the
grader reads `chat.ask` and `chat.card`. Before PR #64 the orchestrator also
said it in its own words, which hid the gap. Fix in this PR: the code-made
price-change and over-limit cards are also logged as `chat.ask`. Re-run of
case 07 after the fix: pass.
