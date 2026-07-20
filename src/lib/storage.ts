// ─── Typed localStorage Utility ──────────────────────────────────
// SSR-safe, quota-tolerant persistence. All Encounterizer keys share a
// versioned prefix; bump the version when a stored shape changes
// incompatibly (old keys are simply ignored — tolerant readers mean no
// migration code).

export const STORAGE_PREFIX = 'encounterizer:v1:';

export function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Load a JSON value from localStorage.
 *
 * Returns `fallback` on the server, when nothing is stored, when the stored
 * JSON is corrupt, or when `validate` rejects the parsed value.
 */
export function storageLoad<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  const storage = browserStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(storageKey(key));
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Save a JSON-serializable value. Returns false (without throwing) on the
 * server, when the value cannot be serialized, or when the write fails —
 * e.g. QuotaExceededError or private-browsing restrictions.
 */
export function storageSave(key: string, value: unknown): boolean {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    storage.setItem(storageKey(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove a stored value. Safe to call anywhere. */
export function storageRemove(key: string): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(key));
  } catch {
    // ignore — removal is best-effort
  }
}
