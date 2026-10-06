// Run with: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cleanUrl, serialise } from "./serial.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Runnable = { run: (input: unknown) => Promise<unknown> };

function tools(order: string[]) {
  const make = (name: string, ms: number) =>
    betaZodTool({
      name,
      description: name,
      inputSchema: z.object({}),
      run: async () => {
        order.push(`${name}:start`);
        await wait(ms);
        order.push(`${name}:end`);
        return name;
      },
    });
  return serialise([make("slow", 30), make("fast", 1)]) as unknown as Runnable[];
}

test("calls issued together run one at a time, in the order issued", async () => {
  const order: string[] = [];
  const [slow, fast] = tools(order);
  const results = await Promise.all([slow.run({}), fast.run({}), slow.run({})]);
  assert.deepEqual(results, ["slow", "fast", "slow"]);
  assert.deepEqual(order, ["slow:start", "slow:end", "fast:start", "fast:end", "slow:start", "slow:end"]);
});

test("a failing call does not block the queue", async () => {
  const boom = betaZodTool({ name: "boom", description: "x", inputSchema: z.object({}), run: async () => { throw new Error("no"); } });
  const ok = betaZodTool({ name: "ok", description: "x", inputSchema: z.object({}), run: async () => "fine" });
  const [a, b] = serialise([boom, ok]) as unknown as Runnable[];
  const first = a.run({}).catch((e: Error) => e.message);
  assert.equal(await b.run({}), "fine");
  assert.equal(await first, "no");
});

test("a serialised tool keeps its name and schema", () => {
  const t = betaZodTool({ name: "keep", description: "d", inputSchema: z.object({ a: z.string() }), run: async () => "" });
  const [s] = serialise([t]) as unknown as { name: string; description: string }[];
  assert.equal(s.name, "keep");
  assert.equal(s.description, "d");
});

test("cleanUrl undoes HTML-escaped ampersands", () => {
  assert.equal(cleanUrl("http://h/rooms?a=1&amp;b=2&amp;c=3 "), "http://h/rooms?a=1&b=2&c=3");
});
