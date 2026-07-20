import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  IndexedDbPartyDocumentStore,
  PARTY_DATABASE_NAME,
  PARTY_DATABASE_VERSION,
  PARTY_DOCUMENT_STORE,
} from '@/lib/party-indexeddb';

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(PARTY_DATABASE_NAME, PARTY_DATABASE_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDbPartyDocumentStore', () => {
  it('creates its schema on first open and preserves a document across reopen', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbPartyDocumentStore(factory);
    const document = { version: 1, revision: 1, name: 'The Lanterns' };

    expect(await first.read()).toBeUndefined();
    expect(await first.transact((current) => {
      expect(current).toBeUndefined();
      return document;
    })).toEqual(document);

    const database = await openDatabase(factory);
    expect(database.version).toBe(PARTY_DATABASE_VERSION);
    expect(database.objectStoreNames.contains(PARTY_DOCUMENT_STORE)).toBe(true);
    database.close();
    first.close();

    const reopened = new IndexedDbPartyDocumentStore(factory);
    expect(await reopened.read()).toEqual(document);
    reopened.close();
  });

  it('aborts a throwing transform without overwriting the committed document', async () => {
    const factory = new IDBFactory();
    const store = new IndexedDbPartyDocumentStore(factory);
    const original = { version: 1, revision: 4, name: 'Original' };
    const failure = new Error('invalid future document');

    await store.transact(() => original);
    await expect(store.transact(() => {
      throw failure;
    })).rejects.toBe(failure);

    expect(await store.read()).toEqual(original);
    store.close();
  });

  it('serializes concurrent read-modify-write transactions across connections', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbPartyDocumentStore(factory);
    const second = new IndexedDbPartyDocumentStore(factory);

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
    expect(committed.changes).toHaveLength(2);
    expect(new Set(committed.changes)).toEqual(new Set(['first', 'second']));

    first.close();
    second.close();
  });
});
