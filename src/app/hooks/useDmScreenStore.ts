'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { IndexedDbDmScreenDocumentStore } from '@/lib/dm-screen-indexeddb';
import { BrowserDmScreenCommitNotifier } from '@/lib/dm-screen-notifications';
import {
  DmScreenStorageError,
  SERVER_DM_SCREEN_SNAPSHOT,
  createDmScreenRepository,
  type DmScreenLegacyReadResult,
  type DmScreenRepository,
  type DmScreenStoreSnapshot,
  type DmScreenWriteResult,
} from '@/lib/dm-screen-repository';
import type { DmScreenState } from '@/lib/dm-screen';
import { storageKey } from '@/lib/storage';

export const LEGACY_DM_SCREEN_STORAGE_KEY = storageKey('dmScreen');

let browserRepository: DmScreenRepository | null = null;

function noopSubscribe(): () => void {
  return () => undefined;
}

function serverSnapshot(): DmScreenStoreSnapshot {
  return SERVER_DM_SCREEN_SNAPSHOT;
}

function readLegacyDmScreen(browserWindow: Window): DmScreenLegacyReadResult {
  let raw: string | null;
  try {
    raw = browserWindow.localStorage.getItem(LEGACY_DM_SCREEN_STORAGE_KEY);
  } catch (cause) {
    return {
      ok: false,
      error: new DmScreenStorageError(
        'unavailable',
        'The existing DM Screen could not be read because browser storage is unavailable.',
        { cause },
      ),
    };
  }
  if (raw === null) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (cause) {
    return {
      ok: false,
      error: new DmScreenStorageError(
        'invalid-document',
        'The existing DM Screen is not valid JSON and was left untouched.',
        { cause },
      ),
    };
  }
}

export function getBrowserDmScreenRepository(): DmScreenRepository | null {
  if (typeof window === 'undefined') return null;
  if (!browserRepository) {
    browserRepository = createDmScreenRepository({
      store: new IndexedDbDmScreenDocumentStore(),
      notifier: new BrowserDmScreenCommitNotifier(window),
      readLegacy: () => readLegacyDmScreen(window),
      clearLegacy() {
        try {
          window.localStorage.removeItem(LEGACY_DM_SCREEN_STORAGE_KEY);
        } catch {
          // The committed IndexedDB document remains authoritative.
        }
      },
    });
  }
  return browserRepository;
}

function unavailableResult(): DmScreenWriteResult {
  return {
    ok: false,
    error: new DmScreenStorageError(
      'unavailable',
      'DM Screen changes can only be saved in the browser.',
    ),
  };
}

export interface DmScreenStoreApi extends DmScreenStoreSnapshot {
  updateScreen: (
    transform: (current: DmScreenState) => DmScreenState,
  ) => Promise<DmScreenWriteResult>;
  replaceScreen: (next: DmScreenState) => Promise<DmScreenWriteResult>;
  refreshScreen: () => Promise<void>;
  retryScreenStorage: () => Promise<void>;
}

export function useDmScreenStore(): DmScreenStoreApi {
  const repository = getBrowserDmScreenRepository();
  const snapshot = useSyncExternalStore(
    repository?.subscribe ?? noopSubscribe,
    repository?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    if (repository) void repository.initialize();
  }, [repository]);

  const updateScreen = useCallback(
    (transform: (current: DmScreenState) => DmScreenState) => repository
      ? repository.update(transform)
      : Promise.resolve(unavailableResult()),
    [repository],
  );
  const replaceScreen = useCallback(
    (next: DmScreenState) => repository
      ? repository.replace(next)
      : Promise.resolve(unavailableResult()),
    [repository],
  );
  const refreshScreen = useCallback(
    () => repository?.refresh() ?? Promise.resolve(),
    [repository],
  );
  const retryScreenStorage = useCallback(
    () => repository?.retry() ?? Promise.resolve(),
    [repository],
  );

  return {
    ...snapshot,
    updateScreen,
    replaceScreen,
    refreshScreen,
    retryScreenStorage,
  };
}
