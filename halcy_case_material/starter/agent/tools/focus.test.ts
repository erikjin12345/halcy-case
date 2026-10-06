import assert from "node:assert/strict";
import { test } from "node:test";
import { activateApp, frontmostApp, isAgentBrowser } from "./focus.ts";

const fake = (answers: Record<string, string>) => {
  const calls: string[] = [];
  const exec = async (cmd: string, args: string[]) => {
    const key = [cmd, ...args].join(" ");
    calls.push(key);
    return answers[key] ?? "";
  };
  return { calls, exec };
};

test("the frontmost app is read as a bundle id on macOS", async () => {
  const f = fake({ "lsappinfo front": "ASN:0x0-0x1d01d:\n", 'lsappinfo info -only bundleid ASN:0x0-0x1d01d:': '"CFBundleIdentifier"="com.google.Chrome"\n' });
  assert.equal(await frontmostApp("darwin", f.exec), "com.google.Chrome");
});

test("nothing is read or run off macOS", async () => {
  const f = fake({});
  assert.equal(await frontmostApp("linux", f.exec), undefined);
  assert.equal(await activateApp("com.google.Chrome", "win32", f.exec), false);
  assert.deepEqual(f.calls, []);
});

test("the chat's browser is brought back; the agent's own browser and odd ids are not", async () => {
  const f = fake({});
  assert.equal(await activateApp("com.google.Chrome", "darwin", f.exec), true);
  assert.equal(await activateApp("org.chromium.Chromium", "darwin", f.exec), false);
  assert.equal(await activateApp("com.google.chrome.for.testing", "darwin", f.exec), false);
  assert.equal(await activateApp('x"; rm -rf /', "darwin", f.exec), false);
  assert.equal(await activateApp(undefined, "darwin", f.exec), false);
  assert.deepEqual(f.calls, ["open -b com.google.Chrome"]);
  assert.ok(isAgentBrowser("org.chromium.Chromium"));
});
