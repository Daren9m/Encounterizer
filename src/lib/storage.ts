// ─── Typed localStorage Utility ──────────────────────────────────
// SSR-safe, quota-tolerant persistence. All Encounterizer keys share a
// versioned prefix; bump the version when a stored shape changes
// incompatibly (old keys are simply ignored — tolerant readers mean no
// migration code).

const PREFIX = 'encounterizer:v1:';

function fullKey(key: string): string {
  return `${PREFIX}${key}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
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
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(fullKey(key));
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
  if (!isBrowser()) return false;
  try {
    window.localStorage.setItem(fullKey(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Remove a stored value. Safe to call anywhere. */
export function storageRemove(key: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(fullKey(key));
  } catch {
    // ignore — removal is best-effort
  }
}
