import { expect, test } from 'bun:test';
import { captureIntent, enqueueIntent, reconcileIntents } from '../src/lib/sync-intent';
const state = (extra = {}) => ({ storeId: 'store-a', stations: [{ id: 's1', session: { startAt: 100 } }], menu: [{ id: 'coffee', price: 10000 }], ...extra });
const row = (kind, id, payload, base, transaction = 'action') => ({ kind, entity_id: id, payload, base, transaction, deleted: false });

test('opening an unchanged old cache creates no outgoing actions', () => {
  expect(captureIntent(state(), state())).toEqual([]);
});
test('remote menu price edit only captures menu, not cached stations', () => {
  const actions = captureIntent(state(), state({ menu: [{ id: 'coffee', price: 12000 }] }));
  expect(actions.map(a => a.kind)).toEqual(['menu']);
  expect(actions[0].payload.price).toBe(12000);
});
test('store switch never publishes previous store data', () => {
  expect(captureIntent(state(), state({ storeId: 'store-b', stations: [] }))).toEqual([]);
});
test('new offline reservation retains absent base through later edits', () => {
  const outbox = {};
  enqueueIntent(outbox, [row('booking', 'b1', { id: 'b1', startAt: 100 }, null)]);
  enqueueIntent(outbox, [row('booking', 'b1', { id: 'b1', startAt: 200 }, { id: 'b1', startAt: 100 }, 'later')]);
  expect(outbox['booking:b1'].base).toBeNull();
  expect(outbox['booking:b1'].payload.startAt).toBe(200);
});
test('VOID received centrally rejects cached station and its linked receipt together', () => {
  const outbox = {};
  enqueueIntent(outbox, [row('station', 's1', { session: { startAt: 100 } }, { session: { startAt: 100 } }), row('history', 'h1', { total: 10000 }, null)]);
  expect(reconcileIntents(outbox, [{ kind: 'station', entity_id: 's1', payload: { session: null }, deleted: false }])).toBe(1);
  expect(Object.keys(outbox)).toEqual([]);
});
test('different station cashier and unrelated reservation remain queued', () => {
  const outbox = {};
  enqueueIntent(outbox, [row('station', 's1', { session: null }, { session: { startAt: 100 } })]);
  enqueueIntent(outbox, [row('booking', 'b1', { startAt: 300 }, null, 'reserve')]);
  expect(reconcileIntents(outbox, [{ kind: 'station', entity_id: 's2', payload: { session: { startAt: 200 } }, deleted: false }])).toBe(0);
  expect(Object.keys(outbox).length).toBe(2);
});
test('retry of an already accepted action is not a conflict', () => {
  const outbox = { 'menu:coffee': row('menu', 'coffee', { price: 12000 }, { price: 10000 }) };
  expect(reconcileIntents(outbox, [{ kind: 'menu', entity_id: 'coffee', payload: { price: 12000 }, deleted: false }])).toBe(0);
});
test('remote deletion cannot be resurrected from queued local data', () => {
  const outbox = { 'menu:coffee': row('menu', 'coffee', { price: 12000 }, { price: 10000 }) };
  expect(reconcileIntents(outbox, [{ kind: 'menu', entity_id: 'coffee', payload: {}, deleted: true }])).toBe(1);
  expect(outbox).toEqual({});
});