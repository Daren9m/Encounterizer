import {
  EMPTY_BATTLE,
  isBattleState,
  type BattleCombatant,
  type BattleLogEntry,
  type BattleState,
} from './battle-organizer';
import { cloneEncounterPartyContext } from './encounter-party';
import { storageKey } from './storage';
import type { Condition } from './types';

export const BATTLE_ORGANIZER_STORAGE_KEY = storageKey('battleOrganizer');

const CONDITIONS = new Set<Condition>([
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
]);

export type BattlePersistenceErrorCode =
  | 'unavailable'
  | 'quota'
  | 'save-failed'
  | 'invalid-state';

export class BattlePersistenceError extends Error {
  constructor(
    public readonly code: BattlePersistenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BattlePersistenceError';
  }
}

export interface BattleStoreSnapshot {
  battle: BattleState;
  hydrated: boolean;
  persistenceError: BattlePersistenceError | null;
}

export interface BattleWriteResult {
  ok: boolean;
  error?: BattlePersistenceError;
}

export interface BattleStoreStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BattleStorageChange {
  key: string | null;
  newValue: string | null;
}

export interface BattleStoreDependencies {
  storage: BattleStoreStorage | null;
  subscribeToStorage?: (
    listener: (change: BattleStorageChange) => void,
  ) => () => void;
}

export interface BattleStore {
  getSnapshot(): BattleStoreSnapshot;
  getServerSnapshot(): BattleStoreSnapshot;
  subscribe(listener: () => void): () => void;
  update(transform: (current: BattleState) => BattleState): BattleWriteResult;
  replace(next: BattleState): BattleWriteResult;
  retryPersistence(): BattleWriteResult;
  close(): void;
}

function cloneCombatant(combatant: BattleCombatant): BattleCombatant {
  const clone: BattleCombatant = {
    ...combatant,
    conditions: [...combatant.conditions],
  };
  Object.freeze(clone.conditions);
  return Object.freeze(clone);
}

function cloneLogEntry(entry: BattleLogEntry): BattleLogEntry {
  return Object.freeze({ ...entry });
}

/**
 * Store snapshots are immutable so state cannot change without notifying
 * useSyncExternalStore subscribers.
 */
function immutableBattle(state: BattleState): BattleState {
  const combatants = state.combatants.map(cloneCombatant);
  const log = state.log.map(cloneLogEntry);
  Object.freeze(combatants);
  Object.freeze(log);
  return Object.freeze({
    ...state,
    combatants,
    log,
    ...(state.partyContext
      ? { partyContext: cloneEncounterPartyContext(state.partyContext) }
      : {}),
  });
}

function emptyBattle(): BattleState {
  return immutableBattle(EMPTY_BATTLE);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return value === undefined || isFiniteNumber(value);
}

function isCombatant(value: unknown): value is BattleCombatant {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const combatant = value as Record<string, unknown>;
  return typeof combatant.id === 'string'
    && combatant.id.length > 0
    && (combatant.sourcePartyMemberId === undefined
      || typeof combatant.sourcePartyMemberId === 'string')
    && typeof combatant.name === 'string'
    && (combatant.kind === 'player'
      || combatant.kind === 'ally'
      || combatant.kind === 'enemy')
    && isFiniteNumber(combatant.initiative)
    && isFiniteNumber(combatant.dexterity)
    && isOptionalFiniteNumber(combatant.armorClass)
    && isFiniteNumber(combatant.maxHp)
    && combatant.maxHp >= 0
    && isFiniteNumber(combatant.currentHp)
    && combatant.currentHp >= 0
    && isFiniteNumber(combatant.tempHp)
    && combatant.tempHp >= 0
    && Array.isArray(combatant.conditions)
    && combatant.conditions.every((condition) => CONDITIONS.has(condition as Condition))
    && typeof combatant.concentration === 'boolean'
    && typeof combatant.reactionUsed === 'boolean'
    && isFiniteNumber(combatant.legendaryActionsMax)
    && combatant.legendaryActionsMax >= 0
    && isFiniteNumber(combatant.legendaryActionsUsed)
    && combatant.legendaryActionsUsed >= 0
    && typeof combatant.notes === 'string';
}

function isLogEntry(value: unknown): value is BattleLogEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && entry.id.length > 0
    && Number.isInteger(entry.round)
    && (entry.round as number) >= 1
    && typeof entry.message === 'string';
}

/** A stricter persistence boundary than the legacy domain-level guard. */
export function isStoredBattleState(value: unknown): value is BattleState {
  if (!isBattleState(value)) return false;
  return Number.isInteger(value.round)
    && value.round >= 1
    && (value.currentId === undefined || typeof value.currentId === 'string')
    && value.combatants.every(isCombatant)
    && value.log.every(isLogEntry)
    && new Set(value.combatants.map((combatant) => combatant.id)).size
      === value.combatants.length;
}

function parseStoredBattle(raw: string | null): BattleState {
  if (raw === null) return emptyBattle();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredBattleState(parsed) ? immutableBattle(parsed) : emptyBattle();
  } catch {
    return emptyBattle();
  }
}

