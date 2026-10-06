// Reads and validates the scenario files in cases/.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { scenarioSchema, type Scenario } from "./types.ts";

export const CASES_DIR = fileURLToPath(new URL("./cases/", import.meta.url));

/** All scenarios in file-name order, or only those whose id starts with one of `ids`. Throws on an invalid file. */
export function loadScenarios(ids: string[] = [], dir = CASES_DIR): Scenario[] {
  const out: Scenario[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const stem = file.slice(0, -".json".length);
    if (ids.length && !ids.some((id) => stem.startsWith(id))) continue;
    const parsed = scenarioSchema.safeParse(JSON.parse(readFileSync(join(dir, file), "utf8")));
    if (!parsed.success) throw new Error(`${file}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    if (parsed.data.id !== stem) throw new Error(`${file}: id "${parsed.data.id}" must equal the file name`);
    out.push(parsed.data);
  }
  return out;
}
