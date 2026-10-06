// Renders one scenario run as Markdown for a person to read: the verdict,
// what the agent asked, what it chose and why, and how the models reasoned.

import type { Check } from "./grade.ts";
import { passed } from "./grade.ts";
import type { Outcome } from "./outcome.ts";
import type { Scenario } from "./types.ts";

const mark = (c: Check) => (c.pass ? "pass" : c.level === "must" ? "**FAIL**" : "miss");
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
const quote = (text: string) => text.split("\n").map((l) => `> ${l}`).join("\n");

export function renderReport(s: Scenario, o: Outcome, checks: Check[], runDir: string): string {
  const out: string[] = [];
  out.push(`# ${s.id}: ${passed(checks) ? "PASS" : "FAIL"}`, "", s.title, "", `**Why this case:** ${s.why}`, "", "**The traveller wrote:**", "", quote(s.message), "");

  out.push("## Checks", "", "| Level | Check | Result | Detail |", "| --- | --- | --- | --- |");
  for (const c of checks) out.push(`| ${c.level} | ${cell(c.name)} | ${mark(c)} | ${cell(c.detail)} |`);

  out.push("", "## What the agent understood", "");
  out.push(o.goal ? `${o.goal.adults ?? "?"} adult(s), ${o.goal.checkin ?? "?"} to ${o.goal.checkout ?? "?"}. Must have: ${(o.goal.mustHave ?? []).join("; ") || "nothing"}. Prefers: ${(o.goal.preferences ?? []).join("; ") || "nothing"}.` : "No goal was set.");

  out.push("", "## Questions it asked", "");
  if (!o.questions.length) out.push("None.");
  for (const q of o.questions) {
    out.push(`- ${q.approval ? "**Approval card.**" : "**Follow-up.**"} ${cell(q.question)}`);
    if (q.buttons.length) out.push(`  - Buttons: ${q.buttons.map(cell).join(" / ")}`);
    out.push(`  - Traveller answered: ${cell(q.answer) || "(nothing)"}`);
  }

  out.push("", "## Candidates", "");
  if (!o.candidates.length) out.push("None recorded.");
  else {
    out.push("| Id | Room | Rate | Total | Cancellable | Breakfast | Verdict |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const c of o.candidates) {
      const f = c.features;
      const verdict = c.id === o.approvedId ? "**approved by the traveller**" : c.rejected ? `rejected: ${c.rejected.slice(0, 140)}` : "feasible";
      out.push(`| ${cell(c.id)} | ${cell(f.room_name)} | ${cell(f.rate_name)} | ${cell(f.price_total)} | ${cell(f.cancellable)} | ${cell(f.breakfast_included)} | ${cell(verdict)} |`);
    }
  }

  out.push("", "## What the agent said", "");
  for (const text of o.said) out.push(quote(text), "");

  out.push("## How the models reasoned", "");
  if (!o.reasoning.length) out.push("No model text was logged for this run.");
  for (const r of o.reasoning) out.push(`**${r.role}:** ${r.said.slice(0, 900)}${r.said.length > 900 ? " [...]" : ""}`, "");

  out.push("## Numbers", "", `${o.turns} model turns, ${o.outputTokens} output tokens, ${o.wallSeconds} s. Run log: \`${runDir}\`.`, "");
  return out.join("\n");
}

export function renderSummary(rows: { scenario: Scenario; outcome: Outcome; checks: Check[] }[]): string {
  const out = ["# Scenario run", "", "| Scenario | Result | Outcome | Approved | Follow-ups | Failed must-checks | Missed should-checks |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (const { scenario, outcome, checks } of rows) {
    const failed = checks.filter((c) => c.level === "must" && !c.pass).map((c) => c.name);
    const missed = checks.filter((c) => c.level === "should" && !c.pass).map((c) => c.name);
    const followUps = outcome.questions.filter((q) => !q.approval).length;
    out.push(`| ${scenario.id} | ${passed(checks) ? "PASS" : "**FAIL**"} | ${outcome.kind} | ${cell(outcome.approvedId ?? "")} | ${followUps} | ${cell(failed.join("; "))} | ${cell(missed.join("; "))} |`);
  }
  return out.join("\n") + "\n";
}
