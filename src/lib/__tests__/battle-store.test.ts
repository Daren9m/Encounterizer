import { describe, expect, it, vi } from 'vitest';
import {
  BATTLE_ORGANIZER_STORAGE_KEY,
  createBattleStore,
  type BattleStorageChange,
  type BattleStoreStorage,
} from '@/lib/battle-store';
import {
  EMPTY_BATTLE,
  type BattleCombatant,
  type BattleState,
} from '@/lib/battle-organizer';

function combatant(id: string): BattleCombatant {
  return {
    id,
    name: id,
    kind: 'player',
    initiative: 10,
    dexterity: 14,
    armorClass: 16,
    maxHp: 20,
    currentHp: 20,
    tempHp: 0,
    conditions: [],
    concentration: false,
    reactionUsed: false,
    legendaryActionsMax: 0,
    legendaryActionsUsed: 0,
    notes: '',
  };
}

function battle(name: string, round = 1): BattleState {
  return {
    ...EMPTY_BATTLE,
    name,
    round,
    combatants: [combatant('aria')],
  };
}

function harness(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(BATTLE_ORGANIZER_STORAGE_KEY, initial);
  let storageListener: ((change: BattleStorageChange) => void) | undefined;
  const storage: BattleStoreStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
  const store = createBattleStore({
    storage,
    subscribeToStorage(listener) {
      storageListener = listener;
      return () => {
        storageListener = undefined;
      };
    },
  });
  return {
    store,
    storage,
    values,
    dispatch(change: BattleStorageChange) {
      storageListener?.(change);
    },
  };
}

describe('battle external store', () => {
  it('hydrates the legacy battleOrganizer value into one stable snapshot', () => {
    const saved = battle('The Brass Vault', 4);
    const { store } = harness(JSON.stringify(saved));

    const first = store.getSnapshot();
    expect(first).toBe(store.getSnapshot());
    expect(first).toMatchObject({
      hydrated: true,
      persistenceError: null,
      battle: { name: 'The Brass Vault', round: 4 },
    });
    expect(first.battle).not.toBe(saved);
  });

  it('falls back safely when saved JSON or nested battle fields are invalid', () => {
    const corrupt = harness('{not json').store.getSnapshot();
    expect(corrupt.battle).toMatchObject(EMPTY_BATTLE);

    const malformed = {
      ...battle('Malformed'),
      combatants: [{ id: 'missing-fields' }],
    };
    const invalid = harness(JSON.stringify(malformed)).store.getSnapshot();
    expect(invalid.battle).toMatchObject(EMPTY_BATTLE);
    expect(invalid.persistenceError).toBeNull();
  });

  it('runs functional updates against the latest state and notifies same-document subscribers', () => {
    const { store, values } = harness();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.update((current) => ({ ...current, round: current.round + 1 }))).toEqual({ ok: true });
    expect(store.update((current) => ({ ...current, round: current.round + 1 }))).toEqual({ ok: true });

    expect(store.getSnapshot().battle.round).toBe(3);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(JSON.parse(values.get(BATTLE_ORGANIZER_STORAGE_KEY) ?? '{}')).toMatchObject({ round: 3 });
  });

  it('replaces battle state explicitly and rejects invalid replacements', () => {
    const { store, values } = harness();
    expect(store.replace(battle('Encounter handoff'))).toEqual({ ok: true });
    expect(store.getSnapshot().battle.name).toBe('Encounter handoff');
    expect(JSON.parse(values.get(BATTLE_ORGANIZER_STORAGE_KEY) ?? '{}')).toMatchObject({
      name: 'Encounter handoff',
    });

    const before = store.getSnapshot();
    const result = store.replace({ ...battle('Bad'), round: 0 });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-state' } });
    expect(store.getSnapshot()).toBe(before);
  });

  it('adopts valid cross-tab storage events and ignores unrelated keys', () => {
    const { store, dispatch } = harness(JSON.stringify(battle('First tab')));
    const listener = vi.fn();
    store.subscribe(listener);

    dispatch({ key: 'another:key', newValue: JSON.stringify(battle('Ignored')) });
    expect(store.getSnapshot().battle.name).toBe('First tab');
    expect(listener).not.toHaveBeenCalled();

    dispatch({
      key: BATTLE_ORGANIZER_STORAGE_KEY,
      newValue: JSON.stringify(battle('Second tab', 7)),
    });
    expect(store.getSnapshot().battle).toMatchObject({ name: 'Second tab', round: 7 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps in-memory changes and surfaces persistence failures until retry succeeds', () => {
    let failWrites = true;
    const values = new Map<string, string>();
    const storage: BattleStoreStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (failWrites) {
          const error = new Error('full');
          error.name = 'QuotaExceededError';
          throw error;
        }
        values.set(key, value);
      },
    };
    const store = createBattleStore({ storage });

    const failed = store.replace(battle('Unsaved but playable'));
    expect(failed).toMatchObject({ ok: false, error: { code: 'quota' } });
    expect(store.getSnapshot()).toMatchObject({
      battle: { name: 'Unsaved but playable' },
      persistenceError: { code: 'quota' },
    });

    failWrites = false;
    expect(store.retryPersistence()).toEqual({ ok: true });
    expect(store.getSnapshot().persistenceError).toBeNull();
    expect(JSON.parse(values.get(BATTLE_ORGANIZER_STORAGE_KEY) ?? '{}')).toMatchObject({
      name: 'Unsaved but playable',
    });
  });
});
