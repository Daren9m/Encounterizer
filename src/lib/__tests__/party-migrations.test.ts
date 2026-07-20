import { describe, expect, it } from 'vitest';
import {
  mergeForecastMembersIntoPartyLibrary,
  migrateLegacyPartyData,
} from '@/lib/party-migration';
import { createEmptyPartyLibrary, createPartyLibrary, type PartyIdFactory } from '@/lib/party';

function deterministicIds(): PartyIdFactory {
  const counts = { party: 0, member: 0 };
  return (kind) => `${kind}-${++counts[kind]}`;
}

describe('legacy Party Library migration', () => {
  it('prefers the detailed roster and preserves exact name, order, level, template, and overrides', () => {
    const saveBonuses = { dex: 6, con: 4, wis: 2 };
    const richMembers = [
      {
        name: 'Mira',
        templateId: 'wizard-evoker',
        level: 9,
        initiativeBonus: 7,
        overrides: {
          ac: 17,
          maxHp: 63,
          attackBonus: 8,
          attacksPerRound: 1,
          avgDamagePerHit: 5.5,
          healingPerRound: 2,
          saveBonuses,
          spellDc: 17,
          avgSpellDamagePerRound: 28,
        },
      },
      {
        name: '',
        templateId: 'fighter-battlemaster',
        level: 8,
        overrides: { ac: 21, maxHp: 88 },
      },
      {
        name: 'Sable',
        templateId: 'rogue-thief',
        level: 7,
      },
    ];

    const result = migrateLegacyPartyData({
      partyConfig: { version: 1, members: richMembers },
      encounterSettings: { partySize: 10, partyLevel: 20 },
      noncombatPartySize: 8,
      noncombatPartyLevel: 19,
    }, { now: 1_000, createId: deterministicIds() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('party-config');
    expect(result.library.parties[0].members.map((member) => ({
      name: member.name,
      templateId: member.templateId,
      level: member.level,
      initiativeBonus: member.initiativeBonus,
      overrides: member.overrides,
    }))).toEqual(richMembers);
    expect(result.library.parties[0].members.map((member) => member.id))
      .toEqual(['member-1', 'member-2', 'member-3']);

    saveBonuses.dex = 99;
    expect(result.library.parties[0].members[0].overrides!.saveBonuses!.dex).toBe(6);
  });

  it('uses encounter settings before noncombat settings when no detailed roster exists', () => {
    const result = migrateLegacyPartyData({
      encounterSettings: { partySize: 3, partyLevel: 6 },
      noncombatPartySize: 7,
      noncombatPartyLevel: 12,
    }, { now: 200, createId: deterministicIds() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('encounter-settings');
    expect(result.library.parties[0].members).toHaveLength(3);
    expect(result.library.parties[0].members.every((member) => member.level === 6)).toBe(true);
    expect(result.library.parties[0].members.map((member) => member.name))
      .toEqual(['Player 1', 'Player 2', 'Player 3']);
  });

  it('uses noncombat settings after absent or unusable scalar encounter settings', () => {
    const result = migrateLegacyPartyData({
      partyConfig: { version: 1, members: [] },
      encounterSettings: { partySize: 11, partyLevel: 6 },
      noncombatPartySize: 2,
      noncombatPartyLevel: 11,
    }, { createId: deterministicIds() });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe('noncombat-settings');
    expect(result.library.parties[0].members).toHaveLength(2);
    expect(result.library.parties[0].members.every((member) => member.level === 11)).toBe(true);
  });

  it('returns an empty library when no complete legacy source exists', () => {
    const result = migrateLegacyPartyData({
      noncombatPartySize: 4,
      noncombatPartyLevel: undefined,
    });

    expect(result).toEqual({
      ok: true,
      source: 'empty',
      library: createEmptyPartyLibrary(),
    });
  });

  it('blocks scalar fallback when a non-empty rich roster is malformed', () => {
    const malformed = {
      version: 1,
      members: [
        { name: 'Recover Me', templateId: 'wizard-evoker', level: 9 },
        { name: 'Broken', templateId: 'cleric-life', level: 99 },
      ],
    };
    const before = JSON.stringify(malformed);

    const result = migrateLegacyPartyData({
      partyConfig: malformed,
      encounterSettings: { partySize: 4, partyLevel: 3 },
      noncombatPartySize: 4,
      noncombatPartyLevel: 3,
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? '' : result.message).toContain('left untouched');
    expect(JSON.stringify(malformed)).toBe(before);
  });

  it('blocks fallback when detailed roster JSON was corrupt', () => {
    const result = migrateLegacyPartyData({
      partyConfigCorrupt: true,
      encounterSettings: { partySize: 4, partyLevel: 3 },
    });

    expect(result).toMatchObject({ ok: false });
  });
});

describe('forecast compatibility merge', () => {
  it('retains durable identity and metadata across a reordered forecast snapshot', () => {
    const library = createPartyLibrary('Keepers', [
      {
        name: 'Aria', playerName: 'Dana', templateId: 'fighter-champion',
        classLabel: 'Champion', level: 5, passivePerception: 14, notes: 'Has the key.',
      },
      { name: 'Bram', templateId: 'cleric-life', level: 5 },
    ], { now: 10, createId: deterministicIds() });
    const [aria, bram] = library.parties[0].members;

    const merged = mergeForecastMembersIntoPartyLibrary(library, [
      {
        id: bram.id,
        name: 'Bram Updated', templateId: 'cleric-life', level: 6,
        overrides: { saveBonuses: { dex: 1, con: 4, wis: 7 } },
      },
      {
        id: aria.id,
        name: 'Aria', templateId: 'fighter-champion', level: 6,
        initiativeBonus: 5,
      },
    ], { now: 20, createId: deterministicIds() });

    expect(merged.parties[0].members.map((member) => member.id)).toEqual([bram.id, aria.id]);
    expect(merged.parties[0].members[1]).toMatchObject({
      playerName: 'Dana',
      classLabel: 'Champion',
      passivePerception: 14,
      notes: 'Has the key.',
      initiativeBonus: 5,
    });
    expect(library.parties[0].members.map((member) => member.name)).toEqual(['Aria', 'Bram']);
  });

  it('creates a fresh identity for an imported member in a mixed durable draft', () => {
    const library = createPartyLibrary('Keepers', [
      { name: 'Aria', templateId: 'fighter-champion', level: 5 },
      { name: 'Bram', templateId: 'cleric-life', level: 5 },
      { name: 'Cyra', templateId: 'wizard-evoker', level: 5 },
    ], { now: 10, createId: deterministicIds() });
    const [aria, , cyra] = library.parties[0].members;
    const newIds = deterministicIds();

    const merged = mergeForecastMembersIntoPartyLibrary(library, [
      { id: aria.id, name: 'Aria', templateId: 'fighter-champion', level: 5 },
      { id: cyra.id, name: 'Cyra', templateId: 'wizard-evoker', level: 5 },
      { name: 'Dara', templateId: 'rogue-thief', level: 5 },
    ], { now: 20, createId: newIds });

    expect(merged.parties[0].members.map((member) => member.id)).toEqual([
      aria.id,
      cyra.id,
      'member-4',
    ]);
    expect(new Set(merged.parties[0].members.map((member) => member.id)).size).toBe(3);
  });
});
