// What the chat server is waiting for from the traveller, in one place. A
// question with buttons can be answered by a press or by typing; whichever
// comes first ends the wait, and the other is withdrawn so that a later
// press does nothing and a later message is not swallowed by a stale wait.

import type { Answer } from "../types.ts";

export class Waits {
  readonly inbox: string[] = [];
  private onText: ((text: string) => void) | null = null;
  private readonly onPress = new Map<string, (button: string) => void>();

  /** A message from the traveller. True if a wait took it; otherwise it is queued. */
  typed(text: string): boolean {
    const take = this.onText;
    if (take) {
      this.onText = null;
      take(text);
      return true;
    }
    this.inbox.push(text);
    return false;
  }

  /** A button press. True if a wait for that card took it; a press on a withdrawn card does nothing. */
  pressed(cardId: string, button: string): boolean {
    const take = this.onPress.get(cardId);
    if (!take) return false;
    this.onPress.delete(cardId);
    take(button);
    return true;
  }

  /** Wait for a press on `cardId` only (the starter's `choose`). */
  press(cardId: string): Promise<string> {
    return new Promise((resolve) => this.onPress.set(cardId, resolve));
  }

  /** Wait for the next message (the starter's `reply`). A queued one is returned at once. */
  text(): Promise<string> {
    const queued = this.inbox.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => (this.onText = resolve));
  }

  /** Wait for a press on `cardId` or a typed message, whichever first; give up after `timeoutMs`. */
  either(cardId: string, timeoutMs: number): Promise<Answer> {
    const queued = this.inbox.shift();
    if (queued !== undefined) return Promise.resolve({ kind: "typed", text: queued, early: true });
    return new Promise((resolve) => {
      const done = (a: Answer) => {
        clearTimeout(timer);
        this.onPress.delete(cardId);
        if (this.onText === onText) this.onText = null;
        resolve(a);
      };
      const onText = (text: string) => done({ kind: "typed", text });
      const timer = setTimeout(() => done({ kind: "timeout" }), timeoutMs);
      this.onText = onText;
      this.onPress.set(cardId, (button) => done({ kind: "pressed", button }));
    });
  }

  /** Wait for the next message or the timeout. A queued message is handed over marked as typed before the wait. */
  next(timeoutMs: number): Promise<Answer> {
    const queued = this.inbox.shift();
    if (queued !== undefined) return Promise.resolve({ kind: "typed", text: queued, early: true });
    return new Promise((resolve) => {
      const onText = (text: string) => {
        clearTimeout(timer);
        resolve({ kind: "typed", text });
      };
      const timer = setTimeout(() => {
        if (this.onText === onText) this.onText = null;
        resolve({ kind: "timeout" });
      }, timeoutMs);
      this.onText = onText;
    });
  }

  /** Forget every wait, as at the end of a run. */
  clear(): void {
    this.onText = null;
    this.onPress.clear();
    this.inbox.length = 0;
  }
}
