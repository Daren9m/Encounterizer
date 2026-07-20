'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { IndexedDbPartyDocumentStore } from '@/lib/party-indexeddb';
import { readLegacyPartyData } from '@/lib/party-migration';
import { BrowserPartyCommitNotifier } from '@/lib/party-notifications';
import {
  createPartyLibraryRepository,
  SERVER_PARTY_LIBRARY_SNAPSHOT,
  type PartyLibraryRepository,
  type PartyLibrarySnapshot,
  type PartyWriteResult,
} from '@/lib/party-repository';
import type { PartyLibrary } from '@/lib/party';

let browserRepository: PartyLibraryRepository | null = null;

function noopSubscribe(): () => void {
  return () => undefined;
}

function serverSnapshot(): PartyLibrarySnapshot {
  return SERVER_PARTY_LIBRARY_SNAPSHOT;
}

export function getBrowserPartyLibraryRepository(): PartyLibraryRepository | null {
  if (typeof window === 'undefined') return null;
  if (!browserRepository) {
    browserRepository = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(),
      notifier: new BrowserPartyCommitNotifier(window),
      readLegacy: readLegacyPartyData,
    });
  }
  return browserRepository;
}

export interface PartyLibraryApi extends PartyLibrarySnapshot {
  updateLibrary: (
    transform: (current: PartyLibrary) => PartyLibrary,
  ) => Promise<PartyWriteResult>;
  refreshLibrary: () => Promise<void>;
  retryPartyStorage: () => Promise<void>;
}

export function usePartyLibrary(): PartyLibraryApi {
  const repository = getBrowserPartyLibraryRepository();
  const snapshot = useSyncExternalStore(
    repository?.subscribe ?? noopSubscribe,
    repository?.getSnapshot ?? serverSnapshot,
    serverSnapshot,
  );

  useEffect(() => {
    if (repository) void repository.initialize();
  }, [repository]);

  const updateLibrary = useCallback(
    (transform: (current: PartyLibrary) => PartyLibrary) => repository
      ? repository.update(transform)
      : Promise.resolve({
          ok: false,
          error: undefined,
        }),
    [repository],
  );
  const refreshLibrary = useCallback(
    () => repository?.refresh() ?? Promise.resolve(),
    [repository],
  );
  const retryPartyStorage = useCallback(
    () => repository?.retry() ?? Promise.resolve(),
    [repository],
  );

  return {
    ...snapshot,
    updateLibrary,
    refreshLibrary,
    retryPartyStorage,
  };
}
