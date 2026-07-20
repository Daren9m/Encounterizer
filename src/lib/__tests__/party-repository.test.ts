import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbPartyDocumentStore } from '@/lib/party-indexeddb';
import type { LegacyPartyReadResult } from '@/lib/party-migration';
import {
  createPartyLibraryRepository,
  type PartyCommitNotifier,
  type PartyDocumentStore,
} from '@/lib/party-repository';
import { createPartyLibrary, type PartyIdFactory, type PartyLibrary } from '@/lib/party';

function legacyParty(name: string): LegacyPartyReadResult {
  return {
    ok: true,
    data: {
      partyConfig: {
        version: 1,
        members: [{
          name,
          templateId: 'wizard-evoker',
          level: 7,
          overrides: {
            ac: 16,
            saveBonuses: { dex: 4, con: 3, wis: 6 },
          },
        }],
      },
    },
  };
}

function deterministicIds(prefix: string): PartyIdFactory {
  let next = 0;
  return (kind) => `${prefix}-${kind}-${++next}`;
}

class RecordingNotifier implements PartyCommitNotifier {
  readonly published: number[] = [];
  private readonly listeners = new Set<(revision: number) => void>();

  subscribe(listener: (revision: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(revision: number): void {
    this.published.push(revision);
  }

  close(): void {
    this.listeners.clear();
  }
}

class ThrowingNotifier extends RecordingNotifier {
  override publish(): void {
    throw new Error('notification channel unavailable');
  }
}

class NotifierHub {
  readonly publications: number[] = [];
  private readonly notifiers = new Set<HubNotifier>();

  createNotifier(): HubNotifier {
    const notifier = new HubNotifier(this);
    this.notifiers.add(notifier);
    return notifier;
  }

  publish(source: HubNotifier, revision: number): void {
    this.publications.push(revision);
    for (const notifier of this.notifiers) {
      if (notifier !== source) notifier.receive(revision);
    }
  }

  remove(notifier: HubNotifier): void {
    this.notifiers.delete(notifier);
  }
}

class HubNotifier implements PartyCommitNotifier {
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

class FailNextTransactionStore implements PartyDocumentStore {
  failNextWith: unknown | null = null;

  constructor(private readonly inner: PartyDocumentStore) {}

  read(): Promise<unknown | undefined> {
    return this.inner.read();
  }

  transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
    if (this.failNextWith !== null) {
      const failure = this.failNextWith;
      this.failNextWith = null;
      return Promise.reject(failure);
    }
    return this.inner.transact(transform);
  }

  close(): void {
    this.inner.close();
  }
}

describe('PartyLibraryRepository', () => {
  it('atomically creates the library once when two repositories initialize together', async () => {
    const factory = new IDBFactory();
    const firstNotifier = new RecordingNotifier();
    const secondNotifier = new RecordingNotifier();
    const first = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: firstNotifier,
      readLegacy: () => legacyParty('Aria'),
      now: () => 100,
      createId: deterministicIds('first'),
    });
    const second = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: secondNotifier,
      readLegacy: () => legacyParty('Borin'),
      now: () => 200,
      createId: deterministicIds('second'),
    });

    await Promise.all([first.initialize(), second.initialize()]);

    const firstLibrary = first.getSnapshot().library;
    const secondLibrary = second.getSnapshot().library;
    expect(firstLibrary).not.toBeNull();
    expect(secondLibrary).toEqual(firstLibrary);
    expect(firstLibrary?.parties).toHaveLength(1);
    expect(['Aria', 'Borin']).toContain(firstLibrary?.parties[0].members[0].name);
    expect(firstLibrary?.revision).toBe(1);
    expect(firstNotifier.published.length + secondNotifier.published.length).toBe(1);

    await first.initialize();
    expect(firstNotifier.published.length + secondNotifier.published.length).toBe(1);

    const thirdNotifier = new RecordingNotifier();
    const third = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: thirdNotifier,
      readLegacy: () => legacyParty('Should not be imported'),
      now: () => 300,
      createId: deterministicIds('third'),
    });
    await third.initialize();
    expect(third.getSnapshot().library).toEqual(firstLibrary);
    expect(thirdNotifier.published).toEqual([]);

    first.close();
    second.close();
    third.close();
  });

  it('commits a version-one migration with a new revision and notification', async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbPartyDocumentStore(factory);
    const current = createPartyLibrary('Old Library', [
      { name: 'Aria', templateId: 'fighter-champion', level: 5 },
    ], { now: 100, createId: deterministicIds('old') });
    const versionOne = { ...current, version: 1, revision: 5 };
    await store.transact(() => versionOne);
    const notifier = new RecordingNotifier();
    const repository = createPartyLibraryRepository({
      store,
      notifier,
      readLegacy: () => legacyParty('Must not be imported'),
      now: () => 600,
      createId: deterministicIds('ignored'),
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      status: 'saved',
      library: { version: 2, revision: 6 },
    });
    expect(await store.read()).toMatchObject({ version: 2, revision: 6 });
    expect(notifier.published).toEqual([6]);
    repository.close();
  });

  it.each([
    {
      label: 'future',
      document: { version: 99, revision: 8, opaque: 'keep me' },
      errorCode: 'future-version',
    },
    {
      label: 'invalid',
      document: {
        version: 1,
        revision: 8,
        activePartyId: 'missing',
        parties: [],
        opaque: 'keep me',
      },
      errorCode: 'invalid-document',
    },
  ])('does not overwrite a $label stored document', async ({ document, errorCode }) => {
    const factory = new IDBFactory();
    const store = new IndexedDbPartyDocumentStore(factory);
    const notifier = new RecordingNotifier();
    await store.transact(() => document);
    const repository = createPartyLibraryRepository({
      store,
      notifier,
      readLegacy: () => legacyParty('Fallback must not win'),
      now: () => 500,
      createId: deterministicIds('invalid'),
    });

    await repository.initialize();

    expect(repository.getSnapshot()).toMatchObject({
      library: null,
      status: 'error',
      hydrated: true,
      error: { code: errorCode },
    });
    expect(await store.read()).toEqual(document);
    expect(notifier.published).toEqual([]);
    repository.close();
  });

  it('preserves both concurrent repository updates through transactional transforms', async () => {
    const factory = new IDBFactory();
    const first = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: new RecordingNotifier(),
      readLegacy: () => legacyParty('Aria'),
      now: () => 1_000,
      createId: deterministicIds('base'),
    });
    await first.initialize();
    const second = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: new RecordingNotifier(),
      readLegacy: () => legacyParty('Ignored'),
      now: () => 1_001,
      createId: deterministicIds('ignored'),
    });
    await second.initialize();

    const [renameResult, addResult] = await Promise.all([
      first.update((current) => ({
        ...current,
        parties: current.parties.map((party) => ({ ...party, name: 'Night Watch' })),
      })),
      second.update((current) => ({
        ...current,
        parties: current.parties.map((party) => ({
          ...party,
          members: [...party.members, {
            id: 'member-extra',
            name: 'Cato',
            templateId: 'fighter-champion',
            level: 7,
          }],
        })),
      })),
    ]);

    expect(renameResult.ok).toBe(true);
    expect(addResult.ok).toBe(true);
    const reader = new IndexedDbPartyDocumentStore(factory);
    const committed = await reader.read() as PartyLibrary;
    expect(committed.revision).toBe(3);
    expect(committed.parties[0].name).toBe('Night Watch');
    expect(committed.parties[0].members.map((member) => member.id)).toContain('member-extra');

    first.close();
    second.close();
    reader.close();
  });

  it('notifies same-tab subscribers through saving and saved states', async () => {
    const factory = new IDBFactory();
    const notifier = new RecordingNotifier();
    const repository = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier,
      readLegacy: () => legacyParty('Aria'),
      now: () => 2_000,
      createId: deterministicIds('same-tab'),
    });
    await repository.initialize();
    const statuses: string[] = [];
    const revisions: number[] = [];
    const unsubscribe = repository.subscribe(() => {
      const snapshot = repository.getSnapshot();
      statuses.push(snapshot.status);
      revisions.push(snapshot.library?.revision ?? -1);
    });

    const result = await repository.update((current) => ({
      ...current,
      parties: current.parties.map((party) => ({ ...party, name: 'Renamed' })),
    }));

    expect(result.ok).toBe(true);
    expect(statuses).toEqual(['saving', 'saved']);
    expect(revisions).toEqual([1, 2]);
    expect(notifier.published).toEqual([1, 2]);
    unsubscribe();
    repository.close();
  });

  it('keeps the last committed library and exposes a quota save failure', async () => {
    const factory = new IDBFactory();
    const innerStore = new IndexedDbPartyDocumentStore(factory);
    const store = new FailNextTransactionStore(innerStore);
    const notifier = new RecordingNotifier();
    const repository = createPartyLibraryRepository({
      store,
      notifier,
      readLegacy: () => legacyParty('Aria'),
      now: () => 3_000,
      createId: deterministicIds('failure'),
    });
    await repository.initialize();
    const committedBefore = repository.getSnapshot().library;
    const statuses: string[] = [];
    const unsubscribe = repository.subscribe(() => statuses.push(repository.getSnapshot().status));
    store.failNextWith = new DOMException('quota', 'QuotaExceededError');

    const result = await repository.update((current) => ({
      ...current,
      parties: current.parties.map((party) => ({ ...party, name: 'Unsaved name' })),
    }));

    expect(result).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(statuses).toEqual(['saving', 'error']);
    expect(repository.getSnapshot().library).toBe(committedBefore);
    expect(repository.getSnapshot()).toMatchObject({
      status: 'error',
      error: { code: 'quota' },
    });
    expect((await innerStore.read() as PartyLibrary).parties[0].name).toBe('Adventuring Party');
    expect(notifier.published).toEqual([1]);

    unsubscribe();
    repository.close();
  });

  it('keeps a committed save successful when the notification channel fails', async () => {
    const factory = new IDBFactory();
    const repository = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: new ThrowingNotifier(),
      readLegacy: () => legacyParty('Aria'),
      now: () => 3_500,
      createId: deterministicIds('notify-failure'),
    });
    await repository.initialize();

    const result = await repository.update((current) => ({
      ...current,
      parties: current.parties.map((party) => ({ ...party, name: 'Still committed' })),
    }));

    expect(result).toEqual({ ok: true });
    expect(repository.getSnapshot()).toMatchObject({
      status: 'saved',
      library: { revision: 2, parties: [{ name: 'Still committed' }] },
    });
    repository.close();
  });

  it('reloads a committed change in another repository through the notifier', async () => {
    const factory = new IDBFactory();
    const hub = new NotifierHub();
    const first = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: hub.createNotifier(),
      readLegacy: () => legacyParty('Aria'),
      now: () => 4_000,
      createId: deterministicIds('source'),
    });
    await first.initialize();
    const second = createPartyLibraryRepository({
      store: new IndexedDbPartyDocumentStore(factory),
      notifier: hub.createNotifier(),
      readLegacy: () => legacyParty('Ignored'),
      now: () => 4_001,
      createId: deterministicIds('receiver'),
    });
    await second.initialize();

    let unsubscribe: () => void = () => undefined;
    const reloaded = new Promise<void>((resolve) => {
      unsubscribe = second.subscribe(() => {
        if (second.getSnapshot().library?.revision === 2) resolve();
      });
    });
    const result = await first.update((current) => ({
      ...current,
      parties: current.parties.map((party) => ({ ...party, name: 'Seen in tab two' })),
    }));
    await reloaded;

    expect(result.ok).toBe(true);
    expect(second.getSnapshot().library?.parties[0].name).toBe('Seen in tab two');
    expect(second.getSnapshot().library?.revision).toBe(2);
    expect(hub.publications).toEqual([1, 2]);

    unsubscribe();
    first.close();
    second.close();
  });
});
