// npm run traps -- <run folder> [more]      one line per trap per run
// npm run traps -- --markdown <folders>     the same as a Markdown matrix
// Reads each run's events.jsonl and, where the run booked, the hotel's own
// /__admin/bookings record. This is the developer's check, run after the
// fact; the agent never reads that record. Exit code 1 if any trap fails.

import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fetchAdmin } from "./admin.ts";
import { checkTraps, failed, type TrapResult } from "./traps.ts";

type Event = { type: string } & Record<string, unknown>;

/** The hotel the run booked at, else the one it ended on. */
export function hotelOrigin(events: Event[]): string | null {
  const start = events.filter((e) => e.type === "handoff.start").at(-1);
  const where = start?.where as { origin?: string } | undefined;
  if (where?.origin) return where.origin;
  const goal = events.filter((e) => e.type === "goal.set").at(-1)?.hotel as { url?: string } | undefined;
  try {
    return goal?.url ? new URL(goal.url).origin : null;
  } catch {
    return null;
  }
}

export async function trapsForRun(dir: string): Promise<TrapResult[]> {
  const raw = readFileSync(join(dir, "events.jsonl"), "utf8");
  const lines = raw.split("\n");
  const events = lines.filter((l) => l.trim()).map((l) => JSON.parse(l) as Event);
  const origin = hotelOrigin(events);
  const admin = origin ? await fetchAdmin(origin) : null;
  return checkTraps({ events, lines, admin });
}

async function main(args: string[]): Promise<number> {
  const markdown = args[0] === "--markdown";
  const dirs = (markdown ? args.slice(1) : args).filter((d) => existsSync(join(d, "events.jsonl")));
  if (!dirs.length) throw new Error("usage: npm run traps -- [--markdown] <run folder with events.jsonl> [more]");
  let anyFail = false;
  const rows: { run: string; results: TrapResult[] }[] = [];
  for (const dir of dirs) {
    const results = await trapsForRun(dir);
    anyFail ||= failed(results).length > 0;
    rows.push({ run: basename(dir), results });
    if (!markdown) {
      console.log(basename(dir));
      for (const r of results) console.log(`  ${r.verdict.padEnd(4)} trap ${r.trap.padEnd(7)} ${r.name}: ${r.evidence}`);
    }
  }
  if (markdown) {
    const traps = rows[0].results.map((r) => `${r.trap} ${r.name}`);
    console.log(`| Run | ${traps.join(" | ")} |\n| --- |${traps.map(() => " --- |").join("")}`);
    for (const { run, results } of rows) console.log(`| \`${run}\` | ${results.map((r) => r.verdict).join(" | ")} |`);
    console.log("");
    for (const { run, results } of rows) {
      const notable = results.filter((r) => r.verdict !== "PASS");
      if (notable.length) console.log(`- \`${run}\`: ${notable.map((r) => `trap ${r.trap} ${r.verdict}: ${r.evidence}`).join("; ")}`);
    }
  }
  return anyFail ? 1 : 0;
}

if (process.argv[1]?.endsWith("traps-cli.ts")) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => (console.error(String(e instanceof Error ? e.message : e)), process.exit(2)),
  );
}
