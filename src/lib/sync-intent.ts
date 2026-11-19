import { flattenSnapshot, recordKey, type SyncRecord } from './sync-records';
import type { BillingSnapshot } from './billing-store';
import { intentPersistence } from './intent-persistence';

export type Intent = SyncRecord & { base: Record<string, unknown> | null; transaction: string };
export type IntentQueue = { current: Intent[] };
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

/**
 * Receipts and Log Book rows are append-only history. They disappear from a
 * device's list for local reasons (Log Book cap, trimmed cache, list refresh),
 * which must never delete them centrally. Only explicit actions (delete receipt,
 * cancel payment, VOID, reset/restore) may publish such deletions.
 */
export type DeleteScope = 'none' | 'history' | 'all';
const PROTECTED_DELETES: Record<string, DeleteScope[]> = { history: ['history', 'all'], log_entry: ['all'] };
export const deletionAllowed = (kind: string, scope: DeleteScope) => !PROTECTED_DELETES[kind] || PROTECTED_DELETES[kind].includes(scope);

// Called only at the local mutation boundary, never for hydration or remote reads.
export function captureIntent(before: BillingSnapshot, after: BillingSnapshot, scope: DeleteScope = 'none'): Intent[] {
  if (!before.storeId || before.storeId !== after.storeId) return [];
  const old = flattenSnapshot(before);
  const next = flattenSnapshot(after);
  const transaction = crypto.randomUUID();
  const result: Intent[] = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const previous = old.get(key);
    const record = next.get(key);
    if (canonical(previous?.payload) === canonical(record?.payload)) continue;
    if (!record && previous && !deletionAllowed(previous.kind, scope)) continue;
    const target = record ?? (previous ? { ...previous, payload: {}, deleted: true } : null);
    if (target) result.push({ ...target, base: previous?.payload ?? null, transaction });
  }
  return result;
}

export function enqueueIntent(outbox: Record<string, Intent>, intents: Intent[]) {
  const linked = new Set(intents.map(i => outbox[recordKey(i.kind, i.entity_id)]?.transaction).filter(Boolean));
  const transaction = intents[0]?.transaction;
  if (!transaction) return;
  for (const pending of Object.values(outbox)) if (linked.has(pending.transaction)) pending.transaction = transaction;
  for (const intent of intents) {
    const key = recordKey(intent.kind, intent.entity_id);
    const previous = outbox[key];
    outbox[key] = { ...intent, base: previous ? previous.base : intent.base, transaction };
  }
}

/** Receipt held by a station session sent in the same action; the server validates it via that station. */
export function sessionOwnedReceipt(outbox: Record<string, Intent>, pending: Intent) {
  if (pending.kind !== 'history' || pending.deleted) return false;
  return Object.values(outbox).some(other => {
    if (other.kind !== 'station' || other.transaction !== pending.transaction || other.deleted) return false;
    const ids = [other.base, other.payload].map(p => (p?.['session'] as { historyId?: string } | null | undefined)?.historyId);
    return ids.includes(pending.entity_id);
  });
}

export function reconcileIntents(outbox: Record<string, Intent>, remote: SyncRecord[], preserve?: (rows: Intent[]) => void) {
  const conflicts = new Set<string>();
  for (const row of remote) {
    const pending = outbox[recordKey(row.kind, row.entity_id)];
    // The linked station decides; a stray central change to its receipt is not a conflict.
    if (pending && sessionOwnedReceipt(outbox, pending)) continue;
    if (pending && (row.deleted || canonical(row.payload) !== canonical(pending.base)) &&
        !(row.deleted === pending.deleted && canonical(row.payload) === canonical(pending.payload))) conflicts.add(pending.transaction);
  }
  preserve?.(Object.values(outbox).filter(pending => conflicts.has(pending.transaction)));
  for (const [key, pending] of Object.entries(outbox)) if (conflicts.has(pending.transaction)) delete outbox[key];
  return conflicts.size;
}
// One durable queue per browser tab; independent tabs cannot replace each other's
// offline work. sessionStorage preserves identity across reloads of that tab.
export function intentStorageKey(suffix: string) {
  if (typeof window === 'undefined') return `billing-intents-${suffix}`;
  let id = sessionStorage.getItem('billing-sync-tab');
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('billing-sync-tab', id); }
  return `billing-intents-${id}-${suffix}`;
}
export function saveIntentJournal(rows: Intent[], storeId?: string | null) {
  if (storeId) intentPersistence().saveJournal(storeId, rows);
}
export function loadIntentJournal(): Intent[] {
  // Unscoped old journals stay stored for review, never guessed into a store.
  return [];
}
export function preserveConflicts(rows: Intent[]) {
  if (!rows.length) return;
  try {
    const key = intentStorageKey('conflicts');
    const previous = JSON.parse(localStorage.getItem(key) ?? '[]');
    localStorage.setItem(key, JSON.stringify([...previous, { at: Date.now(), records: rows }]));
  } catch { throw new Error('Transaksi bertabrakan belum bisa disimpan untuk pemeriksaan. Jangan tutup aplikasi; periksa ruang penyimpanan.'); }
}
