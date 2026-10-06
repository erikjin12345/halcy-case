// Runs in CI without a model: the case files are valid, the scripted
// traveller follows its script, and the grader reads a run log correctly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { grade, passed } from "./grade.ts";
import { loadScenarios } from "./load.ts";
import { readOutcome } from "./outcome.ts";
import { FALLBACK_SAY, ScriptExhausted, scriptedChat } from "./scripted-chat.ts";

const ev = (type: string, data: Record<string, unknown> = {}, at = "2026-10-06T10:00:00.000Z") => JSON.stringify({ at, type, ...data });
const cand = (id: string, room: string, cancellable: boolean) => ({ id, features: { room_name: { value: room }, cancellable: { value: cancellable }, breakfast_included: { value: false } } });
const APPROVAL = { title: "Continue to payment?", lines: ["Superior Double, Flexible."], buttons: [{ id: "approve", label: "Continue to payment" }, { id: "stop", label: "Not now" }] };

/** A run shaped like a real one: one follow-up, a sold-out river room, the Superior approved. */
const goodRun = [
  ev("message", { message: "book us a room" }),
  ev("chat.ask", { title: "Quick check", lines: ["How many adults?"], buttons: [{ id: "2", label: "2 adults" }] }),
  ev("chat.answer", { pressed: "2" }),
  ev("goal.set", { checkin: "2026-11-13", checkout: "2026-11-15", adults: 2 }),
  ev("llm.turn", { role: "search", said: "River view is gone, Superior is next best." }),
  ev("chat.say", { text: "The River-View Double is sold out for those dates." }),
  ev("chat.ask", APPROVAL),
  ev("chat.answer", { pressed: "approve" }),
  ev("traveller.approved", { candidateId: "superior-flex" }),
  ev("state.snapshot", { candidates: [cand("superior-flex", "Superior Double", true), cand("river", "River-View Double", true)], rejected: [{ candidateId: "river", reason: "sold out" }] }),
  ev("done", {}, "2026-10-06T10:02:30.000Z"),
].join("\n");

test("every case file is valid, uniquely named, and its patterns compile", () => {
  const all = loadScenarios();
  assert.ok(all.length >= 10);
  assert.equal(new Set(all.map((s) => s.id)).size, all.length);
  for (const s of all) {
    const patterns = [...s.replies.flatMap((r) => [r.when, r.press ?? ""]), ...(s.expect.says ?? []), ...(s.expect.neverSays ?? []), ...(s.prefer?.says ?? []), ...(s.prefer?.neverSays ?? [])];
    for (const p of patterns) assert.doesNotThrow(() => new RegExp(p, "i"), `${s.id}: /${p}/`);
    assert.ok(s.why.length > 40, `${s.id}: say why the expected answer is correct`);
  }
  assert.deepEqual(loadScenarios(["01"]).map((s) => s.id), ["01-weekend-river-fallback"]);
});

test("the outcome is read from the run log", () => {
  const o = readOutcome(goodRun);
  assert.equal(o.kind, "approved");
  assert.equal(o.approvedId, "superior-flex");
  assert.equal(o.approved?.room_name, "Superior Double");
  assert.deepEqual(o.questions.map((q) => [q.approval, q.answer]), [[false, "2"], [true, "approve"]]);
  assert.equal(o.candidates.find((c) => c.id === "river")?.rejected, "sold out");
  assert.equal(o.wallSeconds, 150);
  assert.deepEqual(o.reasoning, [{ role: "search", said: "River view is gone, Superior is next best." }]);
});

test("example ask 1 passes on the good run and fails when the wrong room is approved", () => {
  const [s] = loadScenarios(["01"]);
  const good = grade(s, readOutcome(goodRun));
  assert.ok(passed(good), good.filter((c) => !c.pass).map((c) => c.name).join("; "));
  assert.equal(good.find((c) => c.name === "says /tax/")?.level, "should", "a missed preference does not fail the case");

  const wrong = grade(s, readOutcome(goodRun.replace(/superior-flex/g, "x").replace("Superior Double\"", "Classic Double\"")));
  assert.equal(passed(wrong), false);
  assert.ok(wrong.some((c) => c.name === 'room contains "superior"' && !c.pass));
});

test("declined, no booking, a crash and a card number in the log are told apart", () => {
  const upTo = (type: string) => goodRun.split("\n").slice(0, goodRun.split("\n").findIndex((l) => l.includes(`"${type}"`))).join("\n");
  assert.equal(readOutcome(upTo("traveller.approved")).kind, "declined");
  assert.equal(readOutcome(upTo("llm.turn")).kind, "no_booking");
  const crashed = grade({ expect: {} }, readOutcome(`${goodRun}\n${ev("error", { error: "boom" })}`));
  assert.equal(passed(crashed), false);
  const leaked = grade({ expect: {} }, readOutcome(`${goodRun}\n${ev("chat.say", { text: "card 4242 4242 4242 4242" })}`));
  assert.ok(leaked.some((c) => c.name.includes("audit") && !c.pass));
});

