import { describe, expect, it, vi } from 'vitest';
import {
  DmScreenStorageError,
  createDmScreenRepository,
  type DmScreenCommitNotifier,
  type DmScreenDocumentStore,
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
  failNextWith: unknown | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(initial?: unknown) {
    this.value = initial === undefined ? undefined : clone(initial);
  }

  async read(): Promise<unknown | undefined> {
    await this.queue;
    return this.value === undefined ? undefined : clone(this.value);
  }

  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
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
      lastSavedAt: 100,
      error: null,
    });
    expect(notifier.published).toEqual([1]);
    expect(store.value).toMatchObject({ version: 2, revision: 1 });
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

    await repository.initialize();
    expect(clearLegacy).toHaveBeenCalledOnce();
    repository.close();
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
    const result = await repository.replace(replacement);

    expect(result).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      screen: { title: 'Restored from backup', version: 2, revision: 9 },
      status: 'saved',
      dirty: false,
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
