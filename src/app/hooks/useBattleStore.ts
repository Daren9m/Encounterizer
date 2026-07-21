'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  BattlePersistenceError,
  SERVER_BATTLE_STORE_SNAPSHOT,
  createBattleStore,
  type BattleStore,
  type BattleStoreSnapshot,
  type BattleWriteResult,
} from '@/lib/battle-store';
import type { BattleState } from '@/lib/battle-organizer';

let browserStore: BattleStore | null = null;

function noopSubscribe(): () => void {
  return () => undefined;
}

function serverSnapshot(): BattleStoreSnapshot {
  return SERVER_BATTLE_STORE_SNAPSHOT;
}

export function getBrowserBattleStore(): BattleStore | null {
  if (typeof window === 'undefined') return null;
  if (!browserStore) {
    let storage: Storage | null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    browserStore = createBattleStore({
      storage,
      subscribeToStorage(listener) {
        const handleStorage = (event: StorageEvent) => {
          listener({ key: event.key, newValue: event.newValue });
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
      },
    });
  }
  return browserStore;
}

function unavailableResult(): BattleWriteResult {
  return {
    ok: false,
    error: new BattlePersistenceError(
      'unavailable',
      'Battle changes can only be saved in the browser.',
    ),
  };
}

/** Non-hook handoff for Encounter Builder and other client-side producers. */
export function replaceBattleState(next: BattleState): BattleWriteResult {
  return getBrowserBattleStore()?.replace(next) ?? unavailableResult();
}

export interface BattleStoreApi extends BattleStoreSnapshot {
  updateBattle: (
    transform: (current: BattleState) => BattleState,
  ) => BattleWriteResult;
  replaceBattle: (next: BattleState) => BattleWriteResult;
  retryPersistence: () => BattleWriteResult;
}

export function useBattleStore(): BattleStoreApi {
  const store = getBrowserBattleStore();
  const snapshot = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    store?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );

  const updateBattle = useCallback(
    (transform: (current: BattleState) => BattleState) => store?.update(transform)
      ?? unavailableResult(),
    [store],
  );
  const replaceBattle = useCallback(
    (next: BattleState) => store?.replace(next) ?? unavailableResult(),
    [store],
  );
  const retryPersistence = useCallback(
    () => store?.retryPersistence() ?? unavailableResult(),
    [store],
  );

  return {
    ...snapshot,
    updateBattle,
    replaceBattle,
    retryPersistence,
  };
}
