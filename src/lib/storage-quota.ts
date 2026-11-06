type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const SHADOW_KEY = 'billing-sync-shadow-v1';

export function isStorageQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: string; message?: string; code?: number };
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 || e.code === 1014 || /quota.*exceed|exceed.*quota/i.test(e.message ?? '');
}

/** Shadow is only an existence index; payloads are already in the snapshot.
 * Preserve every key and all transaction queues, even across stores/tabs. */
export function compactSyncCache(storage: StoragePort): boolean {
  try {
    const raw = storage.getItem(SHADOW_KEY);
    if (!raw) return false;
    const shadow: unknown = JSON.parse(raw);
    if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return false;
    const entries = Object.entries(shadow);
    if (!entries.every(([, value]) => typeof value === 'string' || value === true)) return false;
    const compact = JSON.stringify(Object.fromEntries(entries.map(([key]) => [key, true])));
    if (compact.length >= raw.length) return false;
    storage.setItem(SHADOW_KEY, compact);
    return true;
  } catch { return false; }
}

/** Durable writes still fail loudly when safe cache compaction is insufficient. */
export function writeWithQuotaRecovery(storage: StoragePort, key: string, value: string): void {
  try { storage.setItem(key, value); }
  catch (error) {
    if (!isStorageQuotaError(error) || !compactSyncCache(storage)) throw error;
    storage.setItem(key, value);
  }
}