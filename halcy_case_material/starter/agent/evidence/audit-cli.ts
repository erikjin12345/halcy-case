// Run with: npx tsx starter/agent/evidence/audit-cli.ts [run dir ...]
// No arguments: every folder under runs/. Exit code 1 on any violation.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { auditEvents } from "./audit.ts";

const args = process.argv.slice(2);
const dirs = args.length
  ? args
  : existsSync("runs")
    ? readdirSync("runs")
        .map((d) => join("runs", d))
        .filter((d) => statSync(d).isDirectory())
    : [];

let failed = 0;
for (const dir of dirs) {
  const file = join(dir, "events.jsonl");
  if (!existsSync(file)) {
    console.log(`${dir}: no events.jsonl, skipped`);
    continue;
  }
  const violations = auditEvents(readFileSync(file, "utf8").split("\n"));
  if (violations.length === 0) {
    console.log(`${dir}: ok`);
    continue;
  }
  failed++;
  console.log(`${dir}: ${violations.length} violation(s)`);
  for (const v of violations) console.log(`  line ${v.line}  ${v.rule}  ${v.detail}`);
}
console.log(`${dirs.length} run(s) audited, ${failed} failed`);
process.exit(failed ? 1 : 0);
