import { describe, expect, it, vi } from 'vitest';
import {
  DmScreenStorageError,
  createDmScreenRepository,
  type DmScreenCommitNotifier,
  type DmScreenDocumentStore,
  type DmScreenStoredRecords,
} from '@/lib/dm-screen-repository';
import {
  createEmptyDmScreen,
  type DmScreenState,
} from '@/lib/dm-screen';

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryDocumentStore implements DmScreenDocumentStore {
  value: unknown | undefined;
  replacementUndoValue: unknown | undefined;
  failNextWith: unknown | null = null;
  transactCalls = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(initial?: unknown, replacementUndo?: unknown) {
    this.value = initial === undefined ? undefined : clone(initial);
    this.replacementUndoValue = replacementUndo === undefined
      ? undefined
      : clone(replacementUndo);
  }

  async read(): Promise<unknown | undefined> {
    await this.queue;
    return this.value === undefined ? undefined : clone(this.value);
  }

  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
    this.transactCalls += 1;
    const operation = this.queue.then(() => {
      if (this.failNextWith !== null) {
        const failure = this.failNextWith;
        this.failNextWith = null;
        throw failure;
      }
      const current = this.value === undefined ? undefined : clone(this.value);
      const result = transform(current);
      if (result !== current) this.value = clone(result);
      return clone(result);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  transactRecords(
    transform: (current: DmScreenStoredRecords) => DmScreenStoredRecords,
  ): Promise<DmScreenStoredRecords> {
    this.transactCalls += 1;
    const operation = this.queue.then(() => {
      if (this.failNextWith !== null) {
        const failure = this.failNextWith;
        this.failNextWith = null;
        throw failure;
      }
      const current: DmScreenStoredRecords = {
        document: this.value === undefined ? undefined : clone(this.value),
        replacementUndo: this.replacementUndoValue === undefined
          ? undefined
          : clone(this.replacementUndoValue),
      };
      const result = transform(current);
      this.value = result.document === undefined ? undefined : clone(result.document);
      this.replacementUndoValue = result.replacementUndo === undefined
        ? undefined
        : clone(result.replacementUndo);
      return {
        document: this.value === undefined ? undefined : clone(this.value),
        replacementUndo: this.replacementUndoValue === undefined
          ? undefined
          : clone(this.replacementUndoValue),
      };
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  close(): void {}
}

class RecordingNotifier implements DmScreenCommitNotifier {
  readonly published: number[] = [];
  private readonly listeners = new Set<(revision: number) => void>();

  subscribe(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(revision: number): void {
    this.published.push(revision);
  }

  receive(revision: number): void {
    for (const listener of this.listeners) listener(revision);
  }

  close(): void {
    this.listeners.clear();
  }
}

class NotifierHub {
  readonly published: number[] = [];
  private readonly notifiers = new Set<HubNotifier>();

  create(): HubNotifier {
    const notifier = new HubNotifier(this);
    this.notifiers.add(notifier);
    return notifier;
  }

  publish(source: HubNotifier, revision: number): void {
    this.published.push(revision);
    for (const notifier of this.notifiers) {
      if (notifier !== source) notifier.receive(revision);
    }
  }

  remove(notifier: HubNotifier): void {
    this.notifiers.delete(notifier);
  }
}

class HubNotifier implements DmScreenCommitNotifier {
  private readonly listeners = new Set<(revision: number) => void>();

  constructor(private readonly hub: NotifierHub) {}

  subscribe(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(revision: number): void {
    this.hub.publish(this, revision);
  }

  receive(revision: number): void {
    for (const listener of this.listeners) listener(revision);
  }

  close(): void {
    this.listeners.clear();
    this.hub.remove(this);
  }
}

function noLegacy() {
  return { ok: true as const, value: undefined };
}

function v1Screen(): unknown {
  return {
    version: 1,
    title: 'The Sunken Archive',
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: false,
    sections: [{
      id: 'section-reference',
      title: 'Reference',
      collapsed: true,
      items: [{
        id: 'item-note',
        kind: 'note',
        title: 'Door riddle',
        body: 'The moon opens what the sun seals.',
        collapsed: false,
        hidden: true,
        origin: 'manual',
      }],
      children: [],
    }],
  };
}

describe('DmScreenRepository', () => {
  it('creates one durable empty screen with a repository-owned revision', async () => {
    const store = new MemoryDocumentStore();
    const notifier = new RecordingNotifier();
    const repository = createDmScreenRepository({
      store,
      notifier,
      readLegacy: noLegacy,
      now: () => 100,
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      screen: { version: 2, revision: 1 },
      status: 'saved',
      hydrated: true,
      dirty: false,
      firstUse: true,
      replacementUndo: null,
      lastSavedAt: 100,
      error: null,
    });
    expect(notifier.published).toEqual([1]);
    expect(store.value).toMatchObject({ version: 2, revision: 1 });

    const storedBeforeAcknowledgement = clone(store.value);
    const transactionsBeforeAcknowledgement = store.transactCalls;
    repository.acknowledgeFirstUse();
    expect(repository.getSnapshot().firstUse).toBe(false);
    expect(store.value).toEqual(storedBeforeAcknowledgement);
    expect(store.transactCalls).toBe(transactionsBeforeAcknowledgement);
    expect(notifier.published).toEqual([1]);
    repository.close();
  });

  it('migrates the legacy localStorage document once and clears it only after commit', async () => {
    const store = new MemoryDocumentStore();
    const notifier = new RecordingNotifier();
    const clearLegacy = vi.fn();
    const repository = createDmScreenRepository({
      store,
      notifier,
      readLegacy: () => ({ ok: true, value: v1Screen() }),
      clearLegacy,
      now: () => 200,
    });

    await repository.initialize();

    expect(repository.getSnapshot().screen).toMatchObject({
      version: 2,
      revision: 1,
      title: 'The Sunken Archive',
      sections: [{
        id: 'section-reference',
        title: 'Reference',
        collapsed: true,
        items: [{
          id: 'item-note',
          title: 'Door riddle',
          body: 'The moon opens what the sun seals.',
        }],
      }],
    });
    expect(clearLegacy).toHaveBeenCalledOnce();
    expect(notifier.published).toEqual([1]);
    expect(repository.getSnapshot().firstUse).toBe(false);

    await repository.initialize();
    expect(clearLegacy).toHaveBeenCalledOnce();
    repository.close();
  });

  it('does not mark an existing durable document as first use', async () => {
    const existing = {
      ...createEmptyDmScreen(),
      revision: 4,
      title: 'Existing screen',
    };
    const repository = createDmScreenRepository({
      store: new MemoryDocumentStore(existing),
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Existing screen', revision: 4 },
      firstUse: false,
    });
    repository.close();
  });

  it('marks only the repository that wins concurrent first-screen creation as first use', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    const second = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });

    await Promise.all([first.initialize(), second.initialize()]);

    expect(first.getSnapshot().firstUse).toBe(true);
    expect(second.getSnapshot().firstUse).toBe(false);
    expect(store.value).toMatchObject({ version: 2, revision: 1 });
    first.close();
    second.close();
  });

  it.each([
    {
      label: 'future-version',
      document: { version: 99, revision: 8, opaque: 'keep me' },
      code: 'future-version',
    },
    {
      label: 'invalid',
      document: { version: 2, revision: 8, opaque: 'keep me' },
      code: 'invalid-document',
    },
  ])('leaves a $label document untouched and blocks writes', async ({ document, code }) => {
    const store = new MemoryDocumentStore(document);
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      screen: null,
      status: 'error',
      hydrated: true,
      error: { code },
    });
    const result = await repository.update((current) => ({
      ...current,
      title: 'Must not be written',
    }));
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(store.value).toEqual(document);
    repository.close();
  });

  it('replaces an unreadable saved document only through an explicit validated restore', async () => {
    const future = { version: 99, revision: 8, opaque: 'keep until confirmed' };
    const store = new MemoryDocumentStore(future);
    const notifier = new RecordingNotifier();
    const repository = createDmScreenRepository({ store, notifier, readLegacy: noLegacy });

    await repository.initialize();
    expect(store.value).toEqual(future);

    const replacement = {
      ...createEmptyDmScreen(),
      title: 'Restored from backup',
    };
    const unsafeUndoable = await repository.replace(replacement, { undoable: true });
    expect(unsafeUndoable).toMatchObject({
      ok: false,
      error: { code: 'future-version' },
    });
    expect(store.value).toEqual(future);

    const result = await repository.replace(replacement);

    expect(result).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Restored from backup', version: 2, revision: 9 },
      status: 'saved',
      dirty: false,
      replacementUndo: null,
      error: null,
    });
    expect(store.value).toMatchObject({
      title: 'Restored from backup',
      version: 2,
      revision: 9,
    });
    expect(notifier.published).toEqual([9]);
    repository.close();
  });

  it('undoes an opted-in replacement as a new monotonic commit', async () => {
    const store = new MemoryDocumentStore();
    const notifier = new RecordingNotifier();
    const repository = createDmScreenRepository({ store, notifier, readLegacy: noLegacy });
    await repository.initialize();
    const before = clone(repository.getSnapshot().screen!);
    const replacement = {
      ...createEmptyDmScreen(),
      title: 'Session template',
      sections: [],
    };

    const replaced = await repository.replace(replacement, { undoable: true });

    expect(replaced).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Session template', revision: 2 },
      replacementUndo: { kind: 'replacement', replacementRevision: 2 },
    });

    const undone = await repository.undoReplacement();

    expect(undone).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: before.title, revision: 3 },
      replacementUndo: null,
      status: 'saved',
    });
    expect(store.value).toEqual({ ...before, revision: 3 });
    expect(notifier.published).toEqual([1, 2, 3]);
    repository.close();
  });

  it('reloads a matching durable replacement undo record and can apply it', async () => {
    const store = new MemoryDocumentStore();
    const firstNotifier = new RecordingNotifier();
    const first = createDmScreenRepository({
      store,
      notifier: firstNotifier,
      readLegacy: noLegacy,
    });
    await first.initialize();
    const before = clone(first.getSnapshot().screen!);
    await first.replace({
      ...createEmptyDmScreen(),
      title: 'Durable template',
      sections: [],
    }, { undoable: true });
    expect(store.replacementUndoValue).toMatchObject({
      version: 1,
      kind: 'replacement',
      before: { title: before.title, revision: 1 },
      after: { title: 'Durable template', revision: 2 },
    });
    first.close();

    const reopenedNotifier = new RecordingNotifier();
    const reopened = createDmScreenRepository({
      store,
      notifier: reopenedNotifier,
      readLegacy: noLegacy,
    });
    await reopened.initialize();

    expect(reopened.getSnapshot()).toMatchObject({
      screen: { title: 'Durable template', revision: 2 },
      replacementUndo: { kind: 'replacement', replacementRevision: 2 },
    });
    expect(await reopened.update((current) => current)).toEqual({ ok: true });
    expect(reopened.getSnapshot().replacementUndo).toMatchObject({
      replacementRevision: 2,
    });
    expect(store.replacementUndoValue).toBeDefined();
    expect(await reopened.undoReplacement()).toEqual({ ok: true });
    expect(reopened.getSnapshot()).toMatchObject({
      screen: { title: before.title, revision: 3 },
      replacementUndo: null,
    });
    expect(store.replacementUndoValue).toBeUndefined();
    expect(reopenedNotifier.published).toEqual([3]);
    reopened.close();
  });

  it('atomically expires a reloaded undo record on the next committed edit', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    await first.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    first.close();

    const reopened = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await reopened.initialize();
    expect(reopened.getSnapshot().replacementUndo).not.toBeNull();

    await reopened.update((current) => ({ ...current, title: 'Edited after reload' }));

    expect(reopened.getSnapshot()).toMatchObject({
      screen: { title: 'Edited after reload', revision: 3 },
      replacementUndo: null,
    });
    expect(store.value).toMatchObject({ title: 'Edited after reload', revision: 3 });
    expect(store.replacementUndoValue).toBeUndefined();
    reopened.close();

    const verified = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await verified.initialize();
    expect(verified.getSnapshot().replacementUndo).toBeNull();
    verified.close();
  });

  it('rejects and clears a durable undo record that does not match the saved screen', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    await first.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    expect(store.replacementUndoValue).toBeDefined();
    store.value = {
      ...clone(store.value as DmScreenState),
      title: 'Independent committed screen',
    };
    first.close();

    const reopened = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await reopened.initialize();

    expect(reopened.getSnapshot()).toMatchObject({
      screen: { title: 'Independent committed screen', revision: 2 },
      replacementUndo: null,
      status: 'saved',
    });
    expect(store.replacementUndoValue).toBeUndefined();
    expect(await reopened.undoReplacement()).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(store.value).toMatchObject({
      title: 'Independent committed screen',
      revision: 2,
    });
    reopened.close();
  });

  it('captures the latest transactional document rather than a stale rendered snapshot', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    const second = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await second.initialize();
    await second.update((current) => ({ ...current, title: 'Latest other-tab title' }));
    expect(first.getSnapshot().screen?.title).not.toBe('Latest other-tab title');

    await first.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    const undone = await first.undoReplacement();

    expect(undone).toEqual({ ok: true });
    expect(first.getSnapshot().screen).toMatchObject({
      title: 'Latest other-tab title',
      revision: 4,
    });
    expect(store.value).toMatchObject({
      title: 'Latest other-tab title',
      revision: 4,
    });
    first.close();
    second.close();
  });

  it('keeps undo through a no-op but expires it after the next committed edit', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    await repository.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });

    await repository.update((current) => current);
    expect(repository.getSnapshot()).toMatchObject({
      screen: { revision: 2 },
      replacementUndo: { replacementRevision: 2 },
    });

    await repository.update((current) => ({ ...current, title: 'Edited template' }));
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Edited template', revision: 3 },
      replacementUndo: null,
    });
    const expired = await repository.undoReplacement();
    expect(expired).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(store.value).toMatchObject({ title: 'Edited template', revision: 3 });
    repository.close();
  });

  it('does not let undo overwrite a newer cross-tab commit', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    const second = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await second.initialize();
    await first.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    await second.update((current) => ({ ...current, title: 'Other-tab edit' }));

    const conflicted = await first.undoReplacement();

    expect(conflicted).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(first.getSnapshot()).toMatchObject({
      screen: { title: 'Other-tab edit', revision: 3 },
      replacementUndo: null,
      status: 'saved',
    });
    expect(store.value).toMatchObject({ title: 'Other-tab edit', revision: 3 });
    first.close();
    second.close();
  });

  it('keeps the undo point when the undo write fails and succeeds on another attempt', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    const originalTitle = repository.getSnapshot().screen!.title;
    await repository.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    store.failNextWith = new DOMException('full once', 'QuotaExceededError');

    const failed = await repository.undoReplacement();

    expect(failed).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Applied template', revision: 2 },
      replacementUndo: { replacementRevision: 2 },
      status: 'error',
    });
    expect(store.value).toMatchObject({ title: 'Applied template', revision: 2 });

    const retried = await repository.undoReplacement();
    expect(retried).toEqual({ ok: true });
    expect(store.value).toMatchObject({ title: originalTitle, revision: 3 });
    repository.close();
  });

  it('keeps the prior undo point when a later replacement does not commit', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    const originalTitle = repository.getSnapshot().screen!.title;
    await repository.replace({
      ...createEmptyDmScreen(),
      title: 'First template',
    }, { undoable: true });
    store.failNextWith = new DOMException('full once', 'QuotaExceededError');

    const failed = await repository.replace({
      ...createEmptyDmScreen(),
      title: 'Second template',
    }, { undoable: true });

    expect(failed).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'First template', revision: 2 },
      replacementUndo: { replacementRevision: 2 },
    });
    await repository.undoReplacement();
    expect(store.value).toMatchObject({ title: originalTitle, revision: 3 });
    repository.close();
  });

  it('preserves pending optimistic changes instead of discarding them through undo', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    await repository.replace({
      ...createEmptyDmScreen(),
      title: 'Applied template',
    }, { undoable: true });
    store.failNextWith = new DOMException('full once', 'QuotaExceededError');
    await repository.update((current) => ({ ...current, title: 'Unsaved edit' }));

    const blocked = await repository.undoReplacement();

    expect(blocked).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Unsaved edit' },
      dirty: true,
      replacementUndo: { replacementRevision: 2 },
    });
    expect(store.value).toMatchObject({ title: 'Applied template', revision: 2 });

    await repository.retry();
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Unsaved edit', revision: 3 },
      dirty: false,
      replacementUndo: null,
    });
    repository.close();
  });

  it('applies concurrent transforms to the latest transaction state', async () => {
    const store = new MemoryDocumentStore();
    const first = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    const second = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await second.initialize();

    const [rename, compact] = await Promise.all([
      first.update((current) => ({ ...current, title: 'Night Watch' })),
      second.update((current) => ({
        ...current,
        layout: { ...current.layout, density: 'compact' },
      })),
    ]);

    expect(rename.ok).toBe(true);
    expect(compact.ok).toBe(true);
    expect(store.value).toMatchObject({
      revision: 3,
      title: 'Night Watch',
      layout: { density: 'compact' },
    });
    first.close();
    second.close();
  });

  it('notifies subscribers through saving and saved states', async () => {
    const repository = createDmScreenRepository({
      store: new MemoryDocumentStore(),
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
      now: () => 300,
    });
    await repository.initialize();
    const statuses: string[] = [];
    const unsubscribe = repository.subscribe(() => {
      statuses.push(repository.getSnapshot().status);
    });

    const result = await repository.update((current) => ({
      ...current,
      title: 'Saved title',
    }));

    expect(result).toEqual({ ok: true });
    expect(statuses).toEqual(['saving', 'saved']);
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Saved title', revision: 2 },
      dirty: false,
      lastSavedAt: 300,
    });
    unsubscribe();
    repository.close();
  });

  it('keeps a valid in-memory edit after quota failure and commits it on retry', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
      now: () => 400,
    });
    await repository.initialize();
    const committedBefore = clone(store.value);
    store.failNextWith = new DOMException('full', 'QuotaExceededError');

    const failed = await repository.update((current) => ({
      ...current,
      title: 'Playable but unsaved',
    }));

    expect(failed).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Playable but unsaved', revision: 1 },
      status: 'error',
      dirty: true,
      error: { code: 'quota' },
    });
    expect(store.value).toEqual(committedBefore);

    await repository.retry();

    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Playable but unsaved', revision: 2 },
      status: 'saved',
      dirty: false,
      error: null,
    });
    expect(store.value).toMatchObject({ title: 'Playable but unsaved', revision: 2 });
    repository.close();
  });

  it('reconciles an earlier failed transform before committing a later queued update', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    store.failNextWith = new DOMException('full once', 'QuotaExceededError');

    const rename = repository.update((current) => ({
      ...current,
      title: 'Keep this title',
    }));
    const compact = repository.update((current) => ({
      ...current,
      layout: { ...current.layout, density: 'compact' },
    }));
    const [failed, recovered] = await Promise.all([rename, compact]);

    expect(failed).toMatchObject({ ok: false, queued: true });
    expect(recovered).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      screen: {
        title: 'Keep this title',
        layout: { density: 'compact' },
      },
      status: 'saved',
      dirty: false,
      error: null,
    });
    expect(store.value).toMatchObject({
      title: 'Keep this title',
      layout: { density: 'compact' },
    });
    repository.close();
  });

  it('reloads a newer committed revision through the notifier', async () => {
    const store = new MemoryDocumentStore();
    const hub = new NotifierHub();
    const first = createDmScreenRepository({
      store,
      notifier: hub.create(),
      readLegacy: noLegacy,
    });
    await first.initialize();
    const second = createDmScreenRepository({
      store,
      notifier: hub.create(),
      readLegacy: noLegacy,
    });
    await second.initialize();

    let unsubscribe: () => void = () => undefined;
    const refreshed = new Promise<void>((resolve) => {
      unsubscribe = second.subscribe(() => {
        if (second.getSnapshot().screen?.revision === 2) resolve();
      });
    });
    await first.update((current) => ({ ...current, title: 'Visible in tab two' }));
    await refreshed;

    expect(second.getSnapshot().screen).toMatchObject({
      title: 'Visible in tab two',
      revision: 2,
    });
    expect(hub.published).toEqual([1, 2]);
    unsubscribe();
    first.close();
    second.close();
  });

  it('reloads a foreign recovery signal even when its revision sequence restarted', async () => {
    const store = new MemoryDocumentStore();
    const notifier = new RecordingNotifier();
    const repository = createDmScreenRepository({ store, notifier, readLegacy: noLegacy });
    await repository.initialize();
    await repository.update((current) => ({ ...current, title: 'Revision two' }));
    await repository.update((current) => ({ ...current, title: 'Revision three' }));
    expect(repository.getSnapshot().screen?.revision).toBe(3);

    store.value = {
      ...createEmptyDmScreen(),
      revision: 1,
      title: 'Recovered sequence',
    };
    const refreshed = new Promise<void>((resolve) => {
      const unsubscribe = repository.subscribe(() => {
        if (repository.getSnapshot().screen?.title === 'Recovered sequence') {
          unsubscribe();
          resolve();
        }
      });
    });
    notifier.receive(1);
    await refreshed;

    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Recovered sequence', revision: 1 },
      status: 'saved',
    });
    repository.close();
  });

  it('reports unavailable storage without creating an in-memory overwrite candidate', async () => {
    const store = new MemoryDocumentStore();
    store.failNextWith = new DOMException('restricted', 'SecurityError');
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      screen: null,
      status: 'unavailable',
      hydrated: true,
      dirty: false,
      error: { code: 'unavailable' },
    });
    repository.close();
  });

  it('uses an existing IndexedDB document when legacy localStorage is unavailable', async () => {
    const existing = {
      ...createEmptyDmScreen(),
      revision: 7,
      title: 'IndexedDB remains authoritative',
    };
    const store = new MemoryDocumentStore(existing);
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: () => ({
        ok: false,
        error: new DmScreenStorageError('unavailable', 'restricted'),
      }),
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'IndexedDB remains authoritative', revision: 7 },
      status: 'saved',
      error: null,
    });
    expect(store.value).toEqual(existing);
    repository.close();
  });

  it('rejects an invalid transform before changing storage', async () => {
    const store = new MemoryDocumentStore();
    const repository = createDmScreenRepository({
      store,
      notifier: new RecordingNotifier(),
      readLegacy: noLegacy,
    });
    await repository.initialize();
    const before = clone(store.value);

    const result = await repository.update(() => ({
      ...createEmptyDmScreen(),
      revision: -1,
    } as DmScreenState));

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'invalid-document' },
    });
    expect(store.value).toEqual(before);
    repository.close();
  });
});
