import { expect, test } from 'bun:test';
import { captureIntent, reconcileIntents } from '../src/lib/sync-intent';
import { pendingPaymentRecords } from '../src/lib/billing-store';

const base = (extra = {}) => ({ storeId: 'store-a', stations: [], history: [], logEntries: [], ...extra });
const receipt = { id: 'L2-paid-1', total: 44000, ongoing: true };
const logs = n => Array.from({ length: n }, (_, i) => ({ id: `log-${i}` }));

test('a receipt vanishing from the local list is never deleted centrally', () => {
  const out = captureIntent(base({ history: [receipt] }), base({ history: [] }));
  expect(out.filter(i => i.kind === 'history')).toEqual([]);
});
test('Log Book cap on this device never deletes other devices logs centrally', () => {
  const out = captureIntent(base({ logEntries: logs(2000) }), base({ logEntries: [{ id: 'new' }, ...logs(1999)] }));
  expect(out.map(i => `${i.kind}:${i.entity_id}:${i.deleted}`)).toEqual(['log_entry:new:false']);
});
test('explicit receipt delete (Laporan, cancel payment, VOID) is still sent', () => {
  const out = captureIntent(base({ history: [receipt] }), base({ history: [] }), 'history');
  expect(out).toHaveLength(1);
  expect(out[0].deleted).toBe(true);
});
test('receipt of a live session stays queued when the centre shows it deleted', () => {
  const station = { kind: 'station', entity_id: 'L1', base: { session: { historyId: 'L2-paid-1' } }, payload: { session: null }, deleted: false, transaction: 'stop' };
  const done = { kind: 'history', entity_id: 'L2-paid-1', base: null, payload: { total: 44000, ongoing: false }, deleted: false, transaction: 'stop' };
  const outbox = { 'station:L1': station, 'history:L2-paid-1': done };
  expect(reconcileIntents(outbox, [{ kind: 'history', entity_id: 'L2-paid-1', payload: {}, deleted: true }])).toBe(0);
  expect(Object.keys(outbox)).toHaveLength(2);
});
test('VOID at the centre still cancels the stale stop together with its receipt', () => {
  const station = { kind: 'station', entity_id: 'L1', base: { session: { historyId: 'h' } }, payload: { session: null }, deleted: false, transaction: 'stop' };
  const done = { kind: 'history', entity_id: 'h', base: null, payload: { total: 1 }, deleted: false, transaction: 'stop' };
  const outbox = { 'station:L1': station, 'history:h': done };
  expect(reconcileIntents(outbox, [{ kind: 'station', entity_id: 'L1', payload: { session: null, v: 2 }, deleted: false }])).toBe(1);
  expect(Object.keys(outbox)).toEqual([]);
});
test('paid session whose receipt is not readable still counts its 44.000 in the shift', () => {
  const settlement = { id: 'p', at: 10, amount: 44000, amountPaid: 44000, change: 0, payment: 'QRIS' };
  const rows = pendingPaymentRecords({ history: [], cafeTables: [], stations: [{ id: 'L1', name: 'L1', session: { historyId: 'L2-paid-1', paidAt: 10, settlements: [settlement] } }] });
  expect(rows.reduce((s, r) => s + r.total, 0)).toBe(44000);
});
test('paid session with readable receipt is not counted twice', () => {
  const settlement = { id: 'p', at: 10, amount: 44000, amountPaid: 44000, change: 0, payment: 'QRIS' };
  const rows = pendingPaymentRecords({ history: [receipt], cafeTables: [], stations: [{ id: 'L1', name: 'L1', session: { historyId: 'L2-paid-1', paidAt: 10, settlements: [settlement] } }] });
  expect(rows).toEqual([]);
});