test("follow-up expectations count questions other than the approval card", () => {
  const o = readOutcome(goodRun);
  assert.ok(grade({ expect: { followUp: "required" } }, o).every((c) => c.pass));
  assert.equal(passed(grade({ expect: { followUp: "forbidden" } }, o)), false);
});

test("the scripted traveller answers from its rules, approves or declines, and falls back visibly", async () => {
  const rules = [{ when: "adult", press: "^2$" }, { when: "cancel", say: "Yes, cancellable." }];
  const yes = scriptedChat({ replies: rules, approve: true });
  assert.equal(await yes.chat.choose({ title: "How many adults?", buttons: [{ id: "1", label: "1 adult" }, { id: "2", label: "2 adults" }] }), "2");
  yes.chat.say("Do you need to be able to cancel?");
  assert.equal(await yes.chat.reply(), "Yes, cancellable.");
  assert.equal(await yes.chat.choose(APPROVAL), "approve");
  yes.chat.say("What is your favourite colour?");
  assert.equal(await yes.chat.reply(), FALLBACK_SAY);
  assert.equal(await yes.chat.choose({ title: "Sea or hills?", buttons: [{ id: "sea", label: "Sea" }, { id: "hills", label: "Hills" }] }), "sea");
  assert.deepEqual(yes.asked.map((a) => [a.scripted, a.approval]), [[true, false], [true, false], [true, true], [false, false], [false, false]]);

  const no = scriptedChat({ replies: [], approve: false });
  assert.equal(await no.chat.choose(APPROVAL), "stop");
});

test("an unscripted question never commits the traveller: the way out is taken when there is one", async () => {
  // Seen in a real run: the agent wrongly said Flexible could not be booked and offered this card.
  const { chat, asked } = scriptedChat({ replies: [], approve: true });
  const pressed = await chat.choose({ title: "Flexible isn't bookable. What next?", buttons: [{ id: "pay_saver", label: "Book the Saver rate anyway" }, { id: "stop", label: "Stop, I'll check with the hotel first" }] });
  assert.equal(pressed, "stop");
  assert.equal(asked[0].scripted, false);
});

test("two browser agents on the one page at the same time fail the run", () => {
  const start = (role: string) => ev("llm.start", { role });
  const done = (role: string) => ev("llm.done", { role });
  const inTurn = [start("orchestrator"), start("search"), done("search"), start("validation"), done("validation"), done("orchestrator")].join("\n");
  assert.equal(readOutcome(inTurn).overlaps, 0);
  const together = [start("orchestrator"), start("validation"), start("validation"), done("validation"), done("validation")].join("\n");
  assert.equal(readOutcome(together).overlaps, 1);
  // Parallel search: each hotel in its own browser is not an overlap; two searches of one hotel are.
  const s = (type: string, hotel: string) => ev(type, { role: "search", hotel });
  const twoHotels = [s("llm.start", "Casa Halcy"), s("llm.start", "Villa Aurora"), s("llm.done", "Casa Halcy"), s("llm.done", "Villa Aurora")].join("\n");
  assert.equal(readOutcome(twoHotels).overlaps, 0);
  const sameHotel = [s("llm.start", "Casa Halcy"), s("llm.start", "Casa Halcy")].join("\n");
  assert.equal(readOutcome(sameHotel).overlaps, 1);
  assert.ok(grade({ expect: {} }, readOutcome(together)).some((c) => c.name === "one browser agent at a time" && !c.pass));
});

test("example ask 3 fails when the traveller ends on the non-refundable rate", () => {
  const [s] = loadScenarios(["03"]);
  const run = (id: string, cancellable: boolean) =>
    [
      ev("goal.set", { checkin: "2026-10-12", checkout: "2026-10-15", adults: 1 }),
      ev("chat.ask", APPROVAL),
      ev("chat.answer", { pressed: "approve" }),
      ev("traveller.approved", { candidateId: id }),
      ev("state.snapshot", { candidates: [cand(id, "Classic Double", cancellable)] }),
    ].join("\n");
  assert.equal(passed(grade(s, readOutcome(run("classic-flex", true)))), true);
  assert.equal(passed(grade(s, readOutcome(run("classic-saver", false)))), false);
});

test("a follow-up rule never decides an approval card", async () => {
  // Seen in a real run: a rule for "insurance" pressed "Not now" on the approval card that said the insurance was unticked.
  const { chat } = scriptedChat({ replies: [{ when: "insurance", press: "^no(\\b|_)" }], approve: true });
  const card = { title: "Continue to payment?", lines: ["The pre-ticked insurance has been unticked."], buttons: [{ id: "continue", label: "Continue to payment" }, { id: "no", label: "Not now" }] };
  assert.equal(await chat.choose(card), "continue");
});

test("an agent that keeps asking is stopped", async () => {
  const { chat } = scriptedChat({ replies: [], approve: true }, 2);
  await chat.reply();
  await chat.reply();
  await assert.rejects(chat.reply(), ScriptExhausted);
});
