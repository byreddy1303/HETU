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

// PageHeader / LearningSculpture build scene-visibility observers on mount.
// jsdom has none; a no-op stub keeps those effects inert in tests.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    root = null;
    rootMargin = '';
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: IntersectionObserverStub,
    configurable: true
  });
}

// jsdom does not implement HTMLDialogElement's modal methods, which the
// mobile nav overflow sheet relies on. Provide no-op modal plumbing so
// interaction tests can open/close the sheet. Must stay writable: some
// suites assign their own stub on the prototype.
if (typeof globalThis.HTMLDialogElement !== 'undefined') {
  if (typeof globalThis.HTMLDialogElement.prototype.showModal !== 'function') {
    Object.defineProperty(globalThis.HTMLDialogElement.prototype, 'showModal', {
      value: function showModal(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
      configurable: true,
      writable: true
    });
  }
  if (typeof globalThis.HTMLDialogElement.prototype.close !== 'function') {
    Object.defineProperty(globalThis.HTMLDialogElement.prototype, 'close', {
      value: function close(this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
      configurable: true,
      writable: true
    });
  }
}
