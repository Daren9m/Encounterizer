'use client';

// ─── Custom Monster Store ────────────────────────────────────────
// Module-singleton store over localStorage, exposed through
// useSyncExternalStore so every consumer re-renders together and the
// server snapshot ([]) never mismatches hydration. The 'storage' event
// keeps multiple tabs in sync.

import { useCallback, useSyncExternalStore } from 'react';
import type { Monster } from '@/lib/types';
import { storageLoad, storageRemove, storageSave } from '@/lib/storage';

const STORAGE_KEY = 'customMonsters';
/** localStorage quota is ~5 MB; leave headroom for other keys. */
const MAX_BYTES = 4 * 1024 * 1024;

interface StoredState {
  version: 1;
  monsters: Monster[];
}

function isStoredState(v: unknown): v is StoredState {
  return (
    typeof v === 'object' && v !== null
    && (v as StoredState).version === 1
    && Array.isArray((v as StoredState).monsters)
  );
}

const EMPTY: Monster[] = [];
let cache: Monster[] | null = null;
const listeners = new Set<() => void>();
let storageListenerBound = false;

function readStore(): Monster[] {
  if (cache === null) {
    cache = storageLoad<StoredState | null>(STORAGE_KEY, null, (v): v is StoredState | null =>
      v === null || isStoredState(v),
    )?.monsters ?? EMPTY;
  }
  return cache;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function writeStore(monsters: Monster[]): { ok: boolean; error?: string } {
  const payload: StoredState = { version: 1, monsters };
  const size = JSON.stringify(payload).length;
  if (size > MAX_BYTES) {
    return {
      ok: false,
      error: `Custom monsters are limited to ~4 MB of storage; this change would use ${(size / 1024 / 1024).toFixed(1)} MB. Remove some monsters first.`,
    };
  }
  if (monsters.length === 0) {
    storageRemove(STORAGE_KEY);
  } else if (!storageSave(STORAGE_KEY, payload)) {
    return {
      ok: false,
      error: 'Saving to browser storage failed (quota exceeded or private browsing). The import was not kept.',
    };
  }
  cache = monsters;
  emit();
  return { ok: true };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListenerBound && typeof window !== 'undefined') {
    storageListenerBound = true;
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key.includes(STORAGE_KEY)) {
        cache = null; // re-read lazily; another tab changed it
        emit();
      }
    });
  }
  return () => listeners.delete(listener);
}

function getServerSnapshot(): Monster[] {
  return EMPTY;
}

export interface CustomMonstersApi {
  customMonsters: Monster[];
  /** Append monsters; returns how many were added or a storage error. */
  addMonsters: (monsters: Monster[]) => { added: number; error?: string };
  removeMonster: (id: string) => void;
  clearAll: () => void;
  /** Native-format JSON ({"monsters": [...]}) — re-importable round trip. */
  exportJson: () => string;
}

export function useCustomMonsters(): CustomMonstersApi {
  const customMonsters = useSyncExternalStore(subscribe, readStore, getServerSnapshot);

  const addMonsters = useCallback((monsters: Monster[]) => {
    if (monsters.length === 0) return { added: 0 };
    const result = writeStore([...readStore(), ...monsters]);
    return result.ok ? { added: monsters.length } : { added: 0, error: result.error };
  }, []);

  const removeMonster = useCallback((id: string) => {
    writeStore(readStore().filter((m) => m.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    writeStore([]);
  }, []);

  const exportJson = useCallback(
    () => JSON.stringify({ monsters: readStore() }, null, 2),
    [],
  );

  return { customMonsters, addMonsters, removeMonster, clearAll, exportJson };
}
