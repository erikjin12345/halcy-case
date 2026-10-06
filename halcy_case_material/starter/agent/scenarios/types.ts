// The shape of a scenario: one traveller request, how the scripted traveller
// answers follow-up questions, and what a correct run looks like. Cases are
// JSON files in cases/, validated against these schemas when loaded.

import { z } from "zod";

const featureValue = z.union([z.string(), z.number(), z.boolean()]);
const weekday = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

/** What must (in `expect`) or should (in `prefer`) be true of a finished run. All regexes are case-insensitive. */
export const expectationSchema = z
  .object({
    /** approved: the traveller said yes to a candidate. declined: asked, said no. no_booking: never got to an approval card. */
    outcome: z.enum(["approved", "declined", "no_booking"]).optional(),
    /** Substring of the approved candidate's room name. */
    room: z.string().optional(),
    /** Substring the approved room name must not contain, e.g. after an upsell. */
    notRoom: z.string().optional(),
    /** Features of the approved candidate. Strings match as substrings, numbers and booleans exactly. */
    features: z.record(z.string(), featureValue).optional(),
    /** What the orchestrator understood. */
    goal: z.object({ adults: z.number().optional(), nights: z.number().optional(), checkinWeekday: weekday.optional() }).strict().optional(),
    /** required: at least one question before the approval card. forbidden: none. Omitted: either is fine. */
    followUp: z.enum(["required", "forbidden"]).optional(),
    /** Each must match something the agent said or showed. */
    says: z.array(z.string()).optional(),
    /** None may match anything the agent said or showed. */
    neverSays: z.array(z.string()).optional(),
  })
  .strict();
export type Expectation = z.infer<typeof expectationSchema>;

/** How the scripted traveller answers one kind of question. The first matching rule wins. */
export const replySchema = z
  .object({
    /** Matched against the question: the card's title and lines, or the agent's last message. */
    when: z.string(),
    /** For a card with buttons: matched against each button's id and label. */
    press: z.string().optional(),
    /** For a free-text question. */
    say: z.string().optional(),
  })
  .strict()
  .refine((r) => r.press !== undefined || r.say !== undefined, "a reply needs `press` or `say`");

export const scenarioSchema = z
  .object({
    /** Same as the file name without .json. */
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    /** What this probes and why the expected answer is the correct one. For the human reader. */
    why: z.string(),
    /** What the traveller writes in the chat. */
    message: z.string(),
    replies: z.array(replySchema).default([]),
    /** What the traveller does at the approval card. */
    approve: z.boolean().default(true),
    /** Pin "today" (YYYY-MM-DD) for the agent. Default: the real date. */
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expect: expectationSchema,
    prefer: expectationSchema.optional(),
  })
  .strict();
export type Scenario = z.infer<typeof scenarioSchema>;
