import { expect, test } from 'bun:test';
import { compactSyncCache, isStorageQuotaError, writeWithQuotaRecovery } from '../src/lib/storage-quota';

class LimitedStorage {
  values = new Map();
  limit = 1000;
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    const size = [...this.values].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0) + value.length;
    if (size > this.limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    this.values.set(key, value);
  }
}

test('compaction preserves record identities and offline work for both stores', () => {
  const storage = new LimitedStorage();
  storage.setItem('billing-sync-shadow-v1', JSON.stringify({ 'station:1': '{"session":"active"}', 'history:2': '{"total":10000}' }));
  storage.setItem('billing-intent-queue-v2:a:old', 'offline-a');
  storage.setItem('billing-intent-queue-v2:b:old', 'offline-b');
  storage.setItem('billing-ps-state-v1', 'snapshot');
  expect(compactSyncCache(storage)).toBe(true);
  expect(JSON.parse(storage.getItem('billing-sync-shadow-v1'))).toEqual({ 'station:1': true, 'history:2': true });
  expect(storage.getItem('billing-intent-queue-v2:a:old')).toBe('offline-a');
  expect(storage.getItem('billing-intent-queue-v2:b:old')).toBe('offline-b');
  expect(storage.getItem('billing-ps-state-v1')).toBe('snapshot');
});

test('full-storage durable write retries after removing only duplicate payloads', () => {
  const storage = new LimitedStorage();
  storage.setItem('billing-sync-shadow-v1', JSON.stringify({ 'history:1': 'x'.repeat(900) }));
  writeWithQuotaRecovery(storage, 'billing-intent-queue-v2:a:new', 'x'.repeat(200));
  expect(storage.getItem('billing-intent-queue-v2:a:new')).toHaveLength(200);
  expect(JSON.parse(storage.getItem('billing-sync-shadow-v1'))).toEqual({ 'history:1': true });
});

test('insufficient room still throws without overwriting pending transactions', () => {
  const storage = new LimitedStorage();
  storage.setItem('billing-intent-queue-v2:a:old', 'x'.repeat(900));
  expect(() => writeWithQuotaRecovery(storage, 'billing-intent-queue-v2:a:old', 'y'.repeat(1100))).toThrow();
  expect(storage.getItem('billing-intent-queue-v2:a:old')).toBe('x'.repeat(900));
});

test('malformed cache and unrelated errors are not treated as removable data', () => {
  const storage = new LimitedStorage();
  storage.setItem('billing-sync-shadow-v1', '{broken');
  expect(compactSyncCache(storage)).toBe(false);
  expect(storage.getItem('billing-sync-shadow-v1')).toBe('{broken');
  expect(isStorageQuotaError(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).toBe(true);
  expect(isStorageQuotaError(new Error('Failed to fetch'))).toBe(false);
});