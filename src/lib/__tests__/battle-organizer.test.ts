import { describe, expect, it } from 'vitest';
import {
  EMPTY_BATTLE,
  advanceTurn,
  applyDamage,
  applyHealing,
  battleFromEncounter,
  battleToMarkdown,
  finishBattle,
  getBattlePhase,
  getTurnCallouts,
  isBattleState,
  removeBattleCombatant,
  resumeBattle,
  setCurrentTurn,
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

  it('keeps setup callouts empty and prevents taking a turn before combat starts', () => {
    const prepared = { ...EMPTY_BATTLE, combatants: [combatant('ready', 15)] };
    expect(getTurnCallouts(prepared)).toEqual({});
    expect(setCurrentTurn(prepared, 'ready')).toBe(prepared);
  });

  it('finishes and resumes combat without losing the current turn, roster, or log', () => {
    const active = startBattle({ ...EMPTY_BATTLE, combatants: [combatant('fast', 18), combatant('slow', 8)] });
    const complete = finishBattle(active);

    expect(getBattlePhase(complete)).toBe('complete');
    expect(complete.started).toBe(false);
    expect(complete.currentId).toBe('fast');
    expect(complete.combatants).toEqual(active.combatants);
    expect(complete.log[0].message).toContain('Battle finished');
    expect(advanceTurn(complete)).toBe(complete);
    expect(battleToMarkdown(complete)).toContain('- Status: Complete');
    expect(battleToMarkdown(complete)).toContain('## Battle log');

    const resumed = resumeBattle(complete);
    expect(getBattlePhase(resumed)).toBe('active');
    expect(resumed.started).toBe(true);
    expect(resumed.currentId).toBe('fast');
    expect(resumed.round).toBe(active.round);
    expect(resumed.log[0].message).toBe('Battle resumed.');
  });

  it('accepts legacy version-1 battles and derives their phase from started', () => {
    const legacySetup = { ...EMPTY_BATTLE };
    delete legacySetup.phase;
    expect(isBattleState(legacySetup)).toBe(true);
    expect(getBattlePhase(legacySetup)).toBe('setup');

    const legacyActive = { ...legacySetup, started: true, currentId: 'legacy', combatants: [combatant('legacy', 12)] };
    expect(isBattleState(legacyActive)).toBe(true);
    expect(getBattlePhase(legacyActive)).toBe('active');
    expect(getTurnCallouts(legacyActive).current?.id).toBe('legacy');
  });

  it('advances turn resources correctly when the acting combatant is removed', () => {
    const fast = { ...combatant('fast', 18), reactionUsed: true, legendaryActionsMax: 3, legendaryActionsUsed: 2 };
    const middle = { ...combatant('middle', 12), reactionUsed: true, legendaryActionsMax: 3, legendaryActionsUsed: 1 };
    const slow = { ...combatant('slow', 8), reactionUsed: true, legendaryActionsMax: 3, legendaryActionsUsed: 3 };
    const active = startBattle({ ...EMPTY_BATTLE, combatants: [fast, middle, slow] });

    const withoutFast = removeBattleCombatant(active, 'fast');
    expect(withoutFast.currentId).toBe('middle');
    expect(withoutFast.round).toBe(1);
    expect(withoutFast.combatants.find((entry) => entry.id === 'middle')?.reactionUsed).toBe(false);
    expect(withoutFast.combatants.find((entry) => entry.id === 'slow')?.legendaryActionsUsed).toBe(3);

    const slowTurn = setCurrentTurn(active, 'slow');
    const wrapped = removeBattleCombatant(slowTurn, 'slow');
    expect(wrapped.currentId).toBe('fast');
    expect(wrapped.round).toBe(2);
    expect(wrapped.combatants.every((entry) => entry.legendaryActionsUsed === 0)).toBe(true);
    expect(wrapped.combatants.find((entry) => entry.id === 'fast')?.reactionUsed).toBe(false);
  });

  it('returns to a clean setup when the final combatant is removed', () => {
    const active = startBattle({ ...EMPTY_BATTLE, combatants: [combatant('solo', 12)] });
    const empty = removeBattleCombatant(active, 'solo');
    expect(getBattlePhase(empty)).toBe('setup');
    expect(empty).toMatchObject({ round: 1, started: false, currentId: undefined, combatants: [], log: [] });
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
    const battle = battleFromEncounter(encounter, [{
      id: 'member-aria',
      name: 'Aria',
      templateId: 'fighter-champion',
      level: 5,
      initiativeBonus: 7,
    }]);
    expect(battle.name).toBe('Road Ambush');
    expect(battle.started).toBe(false);
    expect(battle.phase).toBe('setup');
    expect(battle.combatants.map((entry) => entry.name)).toEqual(['Aria', 'Goblin 1', 'Goblin 2']);
    expect(battle.combatants[0]).toMatchObject({
      id: 'party-member-aria',
      sourcePartyMemberId: 'member-aria',
      kind: 'player',
      armorClass: 18,
      dexterity: 10,
    });
    expect(battle.combatants[1]).toMatchObject({ kind: 'enemy', maxHp: 10, armorClass: 15, dexterity: 14 });
  });
});
