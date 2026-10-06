# test-hotels

Hotel sites the agent has never been tuned against, to rehearse the debrief's
unseen hotel (BRIEF.md: "Your agent has to work on hotel sites it has never
seen. At the debrief we'll run it on one.").

## Adding one

1. A folder `test-hotels/<name>/` with a `server.mjs` that serves the hotel
   and its payment provider on `localhost`, and a `hotel.json` with the
   hotel's port: `{ "port": 4600 }`. Pick ports nothing else uses (taken:
   4100/4101 Casa Halcy, 4500/4501 Villa Aurora, 4200 the chat).
2. One line in `starter/hotels.json`: `"Hotel name": "http://localhost:4600"`.
   That is all the debrief will do, so nothing else in the agent may change.
3. `npm run dev` starts every hotel here along with the two mock hotels and
   the chat. To keep the main chat on 4200 free, run this branch's chat on
   its own port: `CHAT_PORT=4210 npm run dev`, then open
   http://localhost:4210.

## Rules

- Build a hotel without reading `starter/agent/` (prompts, tools, cases), so
  it is a fair test, and do not tune the agent to it afterwards.
- Use the two test cards only (`4242 4242 4242 4242`, `4000 0000 0000 0002`).
- Record what happened in `docs/limitations/` before fixing anything.
