import {
  clonePartyLibrary,
  isPartyLibrary,
  migratePartyLibraryDocument,
  PARTY_LIBRARY_VERSION,
  type PartyIdFactory,
  type PartyLibrary,
} from './party';
import {
  migrateLegacyPartyData,
  type LegacyPartyReadResult,
} from './party-migration';

export type PartyStorageErrorCode =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'invalid-document'
  | 'future-version'
  | 'aborted'
  | 'save-failed'
  | 'unknown';

export class PartyStorageError extends Error {
  constructor(
    public readonly code: PartyStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PartyStorageError';
  }
}

export interface PartyDocumentStore {
  read(): Promise<unknown | undefined>;
  /**
   * Run a synchronous transform inside one read/write transaction. Returning
   * the exact current reference performs no write; any thrown error aborts.
   */
  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown>;
  close(): void;
}

export interface PartyCommitNotifier {
  subscribe(listener: (revision: number) => void): () => void;
  publish(revision: number): void;
  close(): void;
}

export type PartyRepositoryStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error'
  | 'unavailable';

export interface PartyLibrarySnapshot {
  library: PartyLibrary | null;
  status: PartyRepositoryStatus;
  hydrated: boolean;
  lastSavedAt: number | null;
  error: PartyStorageError | null;
}

export interface PartyWriteResult {
  ok: boolean;
  error?: PartyStorageError;
}

export interface PartyLibraryRepository {
  getSnapshot(): PartyLibrarySnapshot;
  getServerSnapshot(): PartyLibrarySnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  update(transform: (current: PartyLibrary) => PartyLibrary): Promise<PartyWriteResult>;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  close(): void;
}

export interface PartyLibraryRepositoryDependencies {
  store: PartyDocumentStore;
  notifier: PartyCommitNotifier;
  readLegacy: () => LegacyPartyReadResult;
  now?: () => number;
  createId?: PartyIdFactory;
}

export const SERVER_PARTY_LIBRARY_SNAPSHOT: PartyLibrarySnapshot = Object.freeze({
  library: null,
  status: 'idle',
  hydrated: false,
  lastSavedAt: null,
  error: null,
});

function immutableLibrary(library: PartyLibrary): PartyLibrary {
  const cloned = clonePartyLibrary(library);
  for (const party of cloned.parties) {
    for (const member of party.members) {
      if (member.overrides?.saveBonuses) Object.freeze(member.overrides.saveBonuses);
      if (member.overrides) Object.freeze(member.overrides);
      Object.freeze(member);
    }
    Object.freeze(party.members);
    Object.freeze(party);
  }
  Object.freeze(cloned.parties);
  return Object.freeze(cloned);
}

function documentError(
  result: Extract<ReturnType<typeof migratePartyLibraryDocument>, { ok: false }>,
): PartyStorageError {
  return new PartyStorageError(
    result.reason === 'future-version' ? 'future-version' : 'invalid-document',
    result.message,
  );
}

function normalizeError(error: unknown, fallbackCode: PartyStorageErrorCode): PartyStorageError {
  if (error instanceof PartyStorageError) return error;
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : error instanceof Error
      ? error.name
      : '';
  if (name === 'QuotaExceededError') {
    return new PartyStorageError('quota', 'Party changes were not saved because browser storage is full.', { cause: error });
  }
  if (name === 'VersionError' || name === 'InvalidStateError' || name === 'NotSupportedError' || name === 'SecurityError') {
    return new PartyStorageError('unavailable', 'Party changes cannot be saved because browser storage is unavailable.', { cause: error });
  }
  if (name === 'AbortError') {
    return new PartyStorageError('aborted', 'The Party Library save was interrupted before it committed.', { cause: error });
  }
  if (name === 'BlockedError') {
    return new PartyStorageError('blocked', 'Party storage is blocked by another open Encounterizer tab. Close the older tab and retry.', { cause: error });
  }
  return new PartyStorageError(
    fallbackCode,
    error instanceof Error && error.message
      ? error.message
      : 'The Party Library could not be saved in this browser.',
    { cause: error },
  );
}

