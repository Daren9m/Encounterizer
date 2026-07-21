import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  DM_SCREEN_DATABASE_NAME,
  DM_SCREEN_DATABASE_VERSION,
  DM_SCREEN_DOCUMENT_STORE,
  IndexedDbDmScreenDocumentStore,
} from '@/lib/dm-screen-indexeddb';

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DM_SCREEN_DATABASE_NAME, DM_SCREEN_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDbDmScreenDocumentStore', () => {
  it('shares the Encounterizer document store and preserves a screen across reopen', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbDmScreenDocumentStore(factory);
    const document = { version: 2, revision: 1, title: 'Night Watch' };

    expect(await first.read()).toBeUndefined();
    expect(await first.transact(() => document)).toEqual(document);

    const database = await openDatabase(factory);
    expect(database.version).toBe(DM_SCREEN_DATABASE_VERSION);
    expect(database.objectStoreNames.contains(DM_SCREEN_DOCUMENT_STORE)).toBe(true);
    database.close();
    first.close();

    const reopened = new IndexedDbDmScreenDocumentStore(factory);
    expect(await reopened.read()).toEqual(document);
    reopened.close();
  });

  it('aborts a throwing transform without overwriting the committed screen', async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbDmScreenDocumentStore(factory);
    const original = { version: 2, revision: 4, title: 'Original' };
    const failure = new Error('invalid future document');

    await store.transact(() => original);
    await expect(store.transact(() => {
      throw failure;
    })).rejects.toBe(failure);

    expect(await store.read()).toEqual(original);
    store.close();
  });

  it('atomically persists, reads, and clears replacement undo metadata under its separate key', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbDmScreenDocumentStore(factory);
    const document = { version: 2, revision: 2, title: 'Applied template' };
    const replacementUndo = {
      version: 1,
      kind: 'replacement',
      before: { version: 2, revision: 1, title: 'Original screen' },
      after: document,
    };

    expect(await first.transactRecords(() => ({
      document,
      replacementUndo,
    }))).toEqual({ document, replacementUndo });
    expect(await first.read()).toEqual(document);
    first.close();

    const reopened = new IndexedDbDmScreenDocumentStore(factory);
    expect(await reopened.transactRecords((current) => current)).toEqual({
      document,
      replacementUndo,
    });

    const changedDocument = { ...document, revision: 3, title: 'Must roll back' };
    await expect(reopened.transactRecords(() => ({
      document: changedDocument,
      replacementUndo: () => undefined,
    }))).rejects.toMatchObject({ name: 'DataCloneError' });
    expect(await reopened.transactRecords((current) => current)).toEqual({
      document,
      replacementUndo,
    });

    const failure = new Error('abort both records');
    await expect(reopened.transactRecords(() => {
      throw failure;
    })).rejects.toBe(failure);
    expect(await reopened.transactRecords((current) => current)).toEqual({
      document,
      replacementUndo,
    });

    expect(await reopened.transactRecords((current) => ({
      ...current,
      replacementUndo: undefined,
    }))).toEqual({ document, replacementUndo: undefined });
    expect(await reopened.read()).toEqual(document);
    reopened.close();

    const verified = new IndexedDbDmScreenDocumentStore(factory);
    expect(await verified.transactRecords((current) => current)).toEqual({
      document,
      replacementUndo: undefined,
    });
    expect(await verified.read()).toEqual(document);
    verified.close();
  });

  it('serializes concurrent transforms across connections', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbDmScreenDocumentStore(factory);
    const second = new IndexedDbDmScreenDocumentStore(factory);

    await first.transact(() => ({ count: 0, changes: [] as string[] }));
    await Promise.all([
      first.transact((current) => {
        const value = current as { count: number; changes: string[] };
        return { count: value.count + 1, changes: [...value.changes, 'first'] };
      }),
      second.transact((current) => {
        const value = current as { count: number; changes: string[] };
        return { count: value.count + 1, changes: [...value.changes, 'second'] };
      }),
    ]);

    const committed = await first.read() as { count: number; changes: string[] };
    expect(committed.count).toBe(2);
    expect(new Set(committed.changes)).toEqual(new Set(['first', 'second']));
    first.close();
    second.close();
  });
});
