import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

// Node 26 ships an experimental `localStorage` global that is undefined unless
// launched with --localstorage-file, and jsdom refuses to expose localStorage
// on opaque origins (`about:blank`). Install an in-memory polyfill so every
// test suite sees a working Storage regardless of the jsdom URL.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(i: number) {
      return Array.from(store.keys())[i] ?? null;
    },
    getItem(k: string) {
      return store.has(k) ? (store.get(k) as string) : null;
    },
    setItem(k: string, v: string) {
      store.set(k, String(v));
    },
    removeItem(k: string) {
      store.delete(k);
    },
    clear() {
      store.clear();
    }
  } as Storage;
}

if (typeof window !== 'undefined') {
  const ls = window.localStorage ?? makeMemoryStorage();
  const ss = window.sessionStorage ?? makeMemoryStorage();
  Object.defineProperty(window, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: ss, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: ss, configurable: true });
}

// Recharts' ResponsiveContainer observes its parent in real browsers. jsdom
// has no layout engine or ResizeObserver, so a no-op observer is sufficient for
// interaction tests that render the Dashboard around the chart.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    configurable: true
  });
}
