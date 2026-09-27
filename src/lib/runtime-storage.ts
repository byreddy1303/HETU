/**
 * Session-lifetime storage for UI caches and device hints.
 * Durable application state belongs in the authenticated online backend.
 */
function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    }
  };
}

const registry = globalThis as typeof globalThis & {
  [key: symbol]: Storage | undefined;
};
const runtimeStorageKey = Symbol.for('hetu.runtimeStorage');
const runtimeSessionStorageKey = Symbol.for('hetu.runtimeSessionStorage');

// Keep one RAM cache across hot reloads and test module resets. A full page
// reload still creates a fresh JavaScript realm and therefore a fresh cache.
export const runtimeStorage = (registry[runtimeStorageKey] ??= createMemoryStorage());
export const runtimeSessionStorage = (registry[runtimeSessionStorageKey] ??= createMemoryStorage());
