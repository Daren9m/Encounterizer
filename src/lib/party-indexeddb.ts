import {
  PartyStorageError,
  type PartyDocumentStore,
} from './party-repository';

export const PARTY_DATABASE_NAME = 'encounterizer';
export const PARTY_DATABASE_VERSION = 1;
export const PARTY_DOCUMENT_STORE = 'documents';
export const PARTY_DOCUMENT_KEY = 'party-library';

function unavailable(): PartyStorageError {
  return new PartyStorageError(
    'unavailable',
    'Party changes cannot be saved because IndexedDB is unavailable in this browser.',
  );
}

/** Native IndexedDB adapter; all browser access is delayed until a method call. */
export class IndexedDbPartyDocumentStore implements PartyDocumentStore {
  private connection: Promise<IDBDatabase> | null = null;

  constructor(private readonly providedFactory?: IDBFactory) {}

  private factory(): IDBFactory {
    const factory = this.providedFactory
      ?? (typeof window !== 'undefined' ? window.indexedDB : undefined);
    if (!factory) throw unavailable();
    return factory;
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    this.connection = new Promise<IDBDatabase>((resolve, reject) => {
      let rejected = false;
      let request: IDBOpenDBRequest;
      try {
        request = this.factory().open(PARTY_DATABASE_NAME, PARTY_DATABASE_VERSION);
      } catch (error) {
        rejected = true;
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PARTY_DOCUMENT_STORE)) {
          database.createObjectStore(PARTY_DOCUMENT_STORE);
        }
      };
      request.onblocked = () => {
        rejected = true;
        reject(new PartyStorageError(
          'blocked',
          'Party storage is blocked by another open Encounterizer tab.',
        ));
      };
      request.onerror = () => {
        rejected = true;
        reject(request.error ?? unavailable());
      };
      request.onsuccess = () => {
        if (rejected) {
          request.result.close();
          return;
        }
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.connection = null;
        };
        resolve(database);
      };
    }).catch((error) => {
      this.connection = null;
      throw error;
    });
    return this.connection;
  }

  async read(): Promise<unknown | undefined> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let value: unknown | undefined;
      let settled = false;
      const transaction = database.transaction(PARTY_DOCUMENT_STORE, 'readonly');
      const request = transaction.objectStore(PARTY_DOCUMENT_STORE).get(PARTY_DOCUMENT_KEY);
      request.onsuccess = () => {
        value = request.result as unknown | undefined;
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new PartyStorageError('unknown', 'The Party Library could not be read.'));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(transaction.error ?? new DOMException('Party read aborted.', 'AbortError'));
      };
    });
  }

  async transact(transform: (current: unknown | undefined) => unknown): Promise<unknown> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      let result: unknown;
      let transformError: unknown;
      let settled = false;
      const transaction = database.transaction(PARTY_DOCUMENT_STORE, 'readwrite');
      const store = transaction.objectStore(PARTY_DOCUMENT_STORE);
      const request = store.get(PARTY_DOCUMENT_KEY);

      request.onsuccess = () => {
        const current = request.result as unknown | undefined;
        try {
          result = transform(current);
          if (result !== current) store.put(result, PARTY_DOCUMENT_KEY);
        } catch (error) {
          transformError = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        if (settled) return;
        settled = true;
        reject(request.error ?? new PartyStorageError('unknown', 'The Party Library transaction could not start.'));
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onabort = () => {
        if (settled) return;
        settled = true;
        reject(
          transformError
          ?? transaction.error
          ?? new DOMException('Party transaction aborted.', 'AbortError'),
        );
      };
    });
  }

  close(): void {
    if (!this.connection) return;
    void this.connection.then((database) => database.close(), () => undefined);
    this.connection = null;
  }
}
