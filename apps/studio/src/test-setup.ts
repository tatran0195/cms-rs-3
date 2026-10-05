// Fix for Node 22 experimental localStorage interfering with jsdom
function createStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(String(key)) ?? null,
    setItem: (key: string, val: string) => {
      store.set(String(key), String(val));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

const mockLocalStorage = createStorageMock();
const mockSessionStorage = createStorageMock();

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: mockSessionStorage,
    configurable: true,
    writable: true,
  });
} catch {
  // Storage properties may be non-configurable in some test runner environments
}

if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      configurable: true,
      writable: true,
    });
  } catch {
    // Window storage properties may be non-configurable in some browser/JSDOM environments
  }
}
