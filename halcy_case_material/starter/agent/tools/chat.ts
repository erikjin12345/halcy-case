// Chat tools for the orchestrator: the only way any model talks to the
// traveller. Every call is logged so the run log shows what was said and what
// the traveller approved.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunLog } from "../../log.ts";
import type { Chat } from "../../types.ts";
import type { RunnableTool } from "../llm/client.ts";

export interface ChatToolDeps {
  chat: Chat;
  log: RunLog;
  /** How long to wait for the traveller before giving up, in ms. */
  replyTimeoutMs?: number;
}

const TIMEOUT = "__timeout__";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}

export function chatTools(deps: ChatToolDeps): RunnableTool[] {
  const { chat, log } = deps;
  const timeoutMs = deps.replyTimeoutMs ?? 10 * 60 * 1000;

  const say = betaZodTool({
    name: "say",
    description: "Send a short text message to the traveller.",
    inputSchema: z.object({ text: z.string() }),
    run: async ({ text }) => {
      chat.say(text);
      log.event("chat.say", { text });
      return "Sent.";
    },
  });

  const showCard = betaZodTool({
    name: "show_card",
    description: "Show a card with a title, a few lines and optionally a link. Use it for a summary the traveller should be able to re-read, such as a room option with its full price breakdown.",
    inputSchema: z.object({
      title: z.string(),
      lines: z.array(z.string()).max(12),
      link: z.object({ label: z.string(), url: z.string() }).optional(),
    }),
    run: async (card) => {
      const id = chat.card(card);
      log.event("chat.card", { id, ...card });
      return `Shown as card ${id}.`;
    },
  });

  const askTraveller = betaZodTool({
    name: "ask_traveller",
    description: "Show a card with buttons and wait for the traveller to press one. Returns the pressed button id, or 'timeout' if they went quiet.",
    inputSchema: z.object({
      title: z.string(),
      lines: z.array(z.string()).max(12),
      buttons: z.array(z.object({ id: z.string(), label: z.string() })).min(1).max(4),
    }),
    run: async (card) => {
      log.event("chat.ask", card);
      const pressed = await withTimeout(chat.choose(card), timeoutMs);
      log.event("chat.answer", { title: card.title, pressed });
      return pressed === TIMEOUT ? "timeout" : pressed;
    },
  });

  const waitForReply = betaZodTool({
    name: "wait_for_reply",
    description: "Wait for the traveller's next free-text message. Returns the text, or 'timeout' if they went quiet.",
    inputSchema: z.object({}),
    run: async () => {
      const text = await withTimeout(chat.reply(), timeoutMs);
      log.event("chat.reply", { text });
      return text === TIMEOUT ? "timeout" : text;
    },
  });

  return [say, showCard, askTraveller, waitForReply];
}
