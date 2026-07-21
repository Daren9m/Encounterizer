import { describe, expect, it } from 'vitest';
import {
  partyToBattleCombatants,
  partyToBudgetParty,
  partyToDmScreenSummary,
  partyToForecastConfig,
  partyToNoncombatDefaults,
  partyToSimPlayers,
} from '@/lib/party-adapters';
import type { PartyProfile } from '@/lib/party';

function partyFixture(): PartyProfile {
  return {
    id: 'party-keepers',
    name: 'The Keepers',
    createdAt: 10,
    updatedAt: 20,
    members: [
      {
        id: 'member-aria',
        name: 'Aria',
        playerName: 'Dana',
        level: 4,
        templateId: 'fighter-champion',
        classLabel: 'Champion Fighter',
        initiativeBonus: 7,
        passivePerception: 16,
        notes: 'Carries the moon key.',
        overrides: {
          ac: 19,
          maxHp: 48,
          attackBonus: 8,
          attacksPerRound: 2,
          avgDamagePerHit: 11,
          saveBonuses: { dex: 3, con: 7, wis: 2 },
        },
      },
      {
        id: 'member-blank',
        name: '',
        level: 7,
        templateId: 'wizard-evoker',
      },
      {
        id: 'member-sable',
        name: 'Sable',
        level: 9,
        templateId: 'rogue-thief',
        classLabel: 'Mastermind',
      },
    ],
  };
}

describe('Party Library adapters', () => {
  it('projects exact mixed levels into encounter budgets and preserves party order for attendance', () => {
    const party = partyFixture();

    const budget = partyToBudgetParty(party, ['member-sable', 'member-aria']);

    expect(budget).toEqual({
      id: 'party-keepers',
      name: 'The Keepers',
      members: [
        { name: 'Aria', level: 4, className: 'Champion Fighter' },
        { name: 'Sable', level: 9, className: 'Mastermind' },
      ],
    });
    budget.members[0].name = 'Changed snapshot';
    expect(party.members[0].name).toBe('Aria');
  });

  it('creates an isolated forecast snapshot with stable IDs, fallbacks, and exact overrides', () => {
    const party = partyFixture();

    const forecast = partyToForecastConfig(party);

    expect(forecast.version).toBe(1);
    expect(forecast.members.map((member) => member.id))
      .toEqual(['member-aria', 'member-blank', 'member-sable']);
    expect(forecast.members[1].name).toBe('Player 2');
    expect(forecast.members[0]).toMatchObject({
      name: 'Aria',
      templateId: 'fighter-champion',
      level: 4,
      initiativeBonus: 7,
      overrides: {
        ac: 19,
        maxHp: 48,
        attackBonus: 8,
        attacksPerRound: 2,
        avgDamagePerHit: 11,
        saveBonuses: { dex: 3, con: 7, wis: 2 },
      },
    });

    forecast.members[0].overrides!.saveBonuses!.con = 99;
    expect(party.members[0].overrides!.saveBonuses!.con).toBe(7);
  });

  it('builds simulation players with durable identity and configured combat values', () => {
    const players = partyToSimPlayers(partyFixture(), ['member-aria']);

    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({
      id: 'member-aria',
      name: 'Aria',
      level: 4,
      ac: 19,
      maxHp: 48,
      initiativeMod: 7,
    });
  });

  it('creates fresh battle state while retaining durable source identity', () => {
    const party = partyFixture();

    const first = partyToBattleCombatants(party, ['member-aria']);
    const second = partyToBattleCombatants(party, ['member-aria']);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: 'party-member-aria',
      sourcePartyMemberId: 'member-aria',
      name: 'Aria',
      kind: 'player',
      armorClass: 19,
      maxHp: 48,
      currentHp: 48,
      initiative: 0,
      conditions: [],
      concentration: false,
      reactionUsed: false,
      dexterity: 10,
    });
    expect(first[0].notes).toContain('Carries the moon key.');
    first[0].conditions.push('Blinded');
    first[0].currentHp = 1;
    expect(second[0].conditions).toEqual([]);
    expect(second[0].currentHp).toBe(48);
    expect(party.members[0]).not.toHaveProperty('currentHp');
    expect(party.members[0]).not.toHaveProperty('conditions');
  });

  it('derives rounded-mean noncombat defaults and handles empty attendance', () => {
    const party = partyFixture();

    expect(partyToNoncombatDefaults(party)).toEqual({ partySize: 3, partyLevel: 7 });
    expect(partyToNoncombatDefaults(party, ['member-aria', 'member-sable']))
      .toEqual({ partySize: 2, partyLevel: 7 });
    expect(partyToNoncombatDefaults(party, [])).toBeNull();
  });

  it('creates a DM summary with level range, metadata, computed stats, and snapshot isolation', () => {
    const party = partyFixture();

    const summary = partyToDmScreenSummary(party);

    expect(summary).toMatchObject({
      id: 'party-keepers',
      name: 'The Keepers',
      memberCount: 3,
      levelRange: { min: 4, max: 9 },
    });
    expect(summary.members[0]).toMatchObject({
      id: 'member-aria',
      name: 'Aria',
      playerName: 'Dana',
      classLabel: 'Champion Fighter',
      level: 4,
      armorClass: 19,
      initiativeBonus: 7,
      passivePerception: 16,
      notes: 'Carries the moon key.',
    });
    expect(summary.members[1]).toMatchObject({
      id: 'member-blank',
      name: 'Player 2',
      classLabel: 'Wizard (Evoker)',
    });
    expect(summary.members[1]).not.toHaveProperty('initiativeBonus');
    expect(summary.members[2]).not.toHaveProperty('initiativeBonus');

    summary.members[0].name = 'Changed summary';
    expect(party.members[0].name).toBe('Aria');
    expect(partyToDmScreenSummary(party, []).levelRange).toBeNull();
  });
});
