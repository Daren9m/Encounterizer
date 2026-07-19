'use client';

// ─── Persistent useState ─────────────────────────────────────────
// useState backed by localStorage, safe under static prerendering:
// the first client render always uses `initial` (matching the
// prerendered HTML), then a mount effect loads the stored value and
// flips `hydrated`. Persisting only starts after hydration so defaults
// never clobber stored data.
//
// Note: `null` is reserved as the "nothing stored" sentinel — persisted
// values must not be null themselves (ours are objects/arrays/primitives).

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { storageLoad, storageSave } from './storage';

export function usePersistentState<T>(
  key: string,
  initial: T,
  validate?: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  const validateRef = useRef(validate);
  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);

  useEffect(() => {
    const guard = validateRef.current;
    const stored = storageLoad<T | null>(
      key,
      null,
      guard ? (v): v is T | null => v !== null && guard(v) : undefined,
    );
    if (stored !== null) setValue(stored);
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    storageSave(key, value);
  }, [key, value, hydrated]);

  return [value, setValue, hydrated];
}
