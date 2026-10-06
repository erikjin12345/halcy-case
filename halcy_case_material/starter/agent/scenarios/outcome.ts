// Reads what happened in a run from its events.jsonl. Pure: the same code
// grades a scripted run and a run someone typed into the chat by hand.

import { auditEvents, type Violation } from "../evidence/audit.ts";
import { isApprovalCard } from "./scripted-chat.ts";

type Event = { type: string; at?: string } & Record<string, unknown>;
type Features = Record<string, unknown>;

export interface Question {
  kind: "buttons" | "text";
  question: string;
  buttons: string[];
  answer: string;
  approval: boolean;
}

export interface Outcome {
  kind: "approved" | "declined" | "no_booking";
  approvedId: string | null;
  /** Features of the approved candidate, from the final store snapshot. */
  approved: Features | null;
  goal: { checkin?: string; checkout?: string; adults?: number; mustHave?: string[]; preferences?: string[] } | null;
  candidates: { id: string; features: Features; rejected?: string }[];
  questions: Question[];
  /** Everything the agent said or showed, in order. */
  said: string[];
  /** The models' own words per turn, for reading how they reasoned. */
  reasoning: { role: string; said: string }[];
  errors: string[];
  turns: number;
  outputTokens: number;
  wallSeconds: number;
  audit: Violation[];
  /** Times a browser agent (search or validation) was started while another was still running on the one page. */
  overlaps: number;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const lines = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const flat = (features: unknown): Features =>
  Object.fromEntries(Object.entries((features ?? {}) as Record<string, unknown>).map(([k, v]) => [k, v && typeof v === "object" && "value" in v ? (v as { value: unknown }).value : v]));

export function parseEvents(raw: string): Event[] {
  return raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Event);
}

export function readOutcome(raw: string): Outcome {
  const events = parseEvents(raw);
  const of = (type: string) => events.filter((e) => e.type === type);
  const last = (type: string) => of(type).at(-1);

  const questions: Question[] = [];
  const said: string[] = [];
  let pending: Question | null = null;
  for (const e of events) {
    if (e.type === "chat.say") said.push(str(e.text));
    if (e.type === "chat.card" || e.type === "chat.ask") said.push([str(e.title), ...lines(e.lines)].join("\n"));
    if (e.type === "chat.ask") {
      const buttons = (e.buttons as { id: string; label: string }[] | undefined) ?? [];
      pending = { kind: "buttons", question: said.at(-1) ?? "", buttons: buttons.map((b) => b.label), answer: "", approval: isApprovalCard(buttons) };
      questions.push(pending);
    }
    if (e.type === "chat.answer" && pending) pending.answer = str(e.pressed);
    if (e.type === "chat.reply") questions.push({ kind: "text", question: said.at(-1) ?? "", buttons: [], answer: str(e.text), approval: false });
  }

  // One browser, one page: a second search or validation started before the first finished is driving the same page.
  let running = 0;
  let overlaps = 0;
  for (const e of events) {
    if (e.role !== "search" && e.role !== "validation") continue;
    if (e.type === "llm.start" && running++ > 0) overlaps++;
    if (e.type === "llm.done") running = Math.max(0, running - 1);
  }

  const snapshot = last("state.snapshot") as { candidates?: { id: string; features: unknown }[]; rejected?: { candidateId: string; reason: string }[] } | undefined;
  const rejected = new Map((snapshot?.rejected ?? []).map((r) => [r.candidateId, r.reason]));
  const fromSnapshot = (snapshot?.candidates ?? []).map((c) => ({ id: c.id, features: flat(c.features), rejected: rejected.get(c.id) }));
  const fromAdds = of("candidate.add").map((e) => ({ id: str(e.id), features: flat(e.features) }));
  const candidates = fromSnapshot.length ? fromSnapshot : fromAdds;

  const approvedId = str(last("traveller.approved")?.candidateId) || null;
  const kind = approvedId ? "approved" : questions.some((q) => q.approval) ? "declined" : "no_booking";
  const goal = last("goal.set") as Outcome["goal"] | undefined;
  const first = Date.parse(events[0]?.at ?? "");
  const end = Date.parse(events.at(-1)?.at ?? "");

  return {
    kind,
    approvedId,
    approved: candidates.find((c) => c.id === approvedId)?.features ?? null,
    goal: goal ?? null,
    candidates,
    questions,
    said,
    reasoning: of("llm.turn").filter((e) => str(e.said)).map((e) => ({ role: str(e.role), said: str(e.said) })),
    errors: of("error").map((e) => str(e.error) || str(e.reason)),
    turns: of("llm.turn").length,
    outputTokens: of("llm.done").reduce((n, e) => n + Number(e.outputTokens ?? 0), 0),
    wallSeconds: Number.isFinite(end - first) ? Math.round((end - first) / 1000) : 0,
    audit: auditEvents(raw.split("\n")),
    overlaps,
  };
}
