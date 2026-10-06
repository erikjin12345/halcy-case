// A `Chat` that plays the traveller from a scenario's script, so a run needs
// no human. It answers follow-up questions from the scenario's rules, presses
// approve or decline at the approval card, and remembers every question so
// the report can show what the agent asked and whether the script covered it.

import type { Button, Card, Chat } from "../../types.ts";
import type { Scenario } from "./types.ts";

export interface Asked {
  kind: "buttons" | "text";
  question: string;
  buttons?: string[];
  answer: string;
  /** False when no rule matched and the fallback answered. */
  scripted: boolean;
  approval: boolean;
}

export class ScriptExhausted extends Error {}

const APPROVE = /approve|continue (to|with)|proceed|go ahead|book it|confirm/i;
const DECLINE = /stop|not now|decline|cancel|^no\b|check with/i;
/** The answer to a free-text question no rule covers. */
export const FALLBACK_SAY = "Please use your best judgement and tell me what you assumed.";

const re = (source: string) => new RegExp(source, "i");
const matches = (b: Button, pattern: RegExp) => pattern.test(b.id) || pattern.test(b.label);

/** A card is the approval card when one of its buttons says so. */
export function isApprovalCard(buttons: { id: string; label: string }[]): boolean {
  return buttons.some((b) => matches(b, APPROVE));
}

export function scriptedChat(scenario: Pick<Scenario, "replies" | "approve">, maxQuestions = 12): { chat: Chat; asked: Asked[] } {
  const asked: Asked[] = [];
  let lastSaid = "";
  let cards = 0;
  const record = (a: Asked): string => {
    asked.push(a);
    if (asked.length > maxQuestions) throw new ScriptExhausted(`the agent asked more than ${maxQuestions} questions`);
    return a.answer;
  };

  const chat: Chat = {
    say(text) {
      lastSaid = text;
    },
    card(card: Card) {
      lastSaid = [card.title, ...(card.lines ?? [])].join("\n");
      return `card-${++cards}`;
    },
    async choose(card) {
      const question = [card.title, ...(card.lines ?? [])].join("\n");
      const labels = card.buttons.map((b) => b.label);
      const base = { kind: "buttons" as const, question, buttons: labels };
      for (const rule of scenario.replies) {
        if (rule.press === undefined || !re(rule.when).test(question)) continue;
        const hit = card.buttons.find((b) => matches(b, re(rule.press!)));
        if (hit) return record({ ...base, answer: hit.id, scripted: true, approval: isApprovalCard(card.buttons) });
      }
      if (isApprovalCard(card.buttons)) {
        const yes = card.buttons.find((b) => matches(b, APPROVE))!;
        const no = card.buttons.find((b) => matches(b, DECLINE)) ?? card.buttons[card.buttons.length - 1];
        return record({ ...base, answer: (scenario.approve ? yes : no).id, scripted: true, approval: true });
      }
      // No rule covers this question. Do not commit to anything on the traveller's
      // behalf: take the way out if there is one, otherwise the first button.
      const out = card.buttons.find((b) => matches(b, DECLINE)) ?? card.buttons[0];
      return record({ ...base, answer: out.id, scripted: false, approval: false });
    },
    async reply() {
      const rule = scenario.replies.find((r) => r.say !== undefined && re(r.when).test(lastSaid));
      return record({ kind: "text", question: lastSaid, answer: rule?.say ?? FALLBACK_SAY, scripted: Boolean(rule), approval: false });
    },
  };
  return { chat, asked };
}
