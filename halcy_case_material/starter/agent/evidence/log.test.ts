import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BLIND_END, BLIND_START, BlindLogError, GuardedLog } from "./log.ts";

// RunLog writes under runs/ relative to cwd; keep the test out of the project.
let dir: string;
let cwd: string;
before(() => {
  cwd = process.cwd();
  dir = mkdtempSync(join(tmpdir(), "guarded-log-"));
  process.chdir(dir);
});
after(() => {
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

const linesOf = (log: GuardedLog) => readFileSync(join(log.dir, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

test("no observation can be written inside the blind interval, chat can", () => {
  const log = new GuardedLog("blind");
  log.event("observe", { url: "http://localhost:4100/payment" });
  log.event(BLIND_START, { reason: "traveller takes over" });
  assert.throws(() => log.event("observe", { url: "x" }), BlindLogError);
  assert.throws(() => log.event("act", { kind: "fill" }), BlindLogError);
  assert.throws(() => log.event("screenshot.masked", {}), BlindLogError);
  assert.throws(() => log.screenshot(Buffer.from("png"), "payment"), BlindLogError);
  log.event("chat.reply", { text: "done" });
  log.event(BLIND_END, { outcome: "url changed" });
  log.event("observe", { url: "http://localhost:4100/confirmation/CH-1" });

  const types = linesOf(log).map((e) => e.type);
  assert.deepEqual(types, ["observe", BLIND_START, "chat.reply", BLIND_END, "observe"]);
  assert.deepEqual(readdirSync(log.dir), ["events.jsonl"], "no screenshot file was created");
});

test("a card number never reaches disk, even outside blind mode", () => {
  const log = new GuardedLog("redact");
  log.event("observe", { observation: { elements: [{ name: "Card number", value: "4242 4242 4242 4242" }] } });
  const raw = readFileSync(join(log.dir, "events.jsonl"), "utf8");
  assert.equal(raw.includes("4242"), false);
  assert.equal(linesOf(log)[0].redacted, true);
});
