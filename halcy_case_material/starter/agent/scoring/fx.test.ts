import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeCap } from "./cap-estimate.ts";
import { compareText, convert, estimateNote, explainText, loadRates, money, parseEcb, shortEstimate, type Rates } from "./fx.ts";

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

test("the estimate is short, and the note says once what it is", () => {
  assert.equal(shortEstimate(706.24, "€", "SEK", rates), "(≈ 7,947 kr)");
  assert.equal(shortEstimate(594, "GBP", "GBP", rates), null, "nothing in the hotel's own currency");
  assert.equal(shortEstimate(0, "GBP", "SEK", rates), null, "nothing to estimate in nothing charged");
  assert.equal(shortEstimate(594, "GBP", undefined, rates), null, "no traveller currency, no estimate");
  assert.equal(shortEstimate(594, "GBP", "SEK", null), null, "no rates, no estimate");
  assert.equal(estimateNote(rates), "≈ estimate at the ECB rate of 5 Oct");
  assert.equal(estimateNote({ ...rates, source: "snapshot" }), "≈ estimate at the ECB rate of 5 Oct (latest available)");
});

test("the full explanation is there for when the traveller asks", () => {
  const text = explainText(rates, "SEK");
  for (const part of ["European Central Bank", "published 5 Oct", "your bank's rate and card fees", "at the hotel is converted at your bank's rate on the day"]) assert.ok(text.includes(part), part);
  assert.match(explainText({ ...rates, source: "snapshot" } as Rates, "SEK"), /the latest I have, from 5 Oct/);
  assert.match(explainText(null, "SEK"), /only the hotel's own figures/);
});

test("a comparison across currencies is an estimate, and under 3% too close to call", () => {
  const user = [{ label: "Casa Halcy", amount: 658.24, currency: "€" }, { label: "Villa Aurora", amount: 594, currency: "GBP" }];
  assert.equal(compareText(user, "SEK", rates), "Casa Halcy is about 6% cheaper than Villa Aurora (≈).");
  const close = [{ label: "A", amount: 100, currency: "EUR" }, { label: "B", amount: 85, currency: "GBP" }];
  assert.equal(compareText(close, "SEK", rates), "A and B are too close to call (≈).");
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
