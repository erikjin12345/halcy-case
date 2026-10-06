// Chat tools for the orchestrator: the only way any model talks to the
// traveller. Every call is logged so the run log shows what was said and what
// the traveller approved.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RunLog } from "../../log.ts";
import type { Answer, Button, Card, Chat } from "../../types.ts";
import type { RunnableTool } from "../llm/client.ts";

export interface ChatToolDeps {
  chat: Chat;
  log: RunLog;
  /** How long to wait for the traveller before giving up, in ms. */
  replyTimeoutMs?: number;
}

const TIMEOUT = "__timeout__";

/** The timer is cleared as soon as `p` settles, so a finished wait cannot keep the process alive. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  let timer: NodeJS.Timeout | undefined;
  const quiet = new Promise<typeof TIMEOUT>((r) => (timer = setTimeout(() => r(TIMEOUT), ms)));
  return Promise.race([p, quiet]).finally(() => clearTimeout(timer));
}

/**
 * Show a card with buttons and wait for a press or a typed message, whichever
 * comes first. A chat without `ask` (a test double, the starter's own) can
 * only be answered by a press.
 */
export async function askOrType(chat: Chat, card: Card & { buttons: Button[] }, timeoutMs: number): Promise<Answer> {
  if (chat.ask) return chat.ask(card, timeoutMs);
  const pressed = await withTimeout(chat.choose(card), timeoutMs);
  return pressed === TIMEOUT ? { kind: "timeout" } : { kind: "pressed", button: pressed };
}

/** What a tool returns to the model for an answer: the button id, "typed: <text>", or "timeout". */
export function answerText(a: Answer): string {
  if (a.kind === "pressed") return a.button;
  if (a.kind === "timeout") return "timeout";
  return a.early ? `typed before this question: ${a.text}` : `typed: ${a.text}`;
}

export function chatTools(deps: ChatToolDeps): RunnableTool[] {
  const { chat, log } = deps;
  // REPLY_TIMEOUT_MS shortens the wait, so the quiet-traveller path can be run without waiting ten minutes.
  const timeoutMs = deps.replyTimeoutMs ?? Number(process.env.REPLY_TIMEOUT_MS ?? 10 * 60 * 1000);

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
    description: "Show a card with buttons and wait for the traveller to press one or type an answer. Returns the pressed button id, 'typed: <their message>' if they wrote instead, or 'timeout' if they went quiet. A typed answer is an answer: act on it.",
    inputSchema: z.object({
      title: z.string(),
      lines: z.array(z.string()).max(12),
      buttons: z.array(z.object({ id: z.string(), label: z.string() })).min(1).max(4),
    }),
    run: async (card) => {
      log.event("chat.ask", card);
      const answer = await askOrType(chat, card, timeoutMs);
      log.event("chat.answer", answer.kind === "typed" ? { title: card.title, typed: answer.text } : { title: card.title, pressed: answer.kind === "pressed" ? answer.button : "__timeout__" });
      return answerText(answer);
    },
  });

  const waitForReply = betaZodTool({
    name: "wait_for_reply",
    description: "Wait for the traveller's next free-text message. Returns 'typed: <text>', 'typed before this question: <text>' for a message they sent before you asked (it may answer something else), or 'timeout'.",
    inputSchema: z.object({}),
    run: async () => {
      // Without `next` (a test double) a timed-out reply would leave a wait behind; with it, nothing is left over.
      const answer: Answer = chat.next ? await chat.next(timeoutMs) : await withTimeout(chat.reply(), timeoutMs).then((t) => (t === TIMEOUT ? { kind: "timeout" } : { kind: "typed", text: t }));
      log.event("chat.reply", answer.kind === "typed" ? { text: answer.text, early: answer.early ?? false } : { text: "timeout" });
      return answerText(answer);
    },
  });

  return [say, showCard, askTraveller, waitForReply];
}
