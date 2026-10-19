import { expect, test } from 'bun:test';
import { IntentPersistence, INTENT_QUEUE_PREFIX } from '../src/lib/intent-persistence';
import { reconcileIntents } from '../src/lib/sync-intent';

class MemoryStorage {
  values = new Map();
  fail = false;
  get length() { return this.values.size; }
  key(i) { return [...this.values.keys()][i] ?? null; }
  getItem(k) { return this.values.get(k) ?? null; }
  setItem(k, v) { if (this.fail) throw new Error('quota'); this.values.set(k, v); }
}
class Locks {
  held = new Set();
  async request(key, _options, callback) {
    if (this.held.has(key)) return callback(null);
    this.held.add(key);
    try { await callback({ name: key }); } finally { this.held.delete(key); }
  }
}
const row = (id = 'sale-1', transaction = 'sale') => ({ kind: 'history', entity_id: id, payload: { id, total: 10000 }, deleted: false, base: null, transaction });
const setup = () => ({ storage: new MemoryStorage(), locks: new Locks() });
const shutdown = async queue => { queue.close(); await Promise.resolve(); await Promise.resolve(); };

test('offline journal survives closing app and opening with a new tab identity', async () => {
  const { storage, locks } = setup();
  const first = new IntentPersistence(storage, locks, 'old-tab');
  await first.open('store-a');
  first.saveJournal('store-a', [row()]);
  await shutdown(first);
  const reopened = new IntentPersistence(storage, locks, 'new-tab');
  await reopened.open('store-a');
  const recovered = reopened.queues('store-a').flatMap(q => Object.values(q.outbox));
  expect(recovered).toEqual([row()]);
  reopened.close();
});

test('durable outbox survives restart with linked transaction and original base', async () => {
  const { storage, locks } = setup();
  const first = new IntentPersistence(storage, locks, 'old-tab');
  await first.open('store-a');
  const rows = [row(), { ...row('station-1'), kind: 'station', base: { session: null } }];
  first.saveJournal('store-a', rows);
  first.drainOwn('store-a', rows);
  await shutdown(first);
  const reopened = new IntentPersistence(storage, locks, 'new-tab');
  await reopened.open('store-a');
  expect(reopened.queues('store-a').flatMap(q => Object.values(q.outbox))).toEqual(rows);
  reopened.close();
});

test('live tabs never take each others queues even for the same entity', async () => {
  const { storage, locks } = setup();
  const a = new IntentPersistence(storage, locks, 'a');
  await a.open('store-a');
  a.saveJournal('store-a', [row()]);
  const b = new IntentPersistence(storage, locks, 'b');
  await b.open('store-a');
  expect(b.queues('store-a').map(q => q.owner)).toEqual(['b']);
  b.saveJournal('store-a', [{ ...row(), payload: { total: 20000 } }]);
  expect(JSON.parse(storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:a`)).journal[0].payload.total).toBe(10000);
  a.close(); b.close();
});

test('two recovery claimants cannot both adopt the closed tab queue', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a'); old.saveJournal('store-a', [row()]);
  await shutdown(old);
  const a = new IntentPersistence(storage, locks, 'a');
  const b = new IntentPersistence(storage, locks, 'b');
  await Promise.all([a.open('store-a'), b.open('store-a')]);
  expect([...a.queues('store-a'), ...b.queues('store-a')].filter(q => q.owner === 'old')).toHaveLength(1);
  a.close(); b.close();
});

test('store-a offline transactions are untouched when opening store-b', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a'); old.saveJournal('store-a', [row()]);
  await shutdown(old);
  const before = storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:old`);
  const fresh = new IntentPersistence(storage, locks, 'fresh');
  await fresh.open('store-b');
  expect(fresh.queues('store-b').flatMap(q => Object.values(q.outbox))).toEqual([]);
  expect(storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:old`)).toBe(before);
  fresh.close();
});

test('failed atomic handoff leaves durable journal and in-memory outbox intact', async () => {
  const { storage, locks } = setup();
  const queue = new IntentPersistence(storage, locks, 'a');
  await queue.open('store-a'); queue.saveJournal('store-a', [row()]);
  storage.fail = true;
  expect(() => queue.drainOwn('store-a', [row()])).toThrow('quota');
  const saved = JSON.parse(storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:a`));
  expect(saved.journal).toEqual([row()]);
  expect(saved.outbox).toEqual({});
  expect(queue.ownQueue('store-a').journal).toEqual([row()]);
  queue.close();
});

test('recovered linked actions conflict together; an accepted retry stays safe', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a');
  const rows = [row(), { ...row('station-1'), kind: 'station', base: { session: null } }];
  old.drainOwn('store-a', rows); await shutdown(old);
  const fresh = new IntentPersistence(storage, locks, 'fresh');
  await fresh.open('store-a');
  const queue = fresh.queues('store-a').find(q => q.owner === 'old');
  expect(reconcileIntents(queue.outbox, [row()])).toBe(0);
  expect(reconcileIntents(queue.outbox, [{ kind: 'station', entity_id: 'station-1', payload: {}, deleted: true }])).toBe(1);
  expect(queue.outbox).toEqual({});
  fresh.close();
});

test('unscoped legacy queues are retained and never adopted into a guessed store', async () => {
  const { storage, locks } = setup();
  storage.setItem('billing-intents-old-outbox', JSON.stringify({ 'history:sale-1': row() }));
  const queue = new IntentPersistence(storage, locks, 'new');
  await queue.open('store-a');
  expect(queue.queues('store-a').flatMap(q => Object.values(q.outbox))).toEqual([]);
  expect(storage.getItem('billing-intents-old-outbox')).toBeTruthy();
  queue.close();
});

test('without cross-tab locking, recovery is blocked without deleting saved work', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a'); old.saveJournal('store-a', [row()]); await shutdown(old);
  const fresh = new IntentPersistence(storage, undefined, 'new');
  await expect(fresh.open('store-a')).rejects.toThrow('pemulihan');
  expect(JSON.parse(storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:old`)).journal).toEqual([row()]);
  fresh.close();
});

test('new edits after recovery overlay and send after recovered earlier work', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a'); old.drainOwn('store-a', [row()]); await shutdown(old);
  const fresh = new IntentPersistence(storage, locks, 'fresh');
  await fresh.open('store-a');
  const edit = { ...row(), transaction: 'later', payload: { total: 20000 }, base: row().payload };
  fresh.saveJournal('store-a', [edit]); fresh.drainOwn('store-a', [edit]);
  expect(fresh.queues('store-a').flatMap(q => Object.values(q.outbox))).toEqual([row(), edit]);
  await fresh.open('store-a');
  expect(fresh.queues('store-a').flatMap(q => Object.values(q.outbox))).toEqual([row(), edit]);
  fresh.close();
});

test('failed recovery drain can retry without discarding its journal', async () => {
  const { storage, locks } = setup();
  const old = new IntentPersistence(storage, locks, 'old');
  await old.open('store-a'); old.saveJournal('store-a', [row()]); await shutdown(old);
  const fresh = new IntentPersistence(storage, locks, 'fresh');
  const original = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === `${INTENT_QUEUE_PREFIX}store-a:old`) throw new Error('quota');
    original(key, value);
  };
  await expect(fresh.open('store-a')).rejects.toThrow('quota');
  expect(JSON.parse(storage.getItem(`${INTENT_QUEUE_PREFIX}store-a:old`)).journal).toEqual([row()]);
  storage.setItem = original;
  await fresh.open('store-a');
  expect(fresh.queues('store-a').flatMap(q => Object.values(q.outbox))).toEqual([row()]);
  fresh.close();
});