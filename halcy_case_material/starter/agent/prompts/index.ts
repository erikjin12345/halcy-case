// System prompts live as Markdown next to this file so they can be read and
// reviewed without opening code. They are loaded once and kept byte-stable,
// which is what prompt caching needs. Anything that varies per run goes in
// the first user message, never in the system prompt.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AgentRole } from "../types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const cache = new Map<AgentRole, string>();

export function systemPrompt(role: AgentRole): string {
  let text = cache.get(role);
  if (!text) {
    text = readFileSync(join(here, `${role}.md`), "utf8").trim();
    cache.set(role, text);
  }
  return text;
}
