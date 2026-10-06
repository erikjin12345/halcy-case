import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageDriver } from "./driver.ts";
import { lazyDriver } from "./lazy-driver.ts";
import { fakeRaw, HOTEL } from "../payment/testing.ts";

test("a run that never needs the page never opens a browser", async () => {
  let opens = 0;
  const d = lazyDriver(async () => (opens++, fakeRaw({}, HOTEL).raw));
  assert.deepEqual(d.location(), { origin: "about:blank", path: "" });
  assert.equal(d.frameUrlOf("0:0"), null);
  d.onNavigated(() => {});
  await d.close();
  assert.equal(opens, 0);
  assert.equal(d.opened, false);
});

test("the first page call opens exactly one browser, and listeners registered before it are kept", async () => {
  let opens = 0;
  let raw: ReturnType<typeof fakeRaw> | undefined;
  let closedRaw = 0;
  const d = lazyDriver(async () => {
    opens++;
    raw = fakeRaw({ "/": "Book a room" }, `${HOTEL}/`);
    const r: PageDriver = { ...raw.raw, close: async () => void closedRaw++ };
    return r;
  });
  const seen: string[] = [];
  d.onNavigated((to) => seen.push(to.path));
  await Promise.all([d.observe(), d.goto(`${HOTEL}/rooms`)]);
  assert.equal(opens, 1);
  assert.equal(d.opened, true);
  assert.deepEqual(d.location(), { origin: HOTEL, path: "/rooms" });
  raw!.navigate(`${HOTEL}/details`);
  assert.deepEqual(seen, ["/details"]);
  await d.close();
  assert.equal(closedRaw, 1);
});
