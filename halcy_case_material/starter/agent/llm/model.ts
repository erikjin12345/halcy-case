// The starter's provider-agnostic `Model` seam, implemented for Claude. The
// agents use the richer helpers in client.ts and structured.ts; this exists
// so anything written against starter/model.ts keeps working.

import Anthropic from "@anthropic-ai/sdk";
import type { Completion, CompletionRequest, Model } from "../../model.ts";
import { getClient } from "./client.ts";

export function claudeModel(modelId = "claude-opus-5-5"): Model {
  return {
    id: `anthropic/${modelId}`,
    async complete(req: CompletionRequest): Promise<Completion> {
      const started = Date.now();
      const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const messages: Anthropic.MessageParam[] = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: [
            ...(m.images ?? []).map(
              (png): Anthropic.ImageBlockParam => ({
                type: "image",
                source: { type: "base64", media_type: "image/png", data: png.toString("base64") },
              }),
            ),
            { type: "text", text: m.content },
          ],
        }));

      const response = await getClient().messages.create({
        model: modelId,
        max_tokens: req.maxTokens ?? 8000,
        system: system || undefined,
        messages,
        ...(req.jsonSchema
          ? { output_config: { format: { type: "json_schema" as const, schema: req.jsonSchema } } }
          : {}),
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        text,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      };
    },
  };
}
