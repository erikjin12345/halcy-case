// The steps of a run, for the trace panel next to the chat: what each agent
// did, in one line each. Built only from the run log's own events, after
// GuardedLog has scrubbed them, so the panel can never show more than the log
// on disk. On top of that it shows nothing from the blind interval except that
// the traveller is paying, no typed values, and none of the traveller's own
// details.

import type { Traveller } from "../types.ts";
import { BLIND_END, BLIND_START } from "./evidence/log.ts";

export interface TraceStep {
  /** Who: orchestrator, search, validation, objective, payment, or the hotel. */
  who: string;
  /** One line. */
  text: string;
  /** More, shown when the line is expanded. */
  detail?: string;
  /** Milliseconds since the epoch, from the event. */
  at?: number;
}

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const pathOf = (url: unknown) => {
  try {
    const u = new URL(str(url));
    return u.origin + u.pathname;
  } catch {
    return "";
  }
};
const short = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const who = (d: Data, fallback: string) => [str(d.role) || fallback, str(d.hotel)].filter(Boolean).join(" · ");

/** Removes the traveller's name, email and phone from a text. */
export function withoutTraveller(text: string, t?: Traveller): string {
  if (!t) return text;
  let out = text;
  for (const v of [t.email, t.phone, `${t.first} ${t.last}`, t.last]) if (v && v.length > 2) out = out.split(v).join("[traveller]");
  return out;
}

function candidateLine(d: Data): string {
  const f = (d.features ?? {}) as Data;
  const parts = [str(f.room_name), str(f.rate_name)].filter(Boolean).join(", ");
  const price = f.price_total !== undefined ? ` ${String(f.price_total)} ${str(f.currency)}` : "";
  return `found ${parts || str(d.id)}${price}${f.cancellable === true ? ", cancellable" : f.cancellable === false ? ", non-refundable" : ""}`;
}

/** One trace step for a run-log event, or null if the event is not shown. `blind` is the log's state at that event. */
export function traceStep(type: string, data: Data, blind: boolean, traveller?: Traveller): TraceStep | null {
  const at = Date.parse(str(data.at)) || undefined;
  const step = (who: string, text: string, detail?: string): TraceStep => ({
    who,
    text: withoutTraveller(short(text), traveller),
    detail: detail ? withoutTraveller(short(detail, 1500), traveller) : undefined,
    at,
  });
  if (type === BLIND_START) return step("payment", "You are paying in the hotel's window. Nothing is read until you are done.");
  if (type === BLIND_END) return step("payment", "Back from the hotel's window; reading the hotel's page once.");
  if (blind) return null;
  switch (type) {
    case "llm.start":
      return step(who(data, "agent"), `started (${str(data.model)}${data.effort ? `, ${str(data.effort)} effort` : ""})`);
    case "llm.turn": {
      const said = str(data.said).trim();
      const tools = Array.isArray(data.tools) ? (data.tools as string[]).join(", ") : "";
      if (!said && !tools) return null;
      return step(who(data, "agent"), said ? said.split("\n")[0] : `→ ${tools}`, said ? [said, tools && `tools: ${tools}`].filter(Boolean).join("\n\n") : undefined);
    }
    case "llm.done":
      return step(who(data, "agent"), `done in ${String(data.turns ?? "?")} turns, ${String(data.outputTokens ?? "?")} output tokens`);
    case "observe":
      return step(who(data, "browser"), `read ${pathOf(data.url) || str(data.url)}`, str(data.title));
    case "goto":
      return step(who(data, "browser"), `went to ${pathOf(data.url) || str(data.url)}`);
    case "act":
      // Never the typed value: guest details are the traveller's.
      return step(who(data, "browser"), `${str(data.kind)} on ${pathOf(data.url) || "the page"}`);
    case "act.refused":
      return step(who(data, "browser"), `refused to ${str(data.kind)} outside the hotel's site`);
    case "search.start":
      return step(who(data, "search"), `searching ${str(data.url) ? pathOf(data.url) : str(data.hotel)}`);
    case "search.done":
      return step(who(data, "search"), `finished with ${String(data.candidates ?? "?")} candidates`, str(data.text));
    case "candidate.add":
      return step(who(data, "search"), candidateLine(data));
    case "candidate.refused":
      return step(who(data, "search"), `not recorded: ${str(data.id)}`, str(data.reason));
    case "candidates.scored": {
      const ranking = Array.isArray(data.ranking) ? (data.ranking as Data[]) : [];
      const rejected = Array.isArray(data.rejected) ? (data.rejected as Data[]) : [];
      const top = ranking[0];
      return step(
        who(data, "scoring"),
        top ? `ranked ${ranking.length}; best ${str(top.candidateId)} (score ${String(top.score)}, pass ${String(data.threshold)})` : "nothing to rank",
        [...ranking.map((r) => `${str(r.candidateId)}: ${String(r.score)}${r.feasible === false ? " (not feasible)" : ""}`), ...rejected.map((r) => `rejected ${str(r.candidateId)}: ${str(r.reason)}`)].join("\n"),
      );
    }
    case "validation.start":
      return step("validation", `checking ${str(data.candidateId)} on the live site`);
    case "validation.result":
      return step("validation", `${str(data.candidateId)} ${data.accepted ? "accepted" : "rejected"}`, (Array.isArray(data.reasons) ? (data.reasons as string[]) : []).join("\n"));
    case "validation.overruled":
      return step("validation", `overruled by code: ${str(data.candidateId)}`, (Array.isArray(data.conflicts) ? (data.conflicts as string[]) : []).join("\n"));
    case "fx.compare":
    case "fx.estimate":
      return step("orchestrator", str(data.text) || "currency estimate");
    case "trace.note":
      return step(str(data.from) || "orchestrator", str(data.text));
    case "traveller.approved":
      return step("orchestrator", `approved by the traveller: ${str(data.candidateId)}`);
    case "handoff.start":
      return step("payment", `handing over; hotel holds the room ${data.holdSecondsLeft !== undefined ? `${Math.round(Number(data.holdSecondsLeft) / 60)} min` : "for an unknown time"}`);
    case "payment.result":
      return step("payment", `outcome: ${str(data.status)}${data.reference ? `, reference ${str(data.reference)}` : ""}`, str(data.said));
    default:
      return null;
  }
}
