// The shapes the chat and your agent share. Extend them freely: they are a
// starting point, not a contract.

/** The person chatting, from their Halcy profile (starter/traveller.json). */
export interface Traveller {
  first: string;
  last: string;
  email: string;
  phone: string;
  /** The currency they think and pay in, as an ISO code ("SEK"). Optional: estimates are shown only when it is known. */
  currency?: string;
}

export interface Button {
  id: string;
  label: string;
}

/** Something richer than a text bubble: a summary, a screenshot, a link, a choice. */
export interface Card {
  title: string;
  lines?: string[];
  /** A PNG (for example a screenshot) shown in the card. */
  image?: Buffer;
  link?: { label: string; url: string };
  buttons?: Button[];
}

/** How the traveller answered a question with buttons. */
export type Answer =
  | { kind: "pressed"; button: string }
  /** `early`: typed before this question was asked, so it may answer something else. */
  | { kind: "typed"; text: string; early?: boolean }
  | { kind: "timeout" };

export interface Chat {
  /** Send a text message to the traveller. */
  say(text: string): void;
  /** Show a card. Returns its id. */
  card(card: Card): string;
  /** Show a card with buttons and wait until the traveller presses one. Resolves to the button's id. */
  choose(card: Card & { buttons: Button[] }): Promise<string>;
  /** Wait for the traveller's next message. */
  reply(): Promise<string>;
  /** Show a card with buttons and wait for a press or a typed message, whichever comes first, or the timeout. */
  ask?(card: Card & { buttons: Button[] }, timeoutMs: number): Promise<Answer>;
  /** Wait for the next message, or the timeout. A message typed before the wait began is marked `early`. */
  next?(timeoutMs: number): Promise<Answer>;
}

export interface Context {
  traveller: Traveller;
  /** ISO date (YYYY-MM-DD). */
  today: string;
  /** Hotel name to booking-site address (starter/hotels.json). Stands in for
   *  Halcy's places database: at the debrief we add a hotel your agent hasn't seen. */
  hotels: Record<string, string>;
}

/** Runs once per new conversation turn: the traveller wrote `message` while the agent was idle. */
export type Agent = (message: string, chat: Chat, ctx: Context) => Promise<void>;
