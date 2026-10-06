import { test } from "node:test";
import assert from "node:assert/strict";
import { claimsAbsence, honestUnverified } from "./unverified.ts";

test("claims of absence are recognised in the wordings models use", () => {
  for (const t of [
    "Public transport: the hotel's site doesn't say anything about public transport nearby",
    "Tram stop - the website does not mention it",
    "Late check-in is not stated on the site",
    "The site gives no information about parking",
  ]) assert.ok(claimsAbsence(t), t);
  for (const t of ["Tram stop: I did not find it on the pages I checked", "Reception hours: the rooms page and the review page do not mention reception hours", "Pets: not found"]) {
    assert.equal(claimsAbsence(t), false, t);
  }
});

test("an absence claim is reworded unless an information page was opened", () => {
  const items = ["Public transport: the hotel's site doesn't say anything about public transport nearby"];
  const r = honestUnverified(items, ["/availability", "/guest", "/review"]);
  assert.equal(r.reworded, true);
  assert.equal(r.items[0], "Public transport: I did not find this on the pages I checked (/availability, /guest, /review); the hotel's site may say it elsewhere.");
  assert.deepEqual(honestUnverified(items, ["/", "/location", "/review"]), { items, reworded: false });
  assert.deepEqual(honestUnverified(["Pets: not found on /rooms"], ["/rooms"]), { items: ["Pets: not found on /rooms"], reworded: false });
});
