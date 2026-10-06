import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCases } from "./cases.ts";

test("the sidebar reads the case files, groups them by the hotel the message names, and lists the scripted replies", () => {
  const dir = mkdtempSync(join(tmpdir(), "cases-"));
  try {
    writeFileSync(join(dir, "01-a.json"), JSON.stringify({ id: "01-a", title: "A", message: "Two of us at Casa Halcy", replies: [{ when: "adults", press: "^2$|2 adult|two" }, { when: "x", say: "Two adults." }] }));
    writeFileSync(join(dir, "20-b.json"), JSON.stringify({ id: "20-b", title: "B", message: "Book Villa Aurora" }));
    writeFileSync(join(dir, "09-c.json"), JSON.stringify({ id: "09-c", title: "C", message: "Book Hotel Lisboa Azul" }));
    writeFileSync(join(dir, "broken.json"), "{ not json");
    const groups = loadCases([dir, join(dir, "missing")], ["Casa Halcy", "Villa Aurora"]);
    assert.deepEqual(groups.map((g) => [g.hotel, g.cases.map((c) => c.id)]), [["Casa Halcy", ["01-a"]], ["Other", ["09-c"]], ["Villa Aurora", ["20-b"]]]);
    assert.deepEqual(groups[0].cases[0].replies, ["(press) 2", "Two adults."]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the real case folder loads", () => {
  const groups = loadCases([new URL("../agent/scenarios/cases", import.meta.url).pathname], ["Casa Halcy", "Villa Aurora"]);
  assert.ok(groups.reduce((n, g) => n + g.cases.length, 0) >= 20);
});
