// Runs scenarios against the real agent with a scripted traveller, or grades
// a run you made by hand in the chat. Costs real API money per live run.
//
//   npm run scenarios                      every case, live
//   npm run scenarios -- 01 05             cases whose id starts with 01 or 05
//   npm run scenarios -- --list            list the cases, run nothing
//   npm run scenarios -- --grade <case id> <run dir>
//
// Live runs need the mock hotel (`npm run hotel`) and an API key in .env.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, Context } from "../../types.ts";
import { redactCardNumbers } from "../evidence/card-number.ts";
import { grade, passed, type Check } from "./grade.ts";
import { loadScenarios } from "./load.ts";
import { readOutcome, type Outcome } from "./outcome.ts";
import { renderReport, renderSummary } from "./report.ts";
import { scriptedChat } from "./scripted-chat.ts";
import type { Scenario } from "./types.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const runDirs = () => (existsSync("runs") ? readdirSync("runs").filter((d) => existsSync(join("runs", d, "events.jsonl"))) : []);

/** Runs one scenario and returns the folder the agent logged to. */
export async function runScenario(agent: Agent, s: Scenario, ctx: Context): Promise<{ runDir: string; unscripted: string[] }> {
  const before = new Set(runDirs());
  const { chat, asked } = scriptedChat(s);
  // The chat server removes card numbers from what the traveller types before
  // anything reads it. A scripted run bypasses the server, so do the same here.
  const message = redactCardNumbers(s.message).data;
  await agent(message, chat, { ...ctx, today: s.today ?? ctx.today });
  const created = runDirs().filter((d) => !before.has(d)).sort();
  if (!created.length) throw new Error(`${s.id}: the agent wrote no run log`);
  return { runDir: join("runs", created[created.length - 1]), unscripted: asked.filter((a) => !a.scripted).map((a) => `${a.question} -> ${a.answer}`) };
}

function judge(s: Scenario, runDir: string): { outcome: Outcome; checks: Check[] } {
  const outcome = readOutcome(readFileSync(join(runDir, "events.jsonl"), "utf8"));
  return { outcome, checks: grade(s, outcome) };
}

async function main(args: string[]): Promise<number> {
  if (args[0] === "--list") {
    for (const s of loadScenarios()) console.log(`${s.id.padEnd(34)} ${s.title}`);
    return 0;
  }
  const outDir = join("runs", "scenarios", new Date().toISOString().replace(/[:.]/g, "-"));
  const rows: { scenario: Scenario; outcome: Outcome; checks: Check[] }[] = [];
  const finish = (s: Scenario, runDir: string, unscripted: string[] = []) => {
    const note = unscripted.length ? `  (${unscripted.length} question(s) answered by the fallback)` : "";
    const { outcome, checks } = judge(s, runDir);
    rows.push({ scenario: s, outcome, checks });
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${s.id}.md`), renderReport(s, outcome, checks, runDir, unscripted));
    console.log(`${passed(checks) ? "PASS" : "FAIL"}  ${s.id}  ${outcome.kind}${outcome.approvedId ? ` ${outcome.approvedId}` : ""}${note}`);
    for (const c of checks.filter((c) => !c.pass)) console.log(`      ${c.level}: ${c.name} (${c.detail})`);
  };

  if (args[0] === "--grade") {
    const [s] = loadScenarios([args[1] ?? ""]);
    if (!s || !args[2] || !existsSync(join(args[2], "events.jsonl"))) throw new Error("usage: --grade <case id> <run dir with events.jsonl>");
    finish(s, args[2]);
  } else {
    const scenarios = loadScenarios(args);
    if (!scenarios.length) throw new Error(`no case matches ${args.join(", ")}`);
    const ctx: Context = { traveller: read("../../traveller.json"), today: new Date().toISOString().slice(0, 10), hotels: read("../../hotels.json") };
    // Only the hotels the selected cases name have to be up.
    const named = Object.entries(ctx.hotels).filter(([name]) => scenarios.some((s) => s.message.toLowerCase().includes(name.toLowerCase())));
    for (const [name, url] of named) await fetch(url).catch(() => Promise.reject(new Error(`cannot reach ${name} at ${url}: start it with \`npm run hotel\` or \`npm run hotel2\``)));
    process.env.HEADLESS ??= "1";
    const { bookingAgent } = await import("../index.ts");
    for (const s of scenarios) {
      console.log(`...   ${s.id}`);
      const { runDir, unscripted } = await runScenario(bookingAgent, s, ctx);
      finish(s, runDir, unscripted);
    }
  }
  writeFileSync(join(outDir, "summary.md"), renderSummary(rows));
  console.log(`\n${rows.filter((r) => passed(r.checks)).length} of ${rows.length} passed. Reports: ${outDir}`);
  return rows.every((r) => passed(r.checks)) ? 0 : 1;
}

if (process.argv[1]?.endsWith("run.ts")) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => (console.error(String(e instanceof Error ? e.message : e)), process.exit(2)),
  );
}
