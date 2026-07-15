import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageLoad, storageRemove, storageSave } from '@/lib/storage';

function fakeLocalStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
    ...overrides,
  } as Storage;
}

function stubWindow(localStorage: Storage) {
  vi.stubGlobal('window', { localStorage });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('round-trips JSON values under the versioned prefix', () => {
    const ls = fakeLocalStorage();
    stubWindow(ls);

    expect(storageSave('settings', { level: 5 })).toBe(true);
    expect(ls.getItem('encounterizer:v1:settings')).toBe('{"level":5}');
    expect(storageLoad('settings', { level: 1 })).toEqual({ level: 5 });
  });

  it('returns the fallback when nothing is stored', () => {
    stubWindow(fakeLocalStorage());
    expect(storageLoad('missing', 'default')).toBe('default');
  });

  it('returns the fallback on corrupt JSON', () => {
    const ls = fakeLocalStorage();
    ls.setItem('encounterizer:v1:bad', '{not json');
    stubWindow(ls);
    expect(storageLoad('bad', 42)).toBe(42);
  });

  it('returns the fallback when validation rejects the stored value', () => {
    const ls = fakeLocalStorage();
    ls.setItem('encounterizer:v1:num', '"a string"');
    stubWindow(ls);
    const isNumber = (v: unknown): v is number => typeof v === 'number';
    expect(storageLoad('num', 7, isNumber)).toBe(7);
  });

  it('is safe on the server (no window)', () => {
    expect(storageLoad('anything', 'ssr-fallback')).toBe('ssr-fallback');
    expect(storageSave('anything', 1)).toBe(false);
    expect(() => storageRemove('anything')).not.toThrow();
  });

  it('tolerates quota errors on save', () => {
    stubWindow(
      fakeLocalStorage({
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError');
        },
      }),
    );
    expect(storageSave('big', 'x'.repeat(10))).toBe(false);
  });

  it('removes stored values', () => {
    const ls = fakeLocalStorage();
    stubWindow(ls);
    storageSave('gone', 1);
    storageRemove('gone');
    expect(ls.getItem('encounterizer:v1:gone')).toBeNull();
  });
});
