// One browser, one action at a time. The tool runner executes every tool
// call of a turn concurrently; on a single page that makes clicks race each
// other and lets an `observe` run before the `act` issued just ahead of it.
// `serialise` puts a set of tools on one queue so calls run in the order the
// model issued them.

import type { RunnableTool } from "../llm/client.ts";

type Run = (...args: unknown[]) => Promise<unknown>;

export function serialise(tools: RunnableTool[]): RunnableTool[] {
  let tail: Promise<unknown> = Promise.resolve();
  return tools.map((tool) => {
    const run = (tool as { run?: Run }).run;
    if (typeof run !== "function") return tool;
    const queued: Run = (...args) => {
      const next = tail.then(() => run.apply(tool, args));
      tail = next.catch(() => undefined);
      return next;
    };
    return { ...tool, run: queued } as RunnableTool;
  });
}

/** Models sometimes HTML-escape a URL they copied from a page. Undo that before using it. */
export function cleanUrl(url: string): string {
  return url.replace(/&amp;/g, "&").trim();
}
