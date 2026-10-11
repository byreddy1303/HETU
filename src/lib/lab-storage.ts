import { apiClient } from '@/lib/api-client';

const NAMESPACE = 'linear_algebra_lab:';
const PAGE_SIZE = 100;
const validKey = (key: string) => /^(?:la-hub::|gate_la_)[a-zA-Z0-9_:-]{1,140}$/.test(key);
export type LabValues = Record<string, string>;
export type LabSaveStatus = { pending: number; error: string | null };

/** Separate rows keep a change in one module from overwriting another module. */
export async function loadLabValues(userId: string): Promise<LabValues> {
  const values: LabValues = {};
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await apiClient.from('account_state').select('namespace,payload')
      .eq('user_id', userId).order('namespace').range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (typeof row.namespace !== 'string' || !row.namespace.startsWith(NAMESPACE)) continue;
      const key = row.namespace.slice(NAMESPACE.length);
      if (validKey(key) && row.payload?.schemaVersion === 1 && typeof row.payload.data === 'string') {
        values[key] = row.payload.data;
      }
    }
    if ((data?.length ?? 0) < PAGE_SIZE) return values;
  }
}

export async function saveLabValue(userId: string, key: string, value: string | null): Promise<void> {
  if (!validKey(key)) throw new Error('Unknown lab progress key.');
  const updatedAt = new Date().toISOString();
  const { error } = await apiClient.from('account_state').upsert({
    user_id: userId,
    namespace: NAMESPACE + key,
    payload: { schemaVersion: 1, data: value, updatedAt },
    updated_at: updatedAt
  }, { onConflict: 'user_id,namespace' });
  if (error) throw new Error(error.message);
}

/** Synchronous lab controls read RAM; every edit is immediately sent to Python. */
export function createLabStorage(
  initial: LabValues,
  save: (key: string, value: string | null) => Promise<void>,
  changed: (status: LabSaveStatus) => void
) {
  const values = new Map(Object.entries(initial).filter(([key]) => validKey(key)));
  const pending = new Map<string, { value: string | null; revision: number }>();
  let revision = 0;
  let active: Promise<void> | null = null;
  let error: string | null = null;
  let disposed = false;
  const report = () => changed({ pending: pending.size, error });

  function flush(): Promise<void> {
    if (active) return active;
    if (disposed) return Promise.resolve();
    error = null;
    const run = async () => {
      while (pending.size && !disposed) {
        const [key, item] = pending.entries().next().value!;
        try {
          await save(key, item.value);
          if (pending.get(key)?.revision === item.revision) pending.delete(key);
        } catch (cause) {
          error = cause instanceof Error ? cause.message : 'Unable to save lab progress.';
          break;
        }
        report();
      }
    };
    active = run().finally(() => {
      active = null;
      report();
      if (pending.size && !error && !disposed) void flush();
    });
    return active;
  }

  function write(key: string, value: string | null) {
    if (disposed) throw new Error('This lab session is closed. Reopen it before continuing.');
    if (!validKey(key)) throw new Error('Unknown lab progress key.');
    if (value !== null && value.length > 500_000) throw new Error('Lab progress is too large to save.');
    if ((values.get(key) ?? null) === value) return;
    if (value === null) values.delete(key);
    else values.set(key, value);
    pending.set(key, { value, revision: ++revision });
    error = null;
    report();
    void flush();
  }

  const storage: Storage = {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    setItem: (key, value) => write(key, String(value)),
    removeItem: (key) => write(key, null),
    clear: () => { for (const key of [...values.keys()]) write(key, null); }
  };
  return {
    storage,
    flush,
    hasPending: () => pending.size > 0,
    dispose: () => { disposed = true; }
  };
}

export type LabStorage = ReturnType<typeof createLabStorage>;

export function labPage(value: string | null): string {
  return value && /^(?:index|module-(?:0[1-9]|1[01])-[a-z-]+)\.html$/.test(value)
    ? value : 'index.html';
}
