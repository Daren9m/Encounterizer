'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { PartyProfile } from '@/lib/party';
import { storageKey, storageSave } from '@/lib/storage';
import {
  createCustomToolPartySetup,
  readToolPartySetup,
  reconcileToolPartySetup,
  type ToolPartySetup,
  type ToolPartySetupReadSource,
} from '@/lib/tool-party';

export interface UseToolPartySetupOptions {
  key: string;
  activeParty: PartyProfile | null;
  partyHydrated: boolean;
  defaultCustomSize: number;
  defaultCustomLevel?: number;
  /** Some tools (maps) allow zero tokens; scene generators require one. */
  minCustomSize?: number;
  legacySizeKey?: string;
  legacyLevelKey?: string;
}

export interface ToolPartySetupState {
  setup: ToolPartySetup;
  setSetup: Dispatch<SetStateAction<ToolPartySetup>>;
  hydrated: boolean;
  source: ToolPartySetupReadSource | null;
}

function readRaw(storage: Storage, key: string): unknown {
  const raw = storage.getItem(storageKey(key));
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Hydrate tool-scoped attendance only after Party Library is ready, so a
 * normal first visit can reliably prefer the active party over old scalars.
 */
export function useToolPartySetup({
  key,
  activeParty,
  partyHydrated,
  defaultCustomSize,
  defaultCustomLevel = 5,
  minCustomSize = 0,
  legacySizeKey,
  legacyLevelKey,
}: UseToolPartySetupOptions): ToolPartySetupState {
  const [setup, setSetup] = useState<ToolPartySetup>(() => (
    createCustomToolPartySetup(defaultCustomSize, defaultCustomLevel)
  ));
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<ToolPartySetupReadSource | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!partyHydrated || initializedRef.current) return;
    initializedRef.current = true;

    let current: unknown;
    let legacySize: unknown;
    let legacyLevel: unknown;
    try {
      current = readRaw(window.localStorage, key);
      legacySize = legacySizeKey ? readRaw(window.localStorage, legacySizeKey) : undefined;
      legacyLevel = legacyLevelKey ? readRaw(window.localStorage, legacyLevelKey) : undefined;
    } catch {
      // Storage-unavailable tools still work from active or safe custom data.
    }

    const result = current === undefined && activeParty
      ? readToolPartySetup(undefined, {
          activeParty,
          defaultCustomSize,
          defaultCustomLevel,
        })
      : readToolPartySetup(current, {
          activeParty,
          legacyPartySize: legacySize,
          legacyPartyLevel: legacyLevel,
          defaultCustomSize,
          defaultCustomLevel,
        });
    const minimum = Math.max(0, Math.min(10, Math.floor(minCustomSize)));
    const safeSetup = result.setup.mode === 'custom' && result.setup.size < minimum
      ? createCustomToolPartySetup(minimum, result.setup.level)
      : result.setup;
    setSetup(safeSetup);
    setSource(result.source);
    setHydrated(true);
  }, [
    activeParty,
    defaultCustomLevel,
    defaultCustomSize,
    key,
    legacyLevelKey,
    legacySizeKey,
    partyHydrated,
    minCustomSize,
  ]);

  useEffect(() => {
    if (!hydrated || setup.mode !== 'active' || !activeParty) return;
    const reconciled = reconcileToolPartySetup(setup, activeParty);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- active roster edits must reconcile durable attendance after hydration.
    if (JSON.stringify(reconciled) !== JSON.stringify(setup)) setSetup(reconciled);
  }, [activeParty, hydrated, setup]);

  useEffect(() => {
    if (hydrated) storageSave(key, setup);
  }, [hydrated, key, setup]);

  return { setup, setSetup, hydrated, source };
}
