const memory = new Map<string, string>();

function getBackend(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const testKey = '__smq_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch {
    return null;
  }
}

export const safeStorage = {
  getItem(key: string): string | null {
    const backend = getBackend();
    if (backend) {
      try {
        return backend.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    }
    return memory.get(key) ?? null;
  },

  setItem(key: string, value: string): boolean {
    const backend = getBackend();
    if (!backend) {
      memory.set(key, value);
      return true;
    }
    try {
      backend.setItem(key, value);
      return true;
    } catch {
      memory.set(key, value);
      return false;
    }
  },

  removeItem(key: string): void {
    const backend = getBackend();
    if (backend) {
      try {
        backend.removeItem(key);
      } catch {
        // ignore
      }
    }
    memory.delete(key);
  },

  getJSON<T>(key: string): T | null {
    const raw = this.getItem(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJSON(key: string, value: unknown): boolean {
    return this.setItem(key, JSON.stringify(value));
  },
};
