'use client';

// ─── Custom Spell Store ──────────────────────────────────────────
// Module-singleton store over localStorage, exposed through
// useSyncExternalStore so every consumer re-renders together and the
// server snapshot ([]) never mismatches hydration. The 'storage' event
// keeps multiple tabs in sync. Mirrors useCustomMonsters.

import { useCallback, useSyncExternalStore } from 'react';
import type { Spell } from '@/data/spells';
import { storageLoad, storageRemove, storageSave } from '@/lib/storage';

const STORAGE_KEY = 'customSpells';
/** localStorage quota is ~5 MB shared with custom monsters; leave headroom. */
const MAX_BYTES = 2 * 1024 * 1024;

interface StoredState {
  version: 1;
  spells: Spell[];
}

function isStoredState(v: unknown): v is StoredState {
  return (
    typeof v === 'object' && v !== null
    && (v as StoredState).version === 1
    && Array.isArray((v as StoredState).spells)
  );
}

const EMPTY: Spell[] = [];
let cache: Spell[] | null = null;
const listeners = new Set<() => void>();
let storageListenerBound = false;

function readStore(): Spell[] {
  if (cache === null) {
    cache = storageLoad<StoredState | null>(STORAGE_KEY, null, (v): v is StoredState | null =>
      v === null || isStoredState(v),
    )?.spells ?? EMPTY;
  }
  return cache;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function writeStore(spells: Spell[]): { ok: boolean; error?: string } {
  const payload: StoredState = { version: 1, spells };
  const size = JSON.stringify(payload).length;
  if (size > MAX_BYTES) {
    return {
      ok: false,
      error: `Custom spells are limited to ~2 MB of storage; this change would use ${(size / 1024 / 1024).toFixed(1)} MB. Remove some spells first.`,
    };
  }
  if (spells.length === 0) {
    storageRemove(STORAGE_KEY);
  } else if (!storageSave(STORAGE_KEY, payload)) {
    return {
      ok: false,
      error: 'Saving to browser storage failed (quota exceeded or private browsing). The import was not kept.',
    };
  }
  cache = spells;
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

function getServerSnapshot(): Spell[] {
  return EMPTY;
}

export interface CustomSpellsApi {
  customSpells: Spell[];
  /** Append spells; returns how many were added or a storage error. */
  addSpells: (spells: Spell[]) => { added: number; error?: string };
  removeSpell: (id: string) => void;
  clearAll: () => void;
  /** Native-format JSON ({"spells": [...]}) — re-importable round trip. */
  exportJson: () => string;
}

export function useCustomSpells(): CustomSpellsApi {
  const customSpells = useSyncExternalStore(subscribe, readStore, getServerSnapshot);

  const addSpells = useCallback((spells: Spell[]) => {
    if (spells.length === 0) return { added: 0 };
    const result = writeStore([...readStore(), ...spells]);
    return result.ok ? { added: spells.length } : { added: 0, error: result.error };
  }, []);

  const removeSpell = useCallback((id: string) => {
    writeStore(readStore().filter((s) => s.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    writeStore([]);
  }, []);

  const exportJson = useCallback(
    () => JSON.stringify({ spells: readStore() }, null, 2),
    [],
  );

  return { customSpells, addSpells, removeSpell, clearAll, exportJson };
}