function normalizePersistenceError(error: unknown): BattlePersistenceError {
  const name = typeof DOMException !== 'undefined' && error instanceof DOMException
    ? error.name
    : error instanceof Error
      ? error.name
      : '';
  if (name === 'QuotaExceededError') {
    return new BattlePersistenceError(
      'quota',
      'Battle changes are available in this tab, but browser storage is full so they were not saved.',
      { cause: error },
    );
  }
  if (name === 'SecurityError' || name === 'NotSupportedError') {
    return new BattlePersistenceError(
      'unavailable',
      'Battle changes cannot be saved because browser storage is unavailable.',
      { cause: error },
    );
  }
  return new BattlePersistenceError(
    'save-failed',
    'Battle changes are available in this tab, but could not be saved to browser storage.',
    { cause: error },
  );
}

export const SERVER_BATTLE_STORE_SNAPSHOT: BattleStoreSnapshot = Object.freeze({
  battle: emptyBattle(),
  hydrated: false,
  persistenceError: null,
});

/**
 * Create the synchronous external store shared by the battle page, the DM
 * screen, and encounter handoffs. The injected boundary keeps browser APIs out
 * of tests while continuing to read the legacy `battleOrganizer` payload.
 */
export function createBattleStore(
  dependencies: BattleStoreDependencies,
): BattleStore {
  const listeners = new Set<() => void>();
  let closed = false;
  let lastSerialized: string | null = null;

  let snapshot: BattleStoreSnapshot;
  if (!dependencies.storage) {
    snapshot = Object.freeze({
      battle: emptyBattle(),
      hydrated: true,
      persistenceError: new BattlePersistenceError(
        'unavailable',
        'Battle changes cannot be saved because browser storage is unavailable.',
      ),
    });
  } else {
    try {
      lastSerialized = dependencies.storage.getItem(BATTLE_ORGANIZER_STORAGE_KEY);
      snapshot = Object.freeze({
        battle: parseStoredBattle(lastSerialized),
        hydrated: true,
        persistenceError: null,
      });
    } catch (error) {
      snapshot = Object.freeze({
        battle: emptyBattle(),
        hydrated: true,
        persistenceError: normalizePersistenceError(error),
      });
    }
  }

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function setSnapshot(next: BattleStoreSnapshot): void {
    snapshot = Object.freeze(next);
    emit();
  }

  function invalidStateResult(): BattleWriteResult {
    return {
      ok: false,
      error: new BattlePersistenceError(
        'invalid-state',
        'The battle change contains invalid fields and was not applied.',
      ),
    };
  }

  function persist(next: BattleState): BattleWriteResult {
    if (closed) {
      return {
        ok: false,
        error: new BattlePersistenceError(
          'unavailable',
          'The battle store is closed and cannot save changes.',
        ),
      };
    }
    if (!isStoredBattleState(next)) return invalidStateResult();

    const battle = immutableBattle(next);
    let serialized: string;
    try {
      serialized = JSON.stringify(battle);
    } catch {
      return invalidStateResult();
    }

    if (!dependencies.storage) {
      const error = new BattlePersistenceError(
        'unavailable',
        'Battle changes are available in this tab, but browser storage is unavailable.',
      );
      setSnapshot({ battle, hydrated: true, persistenceError: error });
      return { ok: false, error };
    }

    try {
      dependencies.storage.setItem(BATTLE_ORGANIZER_STORAGE_KEY, serialized);
      lastSerialized = serialized;
      setSnapshot({ battle, hydrated: true, persistenceError: null });
      return { ok: true };
    } catch (cause) {
      const error = normalizePersistenceError(cause);
      setSnapshot({ battle, hydrated: true, persistenceError: error });
      return { ok: false, error };
    }
  }

  function replace(next: BattleState): BattleWriteResult {
    if (next === snapshot.battle) return { ok: true };
    return persist(next);
  }

  function update(
    transform: (current: BattleState) => BattleState,
  ): BattleWriteResult {
    let next: BattleState;
    try {
      // Read at invocation time, never from a hook render or setter closure.
      next = transform(snapshot.battle);
    } catch {
      return invalidStateResult();
    }
    return replace(next);
  }

  function retryPersistence(): BattleWriteResult {
    return persist(snapshot.battle);
  }

  function applyExternalChange(change: BattleStorageChange): void {
    if (closed) return;
    if (change.key !== null && change.key !== BATTLE_ORGANIZER_STORAGE_KEY) return;

    let raw: string | null;
    try {
      raw = change.key === BATTLE_ORGANIZER_STORAGE_KEY
        ? change.newValue
        : dependencies.storage?.getItem(BATTLE_ORGANIZER_STORAGE_KEY) ?? null;
    } catch (error) {
      setSnapshot({
        ...snapshot,
        persistenceError: normalizePersistenceError(error),
      });
      return;
    }

    if (raw === lastSerialized && snapshot.persistenceError === null) return;
    lastSerialized = raw;
    setSnapshot({
      battle: parseStoredBattle(raw),
      hydrated: true,
      persistenceError: null,
    });
  }

  let unsubscribeStorage: () => void = () => undefined;
  try {
    unsubscribeStorage = dependencies.subscribeToStorage?.(applyExternalChange)
      ?? unsubscribeStorage;
  } catch {
    // Persistence remains usable even when cross-tab notifications are not.
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => SERVER_BATTLE_STORE_SNAPSHOT,
    subscribe(listener) {
      if (closed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    replace,
    retryPersistence,
    close() {
      if (closed) return;
      closed = true;
      unsubscribeStorage();
      listeners.clear();
    },
  };
}
