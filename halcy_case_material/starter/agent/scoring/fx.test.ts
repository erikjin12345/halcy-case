import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeCap } from "./cap-estimate.ts";
import { compareText, convert, estimateText, loadRates, money, parseEcb, type Rates } from "./fx.ts";

const XML = `<gesmes:Envelope><Cube><Cube time='2026-10-05'>
<Cube currency='USD' rate='1.1204'/><Cube currency='GBP' rate='0.84720'/><Cube currency='SEK' rate='11.2525'/>
</Cube></Cube></gesmes:Envelope>`;
const rates = parseEcb(XML)!;

test("the ECB file is read with its date, and euro is 1", () => {
  assert.equal(rates.date, "2026-10-05");
  assert.deepEqual(rates.perEuro, { EUR: 1, USD: 1.1204, GBP: 0.8472, SEK: 11.2525 });
  assert.equal(parseEcb("<html>maintenance</html>"), null);
});

test("conversion goes through the euro and refuses an ambiguous symbol", () => {
  assert.equal(Math.round(convert(594, "GBP", "SEK", rates)!), 7890);
  assert.equal(Math.round(convert(658.24, "€", "SEK", rates)!), 7407);
  assert.equal(convert(100, "kr", "EUR", rates), null, "kr is SEK, NOK, DKK or ISK");
  assert.equal(convert(100, "GBP", "XYZ", rates), null);
  assert.equal(money(7889.6, "SEK"), "7,890 kr");
  assert.equal(money(640.2, "EUR"), "€640");
});

test("the estimate says what it is, and nothing is shown in the hotel's own currency", () => {
  assert.equal(estimateText(594, "GBP", "SEK", rates), "≈ 7,890 kr (estimate at the ECB rate of 5 Oct; your bank's rate and fees decide the final amount)");
  assert.match(estimateText(594, "GBP", "SEK", rates, true)!, /you pay it at the hotel, at your bank's rate on that day/);
  assert.equal(estimateText(594, "GBP", "GBP", rates), null);
  assert.equal(estimateText(0, "GBP", "SEK", rates), null, "nothing to estimate in nothing charged");
  assert.equal(estimateText(594, "GBP", undefined, rates), null, "no traveller currency, no estimate");
  assert.equal(estimateText(594, "GBP", "SEK", null), null, "no rates, no estimate");
  const old: Rates = { ...rates, source: "snapshot" };
  assert.match(estimateText(594, "GBP", "SEK", old)!, /the latest rate available here/);
});

test("a comparison across currencies is an estimate, and under 3% too close to call", () => {
  const user = [{ label: "Casa Halcy", amount: 658.24, currency: "€" }, { label: "Villa Aurora", amount: 594, currency: "GBP" }];
  assert.equal(compareText(user, "SEK", rates), "Casa Halcy is about 6% cheaper than Villa Aurora at the ECB rate of 5 Oct (an estimate; your bank's rate and fees decide the final amounts).");
  const close = [{ label: "A", amount: 100, currency: "EUR" }, { label: "B", amount: 85, currency: "GBP" }];
  assert.match(compareText(close, "SEK", rates)!, /too close to call/);
  const same = [{ label: "A", amount: 300, currency: "EUR" }, { label: "B", amount: 400, currency: "EUR" }];
  assert.equal(compareText(same, undefined, null), "A is about 25% cheaper than B.", "same currency needs no rate");
  assert.equal(compareText(user, "SEK", null), null);
});

test("a limit in another currency is applied to the estimate, and asked about within 3%", () => {
  const gap = { cap: 3000, capCurrency: "SEK", priceCurrency: "GBP" };
  assert.equal(judgeCap(215, gap, rates).kind, "fits"); // about 2,856 kr, 5% under
  assert.equal(judgeCap(270, gap, rates).kind, "over"); // about 3,586 kr
  assert.match((judgeCap(270, gap, rates) as { reason: string }).reason, /about 3,586 kr at the ECB rate of 5 Oct, over the limit of 3,000 kr \(an estimate\)/);
  assert.equal(judgeCap(225, gap, rates).kind, "ask"); // about 2,989 kr, within 3%
  assert.equal(judgeCap(215, gap, null).kind, "ask", "no rate: ask, as before");
});

test("rates are fetched once a day, and the bundled snapshot is used when the fetch fails", async () => {
  const fromSnapshot = await loadRates(async () => {
    throw new Error("offline");
  });
  assert.equal(fromSnapshot?.source, "snapshot");
  assert.match(fromSnapshot!.date, /^\d{4}-\d{2}-\d{2}$/);
  let calls = 0;
  const again = await loadRates(async () => (calls++, XML));
  assert.equal(calls, 0, "cached for the day");
  assert.equal(again, fromSnapshot);
});
