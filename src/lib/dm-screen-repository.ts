import {
  cloneDmScreenDocument,
  createEmptyDmScreen,
  isDmScreenState,
  parseDmScreenDocument,
  type DmScreenState,
} from './dm-screen';

export type DmScreenStorageErrorCode =
  | 'unavailable'
  | 'blocked'
  | 'quota'
  | 'invalid-document'
  | 'future-version'
  | 'aborted'
  | 'save-failed'
  | 'unknown';

export class DmScreenStorageError extends Error {
  constructor(
    public readonly code: DmScreenStorageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'DmScreenStorageError';
  }
}

export interface DmScreenDocumentStore {
  read(): Promise<unknown | undefined>;
  /** Returning the exact current reference performs no write. */
  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown>;
  close(): void;
}

export interface DmScreenCommitNotifier {
  subscribe(listener: (revision: number) => void): () => void;
  publish(revision: number): void;
  close(): void;
}

export type DmScreenRepositoryStatus =
  | 'idle'
  | 'loading'
  | 'saving'
  | 'saved'
  | 'error'
  | 'unavailable';

export interface DmScreenStoreSnapshot {
  screen: DmScreenState | null;
  status: DmScreenRepositoryStatus;
  hydrated: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  error: DmScreenStorageError | null;
}

export interface DmScreenWriteResult {
  ok: boolean;
  error?: DmScreenStorageError;
  /** The valid optimistic change remains in memory and will be retried. */
  queued?: boolean;
}

export type DmScreenLegacyReadResult =
  | { ok: true; value: unknown | undefined }
  | { ok: false; error: DmScreenStorageError };

export interface DmScreenRepositoryDependencies {
  store: DmScreenDocumentStore;
  notifier: DmScreenCommitNotifier;
  readLegacy: () => DmScreenLegacyReadResult;
  clearLegacy?: () => void;
  now?: () => number;
}

export interface DmScreenRepository {
  getSnapshot(): DmScreenStoreSnapshot;
  getServerSnapshot(): DmScreenStoreSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  update(
    transform: (current: DmScreenState) => DmScreenState,
  ): Promise<DmScreenWriteResult>;
  replace(next: DmScreenState): Promise<DmScreenWriteResult>;
  refresh(): Promise<void>;
  retry(): Promise<void>;
  close(): void;
}

export const SERVER_DM_SCREEN_SNAPSHOT: DmScreenStoreSnapshot = Object.freeze({
  screen: null,
  status: 'idle',
  hydrated: false,
  dirty: false,
  lastSavedAt: null,
  error: null,
});

type ScreenTransform = (current: DmScreenState) => DmScreenState;

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

function immutableScreen(screen: DmScreenState): DmScreenState {
  return deepFreeze(cloneDmScreenDocument(screen));
}

function documentError(
  result: Extract<ReturnType<typeof parseDmScreenDocument>, { ok: false }>,
): DmScreenStorageError {
  return new DmScreenStorageError(
    result.reason === 'future-version' ? 'future-version' : 'invalid-document',
    result.message,
  );
}

function normalizeError(
  error: unknown,
  fallbackCode: DmScreenStorageErrorCode,
): DmScreenStorageError {
  if (error instanceof DmScreenStorageError) return error;
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : error instanceof Error
      ? error.name
      : '';
  if (name === 'QuotaExceededError') {
    return new DmScreenStorageError(
      'quota',
      'DM Screen changes were not saved because browser storage is full.',
      { cause: error },
    );
  }
  if (
    name === 'VersionError'
    || name === 'InvalidStateError'
    || name === 'NotSupportedError'
    || name === 'SecurityError'
  ) {
    return new DmScreenStorageError(
      'unavailable',
      'DM Screen changes cannot be saved because browser storage is unavailable.',
      { cause: error },
    );
  }
  if (name === 'AbortError') {
    return new DmScreenStorageError(
      'aborted',
      'The DM Screen save was interrupted before it committed.',
      { cause: error },
    );
  }
  if (name === 'BlockedError') {
    return new DmScreenStorageError(
      'blocked',
      'DM Screen storage is blocked by another open Encounterizer tab. Close the older tab and retry.',
      { cause: error },
    );
  }
  return new DmScreenStorageError(
    fallbackCode,
    error instanceof Error && error.message
      ? error.message
      : 'The DM Screen could not be saved in this browser.',
    { cause: error },
  );
}

function parseStored(value: unknown): DmScreenState {
  const result = parseDmScreenDocument(value);
  if (!result.ok) throw documentError(result);
  return result.document;
}

