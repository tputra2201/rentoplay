import { flattenSnapshot, recordKey, type SyncRecord } from './sync-records';
import type { BillingSnapshot } from './billing-store';

export type Intent = SyncRecord & { base: Record<string, unknown> | null; transaction: string };
export type IntentQueue = { current: Intent[] };
export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

// Called only at the local mutation boundary, never for hydration or remote reads.
export function captureIntent(before: BillingSnapshot, after: BillingSnapshot): Intent[] {
  if (!before.storeId || before.storeId !== after.storeId) return [];
  const old = flattenSnapshot(before);
  const next = flattenSnapshot(after);
  const transaction = crypto.randomUUID();
  const result: Intent[] = [];
  for (const key of new Set([...old.keys(), ...next.keys()])) {
    const previous = old.get(key);
    const record = next.get(key);
    if (canonical(previous?.payload) === canonical(record?.payload)) continue;
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
    outbox[key] = { ...intent, base: outbox[key]?.base ?? intent.base, transaction };
  }
}

export function reconcileIntents(outbox: Record<string, Intent>, remote: SyncRecord[]) {
  const conflicts = new Set<string>();
  for (const row of remote) {
    const pending = outbox[recordKey(row.kind, row.entity_id)];
    if (pending && (row.deleted || canonical(row.payload) !== canonical(pending.base)) &&
        !(row.deleted === pending.deleted && canonical(row.payload) === canonical(pending.payload))) conflicts.add(pending.transaction);
  }
  for (const [key, pending] of Object.entries(outbox)) if (conflicts.has(pending.transaction)) delete outbox[key];
  return conflicts.size;
}