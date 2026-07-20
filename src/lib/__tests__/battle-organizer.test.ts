import { describe, expect, it } from 'vitest';
import {
  EMPTY_BATTLE,
  advanceTurn,
  applyDamage,
  applyHealing,
  battleFromEncounter,
  getTurnCallouts,
  sortCombatants,
  startBattle,
  type BattleCombatant,
} from '@/lib/battle-organizer';
import type { Encounter, Monster } from '@/lib/types';
import { makeMonster } from './test-helpers';

function combatant(id: string, initiative: number, dexterity = 10): BattleCombatant {
  return {
    id, name: id, kind: 'enemy', initiative, dexterity, armorClass: 12,
    maxHp: 20, currentHp: 20, tempHp: 0, conditions: [], concentration: false,
    reactionUsed: false, legendaryActionsMax: 0, legendaryActionsUsed: 0, notes: '',
  };
}

describe('battle organizer', () => {
  it('sorts initiative with Dexterity and name tie breakers', () => {
    const result = sortCombatants([combatant('B', 12, 14), combatant('A', 12, 14), combatant('C', 12, 16)]);
    expect(result.map((entry) => entry.id)).toEqual(['C', 'A', 'B']);
  });

  it('advances callouts and wraps to a new round', () => {
    let state = startBattle({ ...EMPTY_BATTLE, combatants: [combatant('slow', 4), combatant('fast', 18), combatant('mid', 10)] });
    expect(getTurnCallouts(state)).toMatchObject({ current: { id: 'fast' }, next: { id: 'mid' }, onDeck: { id: 'slow' } });
    state = advanceTurn(advanceTurn(advanceTurn(state)));
    expect(state.round).toBe(2);
    expect(state.currentId).toBe('fast');
  });

  it('spends temporary HP before HP and caps healing', () => {
    const target = { ...combatant('tank', 10), tempHp: 5, currentHp: 10 };
    let state = applyDamage({ ...EMPTY_BATTLE, combatants: [target] }, target.id, 8);
    expect(state.combatants[0]).toMatchObject({ tempHp: 0, currentHp: 7 });
    state = applyHealing(state, target.id, 99);
    expect(state.combatants[0].currentHp).toBe(20);
  });

  it('creates individual tracker entries from a configured encounter', () => {
    const goblin: Monster = makeMonster({
      id: 'goblin', name: 'Goblin', hitPoints: 10,
      armor: { ac: 15 }, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    });
    const encounter: Encounter = {
      id: 'ambush', name: 'Road Ambush', description: '', environment: 'Forest',
      difficulty: 'Moderate', monsters: [{ monster: goblin, count: 2 }], totalXp: 100, seed: 1,
    };
    const battle = battleFromEncounter(encounter, [{ name: 'Aria', templateId: 'fighter-champion', level: 5 }]);
    expect(battle.name).toBe('Road Ambush');
    expect(battle.started).toBe(false);
    expect(battle.combatants.map((entry) => entry.name)).toEqual(['Aria', 'Goblin 1', 'Goblin 2']);
    expect(battle.combatants[0]).toMatchObject({ kind: 'player', armorClass: 18 });
    expect(battle.combatants[1]).toMatchObject({ kind: 'enemy', maxHp: 10, armorClass: 15, dexterity: 14 });
  });
});
