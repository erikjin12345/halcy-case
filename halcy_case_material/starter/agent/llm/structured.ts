// Single-shot structured extraction: give the model text (and optionally a
// screenshot) and get back an object that matches a Zod schema. Used where a
// tool loop is overkill: reading a confirmation page, parsing a price table.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { RunLog } from "../../log.ts";
import { roleConfig } from "../config.ts";
import type { AgentRole } from "../types.ts";
import { getClient } from "./client.ts";

export interface ExtractOptions<S extends z.ZodType> {
  role: AgentRole;
  system: string;
  user: string;
  schema: S;
  /** PNG screenshots the model may look at. Never pass one taken in blind mode. */
  images?: Buffer[];
  log?: RunLog;
}

export async function extract<S extends z.ZodType>(opts: ExtractOptions<S>): Promise<z.infer<S>> {
  const cfg = roleConfig(opts.role);
  const content: Anthropic.ContentBlockParam[] = (opts.images ?? []).map((png) => ({
    type: "image",
    source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
  }));
  content.push({ type: "text", text: opts.user });

  const response = await getClient().messages.parse({
    model: cfg.model,
    max_tokens: 8000,
    output_config: { format: zodOutputFormat(opts.schema), effort: cfg.effort },
    system: opts.system,
    messages: [{ role: "user", content }],
  });

  opts.log?.event("llm.extract", { role: opts.role, model: cfg.model, usage: response.usage, stop: response.stop_reason });
  if (response.stop_reason === "refusal") throw new Error(`${opts.role}: the model declined this extraction`);
  if (response.parsed_output == null) throw new Error(`${opts.role}: extraction returned no parsable output`);
  return response.parsed_output;
}
