// Compares what happened (outcome.ts) with what a scenario expects. Pure.
// `must` checks decide pass or fail; `should` checks are shown but do not fail
// the scenario. Two must-checks run for every scenario whatever it expects:
// the run log passes the payment-boundary audit, and the agent did not crash.

import type { Outcome } from "./outcome.ts";
import type { Expectation, Scenario } from "./types.ts";

export interface Check {
  level: "must" | "should";
  name: string;
  pass: boolean;
  detail: string;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const has = (text: string, part: string) => text.toLowerCase().includes(part.toLowerCase());

function sameValue(expected: string | number | boolean, actual: unknown): boolean {
  if (typeof expected === "string") return has(String(actual ?? ""), expected);
  if (typeof expected === "number") return typeof actual === "number" && Math.abs(actual - expected) < 0.005;
  return actual === expected;
}

function checksFor(level: Check["level"], e: Expectation, o: Outcome): Check[] {
  const out: Check[] = [];
  const add = (name: string, pass: boolean, detail: string) => out.push({ level, name, pass, detail });
  const room = String(o.approved?.room_name ?? "");

  if (e.outcome) add(`outcome is ${e.outcome}`, o.kind === e.outcome, `was ${o.kind}${o.approvedId ? ` (${o.approvedId})` : ""}`);
  if (e.room) add(`room contains "${e.room}"`, has(room, e.room), room ? `approved room: ${room}` : "nothing was approved");
  if (e.notRoom) add(`room does not contain "${e.notRoom}"`, !has(room, e.notRoom), room ? `approved room: ${room}` : "nothing was approved");
  for (const [name, expected] of Object.entries(e.features ?? {})) {
    const actual = o.approved?.[name];
    add(`${name} is ${JSON.stringify(expected)}`, sameValue(expected, actual), o.approved ? `was ${JSON.stringify(actual)}` : "nothing was approved");
  }

  if (e.goal?.adults !== undefined) add(`goal has ${e.goal.adults} adult(s)`, o.goal?.adults === e.goal.adults, `was ${o.goal?.adults ?? "not set"}`);
  if (e.goal?.nights !== undefined) {
    const nights = o.goal?.checkin && o.goal.checkout ? Math.round((Date.parse(o.goal.checkout) - Date.parse(o.goal.checkin)) / 86_400_000) : null;
    add(`goal has ${e.goal.nights} night(s)`, nights === e.goal.nights, nights === null ? "goal not set" : `was ${nights} (${o.goal?.checkin} to ${o.goal?.checkout})`);
  }
  if (e.goal?.checkinWeekday) {
    const day = o.goal?.checkin ? WEEKDAYS[new Date(`${o.goal.checkin}T00:00:00Z`).getUTCDay()] : null;
    add(`check-in is a ${e.goal.checkinWeekday}`, day === e.goal.checkinWeekday, day ? `was ${day} ${o.goal?.checkin}` : "goal not set");
  }

  const followUps = o.questions.filter((q) => !q.approval);
  if (e.followUp === "required") add("asked a follow-up question", followUps.length > 0, `${followUps.length} asked`);
  if (e.followUp === "forbidden") add("asked no follow-up question", followUps.length === 0, followUps.map((q) => q.question.split("\n")[0]).join(" | ") || "none asked");

  const everything = o.said.join("\n");
  for (const pattern of e.says ?? []) add(`says /${pattern}/`, new RegExp(pattern, "i").test(everything), "searched everything the agent said or showed");
  for (const pattern of e.neverSays ?? []) {
    const hit = o.said.find((s) => new RegExp(pattern, "i").test(s));
    add(`never says /${pattern}/`, !hit, hit ? `said: ${hit.slice(0, 120)}` : "not said");
  }
  return out;
}

export function grade(scenario: Pick<Scenario, "expect" | "prefer">, o: Outcome): Check[] {
  const always: Check[] = [
    { level: "must", name: "run log passes the payment-boundary audit", pass: o.audit.length === 0, detail: o.audit.map((v) => `line ${v.line} ${v.rule}`).join("; ") || "clean" },
    { level: "must", name: "the agent did not crash", pass: o.errors.length === 0, detail: o.errors.join("; ").slice(0, 200) || "no error event" },
  ];
  return [...always, ...checksFor("must", scenario.expect, o), ...checksFor("should", scenario.prefer ?? {}, o)];
}

export const passed = (checks: Check[]): boolean => checks.every((c) => c.level !== "must" || c.pass);
