// One place that talks to the Claude API. `runAgent` drives a tool-use loop
// for a role, logs every turn's usage to the run log, and returns the final
// text. Credentials come from the environment (see config.ts).

import Anthropic from "@anthropic-ai/sdk";
import type { RunLog } from "../../log.ts";
import { loadDotEnv, roleConfig } from "../config.ts";
import { systemPrompt } from "../prompts/index.ts";
import type { AgentRole } from "../types.ts";

let client: Anthropic | undefined;

export function getClient(): Anthropic {
  if (!client) {
    loadDotEnv();
    client = new Anthropic();
  }
  return client;
}

type ToolRunnerParams = Parameters<Anthropic["beta"]["messages"]["toolRunner"]>[0];
export type RunnableTool = ToolRunnerParams["tools"][number];

export interface AgentRunOptions {
  role: AgentRole;
  /** The per-run context: goal, traveller, today. Never put this in the system prompt. */
  user: string;
  tools: RunnableTool[];
  log: RunLog;
  maxIterations?: number;
}

export interface AgentRunResult {
  text: string;
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  turns: number;
}

/** Runs one agent to completion. Throws on refusal or when no turn finished. */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const cfg = roleConfig(opts.role);
  const runner = getClient().beta.messages.toolRunner({
    model: cfg.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: cfg.effort },
    system: [{ type: "text", text: systemPrompt(opts.role), cache_control: { type: "ephemeral" } }],
    tools: opts.tools,
    messages: [{ role: "user", content: opts.user }],
    max_iterations: opts.maxIterations ?? cfg.maxIterations,
  });

  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, turns: 0 };
  opts.log.event("llm.start", { role: opts.role, model: cfg.model, effort: cfg.effort });

  for await (const message of runner) {
    totals.turns += 1;
    totals.inputTokens += message.usage.input_tokens;
    totals.outputTokens += message.usage.output_tokens;
    totals.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    const toolNames = message.content.filter((b) => b.type === "tool_use").map((b) => b.name);
    opts.log.event("llm.turn", { role: opts.role, stop: message.stop_reason, tools: toolNames, usage: message.usage });

    if (message.stop_reason === "refusal") {
      opts.log.event("llm.refusal", { role: opts.role, details: message.stop_details ?? null });
      throw new Error(`${opts.role}: the model declined this request`);
    }
    if (message.stop_reason === "pause_turn") {
      runner.pushMessages({ role: "assistant", content: message.content });
    }
  }

  const final = await runner.done();
  const text = final.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  opts.log.event("llm.done", { role: opts.role, ...totals, stop: final.stop_reason });
  return { text, stopReason: final.stop_reason, ...totals };
}
