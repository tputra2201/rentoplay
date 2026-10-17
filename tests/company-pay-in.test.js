import { expect, test } from "bun:test";
import { companyPayInRows } from "../src/lib/company-pay-in";

const dp = (createdAt, extra = {}) => ({ direction: "in", payout: true, source: "booking-dp", amount: 100000, createdAt, ...extra });
const used = (createdAt) => ({ ...dp(createdAt), direction: "out", source: "booking-dp-used" });
const periodRows = (entries, from, to) => companyPayInRows(entries.filter((e) => e.createdAt >= from && e.createdAt < to));

test("DP received last month stays 100000 in PAY-IN after next month's check-in", () => {
  const before = periodRows([dp(10)], 0, 30);
  const after = periodRows([dp(10), used(40)], 0, 30);
  expect(before.get("DP RESERVASI").amount).toBe(100000);
  expect(after.get("DP RESERVASI").amount).toBe(100000);
  expect(periodRows([dp(10), used(40)], 30, 60).size).toBe(0);
});

test("same-period DP use never suppresses the original receipt", () => {
  expect(periodRows([dp(10), used(20)], 0, 30).get("DP RESERVASI")).toEqual({ label: "DP RESERVASI", amount: 100000, qty: 1 });
});

test("names, methods and duplicate amounts cannot match away receipts", () => {
  const entries = [dp(10, { note: "DP reservasi A", payment: "Cash" }), dp(11, { note: "changed", payment: "QRIS" }), used(9), used(20)];
  expect(companyPayInRows(entries).get("DP RESERVASI").amount).toBe(200000);
});

test("period start is included and period end excluded", () => {
  expect(periodRows([dp(30), dp(60), used(70)], 30, 60).get("DP RESERVASI").amount).toBe(100000);
});

test("top ups and manual pay-ins remain separate; sales and outflows do not enter PAY-IN", () => {
  const rows = companyPayInRows([dp(10), { ...dp(10), source: "card-topup", amount: 20000 }, { ...dp(10), source: undefined, amount: 50000 }, { ...dp(10), payout: false, amount: 300000 }, used(20)]);
  expect([...rows.values()].reduce((sum, r) => sum + r.amount, 0)).toBe(170000);
  expect(rows.get("TOP UP PLAYING CARD").amount).toBe(20000);
  expect(rows.get("TAMBAHAN KAS MASUK").amount).toBe(50000);
});