export function createPartyLibraryRepository(
  dependencies: PartyLibraryRepositoryDependencies,
): PartyLibraryRepository {
  const now = dependencies.now ?? Date.now;
  const listeners = new Set<() => void>();
  let snapshot: PartyLibrarySnapshot = SERVER_PARTY_LIBRARY_SNAPSHOT;
  let initialization: Promise<void> | null = null;
  let operationQueue: Promise<void> = Promise.resolve();
  let closed = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setSnapshot(next: PartyLibrarySnapshot): void {
    snapshot = Object.freeze(next);
    emit();
  }

  function setFailure(error: PartyStorageError): void {
    setSnapshot({
      ...snapshot,
      status: error.code === 'unavailable' ? 'unavailable' : 'error',
      hydrated: true,
      error,
    });
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function parseStored(value: unknown): PartyLibrary {
    const parsed = migratePartyLibraryDocument(value, now());
    if (!parsed.ok) throw documentError(parsed);
    return parsed.library;
  }

  function publishCommit(revision: number): void {
    try {
      dependencies.notifier.publish(revision);
    } catch {
      // The IndexedDB transaction already committed. A visibility refresh can
      // heal a missed signal; never misreport a durable save as failed.
    }
  }

  async function initializeNow(legacyRead: LegacyPartyReadResult): Promise<void> {
    let committed = false;
    try {
      const stored = await dependencies.store.transact((current) => {
        if (current !== undefined) {
          const parsed = migratePartyLibraryDocument(current, now());
          if (!parsed.ok) throw documentError(parsed);
          if (parsed.migrated) {
            committed = true;
            return parsed.library;
          }
          return current;
        }

        if (!legacyRead.ok) {
          throw new PartyStorageError('unavailable', legacyRead.message);
        }
        const migrated = migrateLegacyPartyData(legacyRead.data, {
          now: now(),
          createId: dependencies.createId,
        });
        if (!migrated.ok) {
          throw new PartyStorageError('invalid-document', migrated.message);
        }
        if (!isPartyLibrary(migrated.library)) {
          throw new PartyStorageError(
            'invalid-document',
            'The existing party contains invalid fields and was left untouched.',
          );
        }
        committed = true;
        return migrated.library;
      });

      const library = parseStored(stored);
      setSnapshot({
        library: immutableLibrary(library),
        status: 'saved',
        hydrated: true,
        lastSavedAt: committed ? now() : snapshot.lastSavedAt,
        error: null,
      });
      if (committed) publishCommit(library.revision);
    } catch (error) {
      setFailure(normalizeError(error, 'unknown'));
    }
  }

  function captureLegacy(): LegacyPartyReadResult {
    try {
      return dependencies.readLegacy();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error
          ? error.message
          : 'The existing party could not be read from browser storage.',
      };
    }
  }

  function initialize(): Promise<void> {
    if (initialization) return initialization;
    // Capture localStorage synchronously before legacy Encounter effects can
    // normalize the richer roster from size/level controls.
    const legacyRead = captureLegacy();
    setSnapshot({ ...snapshot, status: 'loading', error: null });
    initialization = enqueue(() => initializeNow(legacyRead));
    return initialization;
  }

  async function refreshNow(): Promise<void> {
    try {
      const stored = await dependencies.store.read();
      if (stored === undefined) {
        throw new PartyStorageError('invalid-document', 'The saved Party Library is missing. Nothing was overwritten.');
      }
      const library = parseStored(stored);
      setSnapshot({
        library: immutableLibrary(library),
        status: 'saved',
        hydrated: true,
        lastSavedAt: snapshot.lastSavedAt,
        error: null,
      });
    } catch (error) {
      setFailure(normalizeError(error, 'unknown'));
    }
  }

  async function refresh(): Promise<void> {
    await initialize();
    await enqueue(refreshNow);
  }

  async function update(
    transform: (current: PartyLibrary) => PartyLibrary,
  ): Promise<PartyWriteResult> {
    await initialize();
    if (!snapshot.library) {
      return {
        ok: false,
        error: snapshot.error
          ?? new PartyStorageError('unavailable', 'The Party Library is not available.'),
      };
    }

    return enqueue(async () => {
      const committedBefore = snapshot.library;
      setSnapshot({ ...snapshot, status: 'saving', error: null });
      try {
        const stored = await dependencies.store.transact((current) => {
          if (current === undefined) {
            throw new PartyStorageError('invalid-document', 'The Party Library disappeared before this change could be saved.');
          }
          const currentLibrary = parseStored(current);
          const candidate = transform(clonePartyLibrary(currentLibrary));
          if (!isPartyLibrary(candidate) || candidate.version !== PARTY_LIBRARY_VERSION) {
            throw new PartyStorageError('invalid-document', 'The Party Library change contains invalid fields and was not saved.');
          }
          return {
            ...clonePartyLibrary(candidate),
            revision: currentLibrary.revision + 1,
          } satisfies PartyLibrary;
        });

        const library = parseStored(stored);
        setSnapshot({
          library: immutableLibrary(library),
          status: 'saved',
          hydrated: true,
          lastSavedAt: now(),
          error: null,
        });
        publishCommit(library.revision);
        return { ok: true };
      } catch (error) {
        const normalized = normalizeError(error, 'save-failed');
        setSnapshot({
          library: committedBefore,
          status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
          hydrated: true,
          lastSavedAt: snapshot.lastSavedAt,
          error: normalized,
        });
        return { ok: false, error: normalized };
      }
    });
  }

  async function retry(): Promise<void> {
    initialization = null;
    await initialize();
  }

  const unsubscribeNotifier = dependencies.notifier.subscribe((revision) => {
    if (!Number.isSafeInteger(revision) || revision < 0) return;
    const currentRevision = snapshot.library?.revision ?? -1;
    if (revision <= currentRevision || closed) return;
    void enqueue(refreshNow);
  });

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_PARTY_LIBRARY_SNAPSHOT,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    update,
    refresh,
    retry,
    close() {
      if (closed) return;
      closed = true;
      unsubscribeNotifier();
      listeners.clear();
      dependencies.notifier.close();
      dependencies.store.close();
    },
  };
}
