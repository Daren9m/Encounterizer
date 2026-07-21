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
  getRecipeBeatState,
  getTurnCallouts,
  isBattleState,
  removeBattleCombatant,
  resolveRecipeBeat,
  resumeBattle,
  seedBattleFromParty,
  seededPartyMemberIds,
  setCurrentTurn,
  setRecipeOutcome,
  sortCombatants,
  startBattle,
  type BattleCombatant,
  type BattleState,
} from '@/lib/battle-organizer';
import type { Encounter, EncounterRecipePlan, Monster } from '@/lib/types';
import { contextFromActiveParty } from '@/lib/encounter-party';
import type { PartyProfile } from '@/lib/party';
import { makeMonster } from './test-helpers';

function combatant(id: string, initiative: number, dexterity = 10): BattleCombatant {
  return {
    id, name: id, kind: 'enemy', initiative, dexterity, armorClass: 12,
    maxHp: 20, currentHp: 20, tempHp: 0, conditions: [], concentration: false,
    reactionUsed: false, legendaryActionsMax: 0, legendaryActionsUsed: 0, notes: '',
  };
}

const RECIPE_PLAN: EncounterRecipePlan = {
  version: 1,
  recipeId: 'test-recipe',
  recipeName: 'Test Recipe',
  objective: { title: 'Protect the ward', summary: 'Keep the ward standing.', success: 'Ward survives.', failure: 'Ward falls.' },
  setup: ['Place the ward.'],
  beats: [
    { id: 'round-two', title: 'Pressure rises', trigger: { kind: 'round', round: 2 }, guidance: 'Advance.', effect: 'Move the threat.' },
    { id: 'half-hp', title: 'Leader changes', trigger: { kind: 'leader-hp', percent: 50 }, guidance: 'Transform.', effect: 'Change form.' },
    { id: 'ward-down', title: 'Ward falls', trigger: { kind: 'ally-at-zero' }, guidance: 'Check the ward.', effect: 'Mark failure.' },
  ],
  forecast: { headline: 'Read the objective.', guidance: ['Check the curve.'], caveat: 'Objective not modeled.' },
  terrain: 'A test chamber',
  closing: 'Record the result.',
  specialParticipant: { name: 'Protected NPC', kind: 'ally', armorClass: 12, maxHp: 20, notes: 'Objective ally' },
};

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

  it('rejects malformed persisted recipe guidance without breaking legacy battles', () => {
    expect(isBattleState({ ...EMPTY_BATTLE, recipePlan: { version: 1 } })).toBe(false);
    expect(isBattleState({
      ...EMPTY_BATTLE,
      recipePlan: RECIPE_PLAN,
      recipeProgress: { resolvedBeatIds: ['round-two'], outcome: 'success' },
    })).toBe(true);
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

  it('carries an isolated party reference and anonymous snapshot into battle handoff', () => {
    const goblin: Monster = makeMonster({ id: 'goblin', name: 'Goblin' });
    const encounter: Encounter = {
      id: 'ambush', name: 'Road Ambush', description: '', environment: 'Forest',
      difficulty: 'Moderate', monsters: [{ monster: goblin, count: 1 }], totalXp: 50, seed: 1,
    };
    const party: PartyProfile = {
      id: 'party-lanterns',
      name: 'The Lanterns',
      createdAt: 1,
      updatedAt: 2,
      members: [{
        id: 'member-aria',
        name: 'Aria',
        playerName: 'Dana',
        notes: 'Private note.',
        level: 5,
        templateId: 'fighter-champion',
        overrides: { ac: 19 },
      }],
    };
    const context = contextFromActiveParty(party, ['member-aria']);
    const battle = battleFromEncounter(encounter, [{
      id: 'member-aria', name: 'Aria', level: 5, templateId: 'fighter-champion',
    }], context);

    expect(battle.partyContext).toMatchObject({
      source: 'library',
      partyId: 'party-lanterns',
      selectedMemberIds: ['member-aria'],
      snapshot: {
        version: 1,
        members: [{ level: 5, templateId: 'fighter-champion', overrides: { ac: 19 } }],
      },
    });
    expect(JSON.stringify(battle.partyContext)).not.toContain('Aria');
    expect(JSON.stringify(battle.partyContext)).not.toContain('Dana');
    expect(JSON.stringify(battle.partyContext)).not.toContain('Private note');
    expect(battle.partyContext).not.toBe(context);
    party.members[0].level = 20;
    expect(battle.partyContext?.snapshot.members[0].level).toBe(5);
    expect(isBattleState(battle)).toBe(true);

    const persisted: unknown = JSON.parse(JSON.stringify(battle));
    expect(isBattleState(persisted)).toBe(true);
    expect((persisted as BattleState).partyContext?.snapshot.members[0])
      .toMatchObject({ level: 5, templateId: 'fighter-champion' });
  });

  it('carries recipe guidance into live battle and tracks triggered beats and outcome', () => {
    const leader = makeMonster({ id: 'leader', name: 'Leader', hitPoints: 100 });
    const encounter: Encounter = {
      id: 'recipe-test', name: 'Recipe Test', description: '', environment: 'Urban',
      difficulty: 'Moderate', monsters: [{ monster: leader, count: 1, recipeRole: 'Boss' }],
      totalXp: leader.xp, seed: 7, recipePlan: RECIPE_PLAN,
    };
    let battle = battleFromEncounter(encounter, []);

    expect(battle.recipePlan).toEqual(RECIPE_PLAN);
    expect(battle.combatants.map((entry) => entry.name)).toEqual(['Protected NPC', 'Leader']);
    expect(battle.combatants[1].notes).toContain('Boss');
    expect(getRecipeBeatState(battle, RECIPE_PLAN.beats[0])).toBe('upcoming');

    battle = { ...battle, round: 2 };
    expect(getRecipeBeatState(battle, RECIPE_PLAN.beats[0])).toBe('due');
    battle = applyDamage(battle, 'encounter-leader-1', 50);
    expect(getRecipeBeatState(battle, RECIPE_PLAN.beats[1])).toBe('due');
    battle = applyDamage(battle, 'recipe-test-recipe-objective', 20);
    expect(getRecipeBeatState(battle, RECIPE_PLAN.beats[2])).toBe('due');

    battle = resolveRecipeBeat(battle, 'round-two');
    expect(getRecipeBeatState(battle, RECIPE_PLAN.beats[0])).toBe('resolved');
    battle = setRecipeOutcome(battle, 'failure');
    expect(battle.recipeProgress?.outcome).toBe('failure');
    expect(battleToMarkdown(battle)).toContain('## Recipe objective');
    expect(battleToMarkdown(battle)).toContain('[x] **Pressure rises:**');
  });

  it('seeds selected active-party members without duplicating or replacing manual rows', () => {
    const party: PartyProfile = {
      id: 'party-lanterns',
      name: 'The Lanterns',
      createdAt: 1,
      updatedAt: 2,
      members: [
        {
          id: 'member-aria', name: 'Aria', level: 5,
          templateId: 'fighter-champion', notes: 'Carries the moon key.',
          overrides: { ac: 19, maxHp: 51 },
        },
        {
          id: 'member-borin', name: 'Borin', level: 7,
          templateId: 'cleric-life', overrides: { ac: 18 },
        },
      ],
    };
    const manualPlayer = { ...combatant('guest', 12), kind: 'player' as const };
    const enemy = combatant('ogre', 8);
    const stalePartyRow = {
      ...combatant('party-old', 0),
      kind: 'player' as const,
      sourcePartyMemberId: 'member-old',
    };
    const draft: BattleState = {
      ...EMPTY_BATTLE,
      combatants: [manualPlayer, enemy, stalePartyRow],
    };

    const seeded = seedBattleFromParty(draft, party, ['member-borin']);

    expect(seeded.combatants.map((entry) => entry.id))
      .toEqual(['party-member-borin', 'guest', 'ogre']);
    expect(seeded.combatants[0]).toMatchObject({
      sourcePartyMemberId: 'member-borin',
      name: 'Borin',
      kind: 'player',
    });
    expect(seeded.partyContext).toMatchObject({
      source: 'library',
      partyId: 'party-lanterns',
      selectedMemberIds: ['member-borin'],
    });
    expect(seededPartyMemberIds(seeded, party)).toEqual(['member-borin']);

    const reseeded = seedBattleFromParty(seeded, party, ['member-aria']);
    expect(reseeded.combatants.map((entry) => entry.id))
      .toEqual(['party-member-aria', 'guest', 'ogre']);
    expect(new Set(reseeded.combatants.map((entry) => entry.id)).size)
      .toBe(reseeded.combatants.length);

    const removedFromDraft = removeBattleCombatant(reseeded, 'party-member-aria');
    expect(seededPartyMemberIds(removedFromDraft, party)).toEqual([]);
    expect(removedFromDraft.partyContext).toMatchObject({
      selectedMemberIds: [],
      snapshot: { members: [] },
    });

    party.members[0].name = 'Changed later';
    party.members[0].notes = 'Changed later too.';
    party.members[0].overrides!.maxHp = 999;
    expect(reseeded.combatants[0]).toMatchObject({
      name: 'Aria',
      maxHp: 51,
    });
    expect(reseeded.combatants[0].notes).toContain('Carries the moon key.');
  });

  it('never reseeds a battle after combat has started or with zero attendance', () => {
    const party: PartyProfile = {
      id: 'party-one', name: 'One', createdAt: 1, updatedAt: 1,
      members: [{
        id: 'member-one', name: 'One', level: 1, templateId: 'fighter-champion',
      }],
    };
    const draft = { ...EMPTY_BATTLE, combatants: [combatant('enemy', 10)] };
    expect(seedBattleFromParty(draft, party, [])).toBe(draft);

    const active = startBattle(draft);
    expect(seedBattleFromParty(active, party)).toBe(active);
    expect(seededPartyMemberIds(active, party)).toBeUndefined();
  });
});
