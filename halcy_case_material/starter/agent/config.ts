// Runtime configuration: API credentials, which model does which job, and
// how hard each one thinks. Everything comes from the environment; a .env
// file next to package.json is read if present (gitignored).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AgentRole } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const packageDir = join(here, "..", "..");

/** Loads KEY=value lines from .env into process.env without overriding set vars. */
export function loadDotEnv(file = join(packageDir, ".env")): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith("#")) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** True if the SDK will find a credential in the environment. */
export function hasCredential(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface RoleConfig {
  model: string;
  effort: Effort;
  maxIterations: number;
}

/**
 * Defaults per role. Override with MODEL_<ROLE> and EFFORT_<ROLE>, e.g.
 * MODEL_VALIDATION=claude-haiku-4-5. Cheaper models per role are a measured
 * decision for the design document, not a default.
 */
const DEFAULTS: Record<AgentRole, RoleConfig> = {
  orchestrator: { model: "claude-opus-5-5", effort: "medium", maxIterations: 60 },
  search: { model: "claude-opus-5-5", effort: "medium", maxIterations: 80 },
  objective: { model: "claude-opus-5-5", effort: "low", maxIterations: 10 },
  validation: { model: "claude-opus-5-5", effort: "low", maxIterations: 30 },
};

export function roleConfig(role: AgentRole): RoleConfig {
  const key = role.toUpperCase();
  const base = DEFAULTS[role];
  return {
    model: process.env[`MODEL_${key}`] ?? base.model,
    effort: (process.env[`EFFORT_${key}`] as Effort | undefined) ?? base.effort,
    maxIterations: Number(process.env[`MAX_ITER_${key}`] ?? base.maxIterations),
  };
}

export const HEADLESS = process.env.HEADLESS === "1";
