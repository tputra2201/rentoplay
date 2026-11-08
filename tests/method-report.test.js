import { expect, test } from "bun:test";
import { methodReportRows } from "../src/lib/method-report";
import { pendingPaymentRecords, settlementSplits, entrySource } from "../src/lib/billing-store";

const stamp = (day, month = 11) => new Date(2026, month - 1, day, 12).getTime();
const range = (month = "2026-11") => ({ mode: "month", from: month, to: month, hours: { openHour: 0, closeHour: 0 } });
const qris = (m) => m.toLowerCase().includes("qris");
const cash = (source, amount, createdAt = stamp(9), extra = {}) => ({ id: `${source}-${createdAt}`, categoryId: "custom-store-account", categoryName: "Akun toko", source, amount, createdAt, payment: "QRIS BCA", direction: source === "booking-dp-used" ? "out" : "in", note: "DP reservasi Ani", ...extra });
const history = (payments, extra = {}) => ({ id: "bill-1", startAt: stamp(10), endAt: stamp(11), paidAt: stamp(11), stationName: "TV 1", customerName: "Ani", total: 150000, payments, ...extra });
const rows = (h = [], c = [], r = range()) => methodReportRows(h, c, r, qris, entrySource);
const total = (r) => r.reduce((s, row) => s + row.amount, 0);

test("DP QRIS 100000 enters the report immediately on receipt", () => {
  expect(total(rows([], [cash("booking-dp", 100000)]))).toBe(100000);
});
test("QRIS top-up 50000 and card purchase 10000 both enter regardless of mapped category", () => {
  expect(total(rows([], [cash("card-topup", 50000), cash("card-sale", 10000)]))).toBe(60000);
});
test("tagged DP application never counts again; only QRIS balance 50000 is new", () => {
  const payments = settlementSplits({ id: "dp", source: "booking-dp", at: stamp(10), payment: "QRIS BCA", amount: 100000 });
  expect(payments[0].source).toBe("booking-dp");
  expect(total(rows([history([...payments, { method: "QRIS BCA", amount: 50000, at: stamp(11) }])], [cash("booking-dp", 100000), cash("booking-dp-used", 100000, stamp(10))]))).toBe(150000);
});
test("last-month DP is not moved to this month's session close", () => {
  const c = [cash("booking-dp", 100000, stamp(31, 10)), cash("booking-dp-used", 100000, stamp(10), { note: "DP reservasi Ani dipakai di TV 1" })];
  const h = [history([{ method: "QRIS BCA", amount: 100000, at: stamp(10) }, { method: "QRIS BCA", amount: 50000, at: stamp(11) }])];
  expect(total(rows(h, c, range("2026-10")))).toBe(100000);
  expect(total(rows(h, c))).toBe(50000);
});
test("separate receipt dates remain unchanged by later bill closure", () => {
  const h = [history([{ method: "QRIS BCA", amount: 20000, at: stamp(31, 10) }, { method: "QRIS BCA", amount: 30000, at: stamp(11) }])];
  expect(total(rows(h, [], range("2026-10")))).toBe(20000);
  expect(total(rows(h))).toBe(30000);
});
test("legacy DP without split timestamps consumes only the applied 100000", () => {
  expect(total(rows([history([{ method: "QRIS BCA", amount: 150000 }])], [cash("booking-dp", 100000), cash("booking-dp-used", 100000, stamp(10))]))).toBe(150000);
});
test("equal QRIS amounts from another customer are not suppressed", () => {
  expect(total(rows([history([{ method: "QRIS BCA", amount: 100000, at: stamp(10) }], { customerName: "Budi" })], [cash("booking-dp-used", 100000, stamp(10))]))).toBe(100000);
});
test("pending station and cafe payments enter before bills close, without duplicate logged receipts", () => {
  const state = { stations: [{ id: "tv", name: "TV 1", session: { settlements: [{ id: "p1", at: stamp(9), payment: "QRIS BCA", amount: 20000 }] } }], cafeTables: [{ id: "cafe", name: "1", settlements: [{ id: "p2", at: stamp(9), payment: "QRIS BCA", amount: 30000 }] }], history: [] };
  expect(total(rows(pendingPaymentRecords(state)))).toBe(50000);
  state.history = [history([{ method: "QRIS BCA", amount: 20000, at: stamp(9) }])];
  state.stations[0].session.historyId = "bill-1";
  expect(total(rows([...state.history, ...pendingPaymentRecords(state)]))).toBe(50000);
});
test("Cash and Playing Card redemptions are not merchant QRIS receipts", () => {
  expect(total(rows([history([{ method: "Cash", amount: 50000 }, { method: "Playing Card", amount: 100000 }])]))).toBe(0);
});
test("QRIS refund stays a negative amount; DP application stays internal", () => {
  expect(total(rows([], [cash("card-topup", 20000, stamp(9), { direction: "out" }), cash("booking-dp-used", 100000)]))).toBe(-20000);
});