function nextCommittedDocument(document: DmScreenState): DmScreenState {
  if (!Number.isSafeInteger(document.revision) || document.revision < 0) {
    throw new DmScreenStorageError(
      'invalid-document',
      'The DM Screen revision is invalid and was left untouched.',
    );
  }
  if (document.revision >= Number.MAX_SAFE_INTEGER) {
    throw new DmScreenStorageError(
      'invalid-document',
      'The DM Screen revision cannot be increased safely and was left untouched.',
    );
  }
  return {
    ...cloneDmScreenDocument(document),
    revision: document.revision + 1,
  };
}

function sameDocument(left: DmScreenState, right: DmScreenState): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Transactional local-first repository for the single durable DM Screen.
 * Every transform runs against the latest committed IndexedDB document, so a
 * stale render cannot replace a newer same-tab or cross-tab snapshot.
 */
export function createDmScreenRepository(
  dependencies: DmScreenRepositoryDependencies,
): DmScreenRepository {
  const now = dependencies.now ?? Date.now;
  const listeners = new Set<() => void>();
  let snapshot: DmScreenStoreSnapshot = SERVER_DM_SCREEN_SNAPSHOT;
  let committedScreen: DmScreenState | null = null;
  let pendingTransforms: ScreenTransform[] = [];
  let initialization: Promise<void> | null = null;
  let operationQueue: Promise<void> = Promise.resolve();
  let writesBlocked = false;
  let closed = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setSnapshot(next: DmScreenStoreSnapshot): void {
    snapshot = Object.freeze(next);
    emit();
  }

  function setFailure(
    error: DmScreenStorageError,
    options: { preserveScreen?: boolean; blockWrites?: boolean } = {},
  ): void {
    if (options.blockWrites) writesBlocked = true;
    setSnapshot({
      ...snapshot,
      screen: options.preserveScreen ? snapshot.screen : null,
      status: error.code === 'unavailable' ? 'unavailable' : 'error',
      hydrated: true,
      dirty: pendingTransforms.length > 0,
      error,
    });
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function publishCommit(revision: number): void {
    try {
      dependencies.notifier.publish(revision);
    } catch {
      // The durable transaction already committed. Visibility refresh is the
      // healing path when a notification transport is unavailable.
    }
  }

  function applyTransforms(
    document: DmScreenState,
    transforms: readonly ScreenTransform[],
  ): DmScreenState {
    let candidate = cloneDmScreenDocument(document);
    for (const transform of transforms) {
      candidate = transform(candidate);
      if (!isDmScreenState(candidate)) {
        throw new DmScreenStorageError(
          'invalid-document',
          'The DM Screen change contains invalid fields and was not saved.',
        );
      }
      candidate = cloneDmScreenDocument(candidate);
    }
    return candidate;
  }

  function derivePendingScreen(base: DmScreenState): DmScreenState {
    return pendingTransforms.length > 0
      ? applyTransforms(base, pendingTransforms)
      : cloneDmScreenDocument(base);
  }

  async function initializeNow(legacyRead: DmScreenLegacyReadResult): Promise<void> {
    let committed = false;
    let migratedLegacy = false;
    try {
      const stored = await dependencies.store.transact((current) => {
        if (current !== undefined) {
          const parsed = parseDmScreenDocument(current);
          if (!parsed.ok) throw documentError(parsed);
          if (!parsed.migrated) return current;
          committed = true;
          return nextCommittedDocument(parsed.document);
        }

        if (!legacyRead.ok) throw legacyRead.error;
        let document: DmScreenState;
        if (legacyRead.value !== undefined) {
          const parsed = parseDmScreenDocument(legacyRead.value);
          if (!parsed.ok) throw documentError(parsed);
          document = parsed.document;
          migratedLegacy = true;
        } else {
          document = createEmptyDmScreen();
        }
        committed = true;
        return nextCommittedDocument(document);
      });

      const screen = immutableScreen(parseStored(stored));
      committedScreen = screen;
      writesBlocked = false;
      const visibleScreen = pendingTransforms.length > 0
        ? immutableScreen(derivePendingScreen(screen))
        : screen;
      setSnapshot({
        screen: visibleScreen,
        status: pendingTransforms.length > 0 ? 'saving' : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        lastSavedAt: committed ? now() : snapshot.lastSavedAt,
        error: null,
      });
      if (committed) publishCommit(screen.revision);
      if (migratedLegacy) {
        try {
          dependencies.clearLegacy?.();
        } catch {
          // The IndexedDB copy is authoritative; stale legacy cleanup is best effort.
        }
      }
    } catch (error) {
      const normalized = normalizeError(error, 'unknown');
      setFailure(normalized, {
        blockWrites: normalized.code === 'future-version'
          || normalized.code === 'invalid-document',
      });
    }
  }

  function captureLegacy(): DmScreenLegacyReadResult {
    try {
      return dependencies.readLegacy();
    } catch (error) {
      return {
        ok: false,
        error: normalizeError(error, 'unknown'),
      };
    }
  }

  function initialize(): Promise<void> {
    if (initialization) return initialization;
    const legacyRead = captureLegacy();
    setSnapshot({ ...snapshot, status: 'loading', error: null });
    initialization = enqueue(() => initializeNow(legacyRead));
    return initialization;
  }

  async function commitTransforms(
    transforms: readonly ScreenTransform[],
  ): Promise<DmScreenState> {
    let changed = false;
    const stored = await dependencies.store.transact((current) => {
      if (current === undefined) {
        throw new DmScreenStorageError(
          'invalid-document',
          'The saved DM Screen disappeared before this change could be committed.',
        );
      }
      const currentDocument = parseStored(current);
      const candidate = applyTransforms(currentDocument, transforms);
      if (sameDocument(candidate, currentDocument)) return current;
      changed = true;
      return nextCommittedDocument({
        ...candidate,
        revision: currentDocument.revision,
      });
    });
    const screen = immutableScreen(parseStored(stored));
    committedScreen = screen;
    if (changed) publishCommit(screen.revision);
    return screen;
  }

  async function update(
    transform: ScreenTransform,
  ): Promise<DmScreenWriteResult> {
    await initialize();
    if (closed || writesBlocked || !snapshot.screen) {
      return {
        ok: false,
        error: snapshot.error ?? new DmScreenStorageError(
          'unavailable',
          'The DM Screen is not available for editing.',
        ),
      };
    }

    let optimistic: DmScreenState;
    try {
      optimistic = immutableScreen(applyTransforms(snapshot.screen, [transform]));
    } catch (error) {
      return { ok: false, error: normalizeError(error, 'invalid-document') };
    }

    return enqueue(async () => {
      const transforms = [...pendingTransforms, transform];
      try {
        const visibleBase = snapshot.screen ?? committedScreen;
        if (!visibleBase) {
          throw new DmScreenStorageError(
            'unavailable',
            'The DM Screen is not available for editing.',
          );
        }
        optimistic = immutableScreen(applyTransforms(
          visibleBase,
          [transform],
        ));
      } catch (error) {
        return { ok: false, error: normalizeError(error, 'invalid-document') };
      }
      setSnapshot({
        ...snapshot,
        screen: optimistic,
        status: 'saving',
        dirty: pendingTransforms.length > 0,
        error: null,
      });
      try {
        const screen = await commitTransforms(transforms);
        pendingTransforms = pendingTransforms.slice(transforms.length - 1);
        const visibleScreen = pendingTransforms.length > 0
          ? immutableScreen(derivePendingScreen(screen))
          : screen;
        setSnapshot({
          screen: visibleScreen,
          status: pendingTransforms.length > 0 ? 'saving' : 'saved',
          hydrated: true,
          dirty: pendingTransforms.length > 0,
          lastSavedAt: now(),
          error: null,
        });
        return { ok: true };
      } catch (error) {
        const normalized = normalizeError(error, 'save-failed');
        if (
          normalized.code === 'future-version'
          || normalized.code === 'invalid-document'
        ) writesBlocked = true;
        pendingTransforms.push(transform);
        setSnapshot({
          ...snapshot,
          screen: optimistic,
          status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
          hydrated: true,
          dirty: true,
          error: normalized,
        });
        return { ok: false, error: normalized, queued: true };
      }
    });
  }

  async function replace(next: DmScreenState): Promise<DmScreenWriteResult> {
    if (!isDmScreenState(next)) {
      return {
        ok: false,
        error: new DmScreenStorageError(
          'invalid-document',
          'The replacement DM Screen contains invalid fields and was not applied.',
        ),
      };
    }
    await initialize();
    if (closed) {
      return {
        ok: false,
        error: new DmScreenStorageError(
          'unavailable',
          'The DM Screen store is no longer available.',
        ),
      };
    }
    const replacement = cloneDmScreenDocument(next);
    return enqueue(async () => {
      setSnapshot({ ...snapshot, status: 'saving', error: null });
      try {
        const stored = await dependencies.store.transact((current) => {
          let revision = 0;
          if (current !== undefined) {
            const parsed = parseDmScreenDocument(current);
            if (parsed.ok) revision = parsed.document.revision;
            else if (
              typeof current === 'object'
              && current !== null
              && Number.isSafeInteger((current as { revision?: unknown }).revision)
              && ((current as { revision: number }).revision) >= 0
              && ((current as { revision: number }).revision) < Number.MAX_SAFE_INTEGER
            ) revision = (current as { revision: number }).revision;
          }
          return nextCommittedDocument({
            ...cloneDmScreenDocument(replacement),
            revision,
          });
        });
        const screen = immutableScreen(parseStored(stored));
        committedScreen = screen;
        pendingTransforms = [];
        writesBlocked = false;
        setSnapshot({
          screen,
          status: 'saved',
          hydrated: true,
          dirty: false,
          lastSavedAt: now(),
          error: null,
        });
        publishCommit(screen.revision);
        try {
          dependencies.clearLegacy?.();
        } catch {
          // The explicit IndexedDB replacement is already authoritative.
        }
        return { ok: true };
      } catch (error) {
        const normalized = normalizeError(error, 'save-failed');
        setSnapshot({
          ...snapshot,
          status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
          hydrated: true,
          error: normalized,
        });
        return { ok: false, error: normalized };
      }
    });
  }

  async function refreshNow(): Promise<void> {
    let migrated = false;
    try {
      const stored = await dependencies.store.transact((current) => {
        if (current === undefined) {
          throw new DmScreenStorageError(
            'invalid-document',
            'The saved DM Screen is missing. Nothing was overwritten.',
          );
        }
        const parsed = parseDmScreenDocument(current);
        if (!parsed.ok) throw documentError(parsed);
        if (!parsed.migrated) return current;
        migrated = true;
        return nextCommittedDocument(parsed.document);
      });
      const committed = immutableScreen(parseStored(stored));
      committedScreen = committed;
      const screen = immutableScreen(derivePendingScreen(committed));
      writesBlocked = false;
      setSnapshot({
        ...snapshot,
        screen,
        status: pendingTransforms.length > 0 ? snapshot.status : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        error: pendingTransforms.length > 0 ? snapshot.error : null,
      });
      if (migrated) publishCommit(committed.revision);
    } catch (error) {
      const normalized = normalizeError(error, 'unknown');
      setFailure(normalized, {
        preserveScreen: true,
        blockWrites: normalized.code === 'future-version'
          || normalized.code === 'invalid-document',
      });
    }
  }

  async function refresh(): Promise<void> {
    await initialize();
    await enqueue(refreshNow);
  }

  async function retryPending(): Promise<void> {
    if (pendingTransforms.length === 0) return;
    const transforms = [...pendingTransforms];
    setSnapshot({ ...snapshot, status: 'saving', error: null });
    try {
      const screen = await commitTransforms(transforms);
      pendingTransforms = pendingTransforms.slice(transforms.length);
      const visible = pendingTransforms.length > 0
        ? immutableScreen(derivePendingScreen(screen))
        : screen;
      setSnapshot({
        screen: visible,
        status: pendingTransforms.length > 0 ? 'saving' : 'saved',
        hydrated: true,
        dirty: pendingTransforms.length > 0,
        lastSavedAt: now(),
        error: null,
      });
    } catch (error) {
      const normalized = normalizeError(error, 'save-failed');
      const base = committedScreen ?? snapshot.screen;
      setSnapshot({
        ...snapshot,
        screen: base ? immutableScreen(derivePendingScreen(base)) : snapshot.screen,
        status: normalized.code === 'unavailable' ? 'unavailable' : 'error',
        dirty: true,
        error: normalized,
      });
    }
  }

  async function retry(): Promise<void> {
    if (pendingTransforms.length > 0 && !writesBlocked) {
      do {
        const pendingBefore = pendingTransforms.length;
        await enqueue(retryPending);
        if (
          pendingTransforms.length >= pendingBefore
          || snapshot.status === 'error'
          || snapshot.status === 'unavailable'
        ) break;
      } while (pendingTransforms.length > 0 && !writesBlocked);
      return;
    }
    initialization = null;
    writesBlocked = false;
    await initialize();
    if (pendingTransforms.length > 0 && !writesBlocked && snapshot.screen) {
      await retry();
    }
  }

  const unsubscribeNotifier = dependencies.notifier.subscribe((revision) => {
    if (!Number.isSafeInteger(revision) || revision < 0 || closed) return;
    // The document can be explicitly recovered from an unreadable/future
    // value, which starts a new revision sequence. Every foreign signal
    // therefore reloads the authoritative IndexedDB value; stale signals are
    // harmless because they never carry document data.
    void enqueue(refreshNow);
  });

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_DM_SCREEN_SNAPSHOT,
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    initialize,
    update,
    replace,
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
