import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { httpProbe, reachableHotels } from "./reachable.ts";

test("hotels that do not answer are split off, probed in parallel", async () => {
  const calls: string[] = [];
  const probe = async (url: string) => (calls.push(url), url.includes("4100"));
  const r = await reachableHotels({ "Casa Halcy": "http://localhost:4100", "Villa Aurora": "http://localhost:4500" }, probe);
  assert.deepEqual(r, { up: { "Casa Halcy": "http://localhost:4100" }, down: ["Villa Aurora"] });
  assert.equal(calls.length, 2);
});

test("the real probe: any HTTP answer is up, a closed port is down, and neither waits long", async () => {
  const server = createServer((_, res) => res.writeHead(404).end()).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  const t0 = Date.now();
  assert.equal(await httpProbe(`http://127.0.0.1:${port}/`, 1000), true, "even a 404 means the site answers");
  server.close();
  assert.equal(await httpProbe(`http://127.0.0.1:${port}/`, 1000), false);
  assert.ok(Date.now() - t0 < 2500);
});
