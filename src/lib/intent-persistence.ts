import { enqueueIntent, type Intent } from './sync-intent';

export const INTENT_QUEUE_PREFIX = 'billing-intent-queue-v2:';
export type IntentEnvelope = {
  version: 2;
  storeId: string;
  owner: string;
  journal: Intent[];
  outbox: Record<string, Intent>;
};
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;
export type LockPort = {
  request(name: string, options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<void>): Promise<unknown>;
};

const validIntent = (row: unknown): row is Intent => {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return typeof r['kind'] === 'string' && typeof r['entity_id'] === 'string' &&
    typeof r['transaction'] === 'string' && !!r['transaction'] && typeof r['deleted'] === 'boolean' &&
    !!r['payload'] && typeof r['payload'] === 'object' &&
    (r['base'] === null || (!!r['base'] && typeof r['base'] === 'object'));
};

function readEnvelope(storage: StoragePort, key: string): IntentEnvelope | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null') as IntentEnvelope | null;
    if (value?.version !== 2 || typeof value.storeId !== 'string' || typeof value.owner !== 'string' ||
        !Array.isArray(value.journal) || !value.journal.every(validIntent) ||
        !value.outbox || !Object.values(value.outbox).every(validIntent) ||
        key !== `${INTENT_QUEUE_PREFIX}${value.storeId}:${value.owner}`) return null;
    return value;
  } catch { return null; }
}

/** Independent durable shards. A lifetime Web Lock prevents live-tab takeover. */
export class IntentPersistence {
  private held = new Map<string, () => void>();
  private shards = new Map<string, IntentEnvelope>();
  private own = new Map<string, IntentEnvelope>();
  private opening = new Map<string, Promise<void>>();

  constructor(private storage: StoragePort, private locks: LockPort | undefined, private owner: string) {}

  private key(shard: IntentEnvelope) { return `${INTENT_QUEUE_PREFIX}${shard.storeId}:${shard.owner}`; }

  private async claim(key: string) {
    if (this.held.has(key)) return true;
    if (!this.locks) return false;
    return new Promise<boolean>((resolve, reject) => {
      void this.locks?.request(key, { ifAvailable: true }, async lock => {
        if (!lock) { resolve(false); return; }
        await new Promise<void>(release => {
          this.held.set(key, release);
          resolve(true);
        });
      }).catch(reject);
    });
  }

  persist(shard: IntentEnvelope) {
    this.storage.setItem(this.key(shard), JSON.stringify(shard));
  }

  open(storeId: string): Promise<void> {
    const previous = this.opening.get(storeId);
    if (previous) return previous;
    const opening = this.openStore(storeId).catch(error => {
      this.opening.delete(storeId);
      throw error;
    });
    this.opening.set(storeId, opening);
    return opening;
  }

  private async openStore(storeId: string) {
    const shard: IntentEnvelope = this.own.get(storeId) ?? {
      version: 2, storeId, owner: this.owner, journal: [], outbox: {},
    };
    this.own.set(storeId, shard);
    const ownKey = this.key(shard);
    // A fresh random runtime owner also isolates tabs created by "duplicate tab".
    if (this.locks && !await this.claim(ownKey)) throw new Error('Antrean perangkat sedang dipakai jendela lain.');
    this.persist(shard);
    this.shards.set(ownKey, shard);
    const keys = Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i))
      .filter((key): key is string => !!key && key.startsWith(INTENT_QUEUE_PREFIX) && key !== ownKey);
    for (const key of keys) {
      const saved = readEnvelope(this.storage, key);
      if (!saved || saved.storeId !== storeId || (!saved.journal.length && !Object.keys(saved.outbox).length)) continue;
      if (!this.locks) throw new Error('Transaksi luring lama tetap disimpan, tetapi perangkat ini belum mendukung pemulihan antrean yang aman.');
      if (!await this.claim(key)) continue;
      // Re-read only after the exclusive lock: a closing tab may have just saved.
      const latest = readEnvelope(this.storage, key);
      if (!latest || latest.storeId !== storeId) continue;
      this.shards.set(key, latest);
    }
    for (const queue of this.queues(storeId)) this.drain(queue, queue.journal);
  }

  queues(storeId: string) {
    // Older recovered work precedes this runtime's edits. New actions may use
    // an older pending payload as their base, and must be applied/sent last.
    return [...this.shards.values()].filter(shard => shard.storeId === storeId)
      .sort((a, b) => Number(a.owner === this.owner) - Number(b.owner === this.owner));
  }
  ownQueue(storeId: string) { return this.own.get(storeId); }

  saveJournal(storeId: string, rows: Intent[]) {
    const shard = this.own.get(storeId) ?? { version: 2 as const, storeId, owner: this.owner, journal: [], outbox: {} };
    this.own.set(storeId, shard);
    shard.journal = rows.slice();
    // Before initialization these rows remain in memory; open() persists them
    // under its lock before admitting any remote baseline.
    if (this.shards.has(this.key(shard))) this.persist(shard);
  }

  drain(shard: IntentEnvelope, rows: Intent[]) {
    const outbox = structuredClone(shard.outbox);
    for (const transaction of new Set(rows.map(row => row.transaction))) {
      enqueueIntent(outbox, rows.filter(row => row.transaction === transaction));
    }
    const next = { ...shard, outbox, journal: [] };
    // Commit both sides in one write. A failure leaves journal and outbox intact.
    this.persist(next);
    shard.outbox = outbox;
    shard.journal = [];
  }

  drainOwn(storeId: string, rows: Intent[]) {
    const shard = this.own.get(storeId);
    if (!shard || !this.shards.has(this.key(shard))) throw new Error('Antrean transaksi belum siap.');
    this.drain(shard, rows);
  }

  close() {
    for (const release of this.held.values()) release();
    this.held.clear();
    this.shards.clear();
    this.opening.clear();
  }
}

let instance: IntentPersistence | undefined;
export function intentPersistence() {
  if (!instance) instance = new IntentPersistence(localStorage, navigator.locks, crypto.randomUUID());
  return instance;
}