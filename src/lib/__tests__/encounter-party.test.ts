import { describe, expect, it } from 'vitest';
import {
  cloneEncounterPartyContext,
  contextFromActiveParty,
  contextFromCustomParty,
  contextFromSharedSnapshot,
  contextToBudgetParty,
  contextToForecastConfig,
  isEncounterPartyContext,
  MAX_ENCOUNTER_PARTY_MEMBERS,
  parseAnonymousPartySnapshot,
  partyLevelRange,
  readEncounterPartyShareParams,
  reconcilePartySelection,
  representativePartyLevel,
  serializeAnonymousPartySnapshot,
  snapshotActiveParty,
  snapshotForecastConfig,
  snapshotToBudgetParty,
  writeEncounterPartyShareParams,
} from '@/lib/encounter-party';
import { getPartyXpBudget } from '@/lib/encounter-generator';
import type { PartyProfile } from '@/lib/party';

function partyFixture(): PartyProfile {
  return {
    id: 'party-lanterns',
    name: 'The Lanterns',
    createdAt: 1,
    updatedAt: 2,
    members: [
      {
        id: 'member-aria',
        name: 'Aria',
        playerName: 'Dana',
        notes: 'Carries the moon key.',
        level: 4,
        templateId: 'fighter-champion',
        overrides: {
          ac: 19,
          maxHp: 45,
          saveBonuses: { dex: 3, con: 7, wis: 2 },
        },
      },
      {
        id: 'member-bran',
        name: 'Bran',
        playerName: 'Lee',
        notes: 'Owes the guild.',
        level: 7,
        templateId: 'cleric-life',
      },
      {
        id: 'member-cinder',
        name: 'Cinder',
        level: 9,
        templateId: 'rogue-thief',
      },
    ],
  };
}

describe('encounter party snapshots', () => {
  it('keeps attendance in roster order and drops stale IDs', () => {
    const party = partyFixture();
    expect(reconcilePartySelection(party, ['missing', 'member-cinder', 'member-aria']))
      .toEqual(['member-aria', 'member-cinder']);
    expect(reconcilePartySelection(party)).toEqual([
      'member-aria',
      'member-bran',
      'member-cinder',
    ]);
  });

  it('captures only anonymous mechanics and deeply isolates overrides', () => {
    const party = partyFixture();
    const snapshot = snapshotActiveParty(party, ['member-aria']);

    expect(snapshot).toEqual({
      version: 1,
      members: [{
        level: 4,
        templateId: 'fighter-champion',
        overrides: {
          ac: 19,
          maxHp: 45,
          saveBonuses: { dex: 3, con: 7, wis: 2 },
        },
      }],
    });
    expect(snapshot.members[0]).not.toHaveProperty('id');
    expect(snapshot.members[0]).not.toHaveProperty('name');
    expect(snapshot.members[0]).not.toHaveProperty('playerName');
    expect(snapshot.members[0]).not.toHaveProperty('notes');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.members)).toBe(true);
    expect(Object.isFrozen(snapshot.members[0].overrides?.saveBonuses)).toBe(true);

    party.members[0].level = 20;
    party.members[0].overrides!.saveBonuses!.con = 99;
    expect(snapshot.members[0].level).toBe(4);
    expect(snapshot.members[0].overrides?.saveBonuses?.con).toBe(7);
  });

  it('uses selected mixed levels for exact 2024 budgets and forecast inputs', () => {
    const context = contextFromActiveParty(
      partyFixture(),
      ['member-cinder', 'member-aria'],
    );
    const budgetParty = contextToBudgetParty(context);
    const forecast = contextToForecastConfig(context, ['Aria', 'Cinder']);

    expect(context).toMatchObject({
      source: 'library',
      partyId: 'party-lanterns',
      selectedMemberIds: ['member-aria', 'member-cinder'],
    });
    expect(budgetParty.members.map((member) => member.level)).toEqual([4, 9]);
    expect(getPartyXpBudget(budgetParty, 'Moderate')).toBe(2_375);
    expect(forecast.members).toMatchObject([
      { id: 'member-aria', name: 'Aria', level: 4, templateId: 'fighter-champion' },
      { id: 'member-cinder', name: 'Cinder', level: 9, templateId: 'rogue-thief' },
    ]);
  });

  it('keeps a historical context reproducible after the live party levels up', () => {
    const party = partyFixture();
    const saved = cloneEncounterPartyContext(contextFromActiveParty(party));
    const originalBudget = getPartyXpBudget(contextToBudgetParty(saved), 'High');

    party.members.forEach((member) => { member.level = 20; });

    expect(getPartyXpBudget(contextToBudgetParty(saved), 'High')).toBe(originalBudget);
    expect(contextToForecastConfig(saved).members.map((member) => member.level))
      .toEqual([4, 7, 9]);
  });

  it('round-trips an anonymous share snapshot and strips unexpected identity fields', () => {
    const raw = JSON.stringify({
      version: 1,
      members: [{
        id: 'member-secret',
        name: 'Secret Name',
        notes: 'Secret note',
        level: 5,
        templateId: 'wizard-evoker',
      }],
    });
    const parsed = parseAnonymousPartySnapshot(raw);

    expect(parsed).toEqual({
      version: 1,
      members: [{ level: 5, templateId: 'wizard-evoker' }],
    });
    expect(serializeAnonymousPartySnapshot(parsed!)).not.toContain('Secret');
    expect(contextFromSharedSnapshot(parsed!).source).toBe('shared');
  });

  it('allowlists nested overrides so identity and prototype keys cannot leak', () => {
    const raw = '{"version":1,"members":[{"level":5,"templateId":"wizard-evoker","overrides":{"ac":17,"name":"Nested Secret","notes":"Nested private note","id":"member-secret","__proto__":{"polluted":true}}}]}';
    const parsed = parseAnonymousPartySnapshot(raw);
    const serialized = serializeAnonymousPartySnapshot(parsed!);

    expect(parsed?.members[0].overrides).toEqual({ ac: 17 });
    expect(serialized).not.toContain('Nested Secret');
    expect(serialized).not.toContain('private note');
    expect(serialized).not.toContain('member-secret');
    expect(serialized).not.toContain('__proto__');
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('rejects malformed, empty, and unknown-template share snapshots', () => {
    expect(parseAnonymousPartySnapshot(null)).toBeNull();
    expect(parseAnonymousPartySnapshot('{bad json')).toBeNull();
    expect(parseAnonymousPartySnapshot(JSON.stringify({ version: 1, members: [] }))).toBeNull();
    expect(parseAnonymousPartySnapshot(JSON.stringify({
      version: 1,
      members: [{ level: 3, templateId: 'Dana the Wizard' }],
    }))).toBeNull();
  });

  it('creates isolated custom contexts with useful level summaries', () => {
    const snapshot = snapshotForecastConfig({
      version: 1,
      members: [
        { name: 'One', level: 2, templateId: 'fighter-champion' },
        { name: 'Two', level: 6, templateId: 'wizard-evoker' },
      ],
    });
    const context = contextFromCustomParty(contextToForecastConfig({
      source: 'custom',
      snapshot,
    }));

    expect(context.source).toBe('custom');
    expect(partyLevelRange(context.snapshot)).toEqual({ min: 2, max: 6 });
    expect(representativePartyLevel(context.snapshot)).toBe(4);
    expect(snapshotToBudgetParty(context.snapshot).members).toHaveLength(2);
    expect(isEncounterPartyContext(context)).toBe(true);
  });

  it('writes exact anonymous share inputs without durable identity', () => {
    const context = contextFromActiveParty(
      partyFixture(),
      ['member-aria', 'member-cinder'],
    );
    const params = new URLSearchParams();

    writeEncounterPartyShareParams(params, context);

    const serialized = decodeURIComponent(params.toString());
    expect(params.get('size')).toBe('2');
    expect(params.get('level')).toBe('7');
    expect(serialized).not.toContain('party-lanterns');
    expect(serialized).not.toContain('member-aria');
    expect(serialized).not.toContain('Aria');
    expect(serialized).not.toContain('moon key');

    const loaded = readEncounterPartyShareParams(params);
    expect(loaded).toMatchObject({ mode: 'snapshot', size: 2, level: 7 });
    expect(loaded?.context.source).toBe('shared');
    expect(loaded?.context.snapshot.members.map((member) => member.level))
      .toEqual([4, 9]);
  });

  it('keeps legacy scalar links in isolated custom mode', () => {
    const params = new URLSearchParams('size=6&level=3');
    const loaded = readEncounterPartyShareParams(params);

    expect(loaded).toMatchObject({ mode: 'custom', size: 6, level: 3 });
    expect(loaded?.context.source).toBe('custom');
    expect(loaded?.context.snapshot.members).toHaveLength(6);
    expect(loaded?.context.snapshot.members.every((member) => member.level === 3)).toBe(true);
  });

  it('falls back to valid legacy scalars when an anonymous snapshot is invalid', () => {
    const params = new URLSearchParams({
      size: '5',
      level: '8',
      ps: JSON.stringify({
        version: 99,
        members: [{ level: 20, templateId: 'fighter-champion' }],
      }),
    });

    expect(readEncounterPartyShareParams(params)).toMatchObject({
      mode: 'custom',
      size: 5,
      level: 8,
    });
  });

  it('bounds captured and shared rosters before they reach budgeting or simulation', () => {
    const members = Array.from(
      { length: MAX_ENCOUNTER_PARTY_MEMBERS + 1 },
      (_, index) => ({
        name: `Hero ${index + 1}`,
        level: 3,
        templateId: 'fighter-champion',
      }),
    );
    const captured = snapshotForecastConfig({ version: 1, members });
    expect(captured.members).toHaveLength(MAX_ENCOUNTER_PARTY_MEMBERS);

    const atLimit = JSON.stringify({
      version: 1,
      members: members.slice(0, MAX_ENCOUNTER_PARTY_MEMBERS),
    });
    const overLimit = JSON.stringify({ version: 1, members });
    expect(parseAnonymousPartySnapshot(atLimit)?.members)
      .toHaveLength(MAX_ENCOUNTER_PARTY_MEMBERS);
    expect(parseAnonymousPartySnapshot(overLimit)).toBeNull();
  });

  it('round-trips active, custom, and shared contexts through JSON persistence', () => {
    const active = contextFromActiveParty(
      partyFixture(),
      ['member-aria', 'member-cinder'],
    );
    const custom = contextFromCustomParty({
      version: 1,
      members: [
        { name: 'One', level: 2, templateId: 'fighter-champion' },
        { name: 'Two', level: 8, templateId: 'wizard-evoker' },
      ],
    });
    const shared = contextFromSharedSnapshot(custom.snapshot);

    for (const context of [active, custom, shared]) {
      const parsed: unknown = JSON.parse(JSON.stringify(context));
      expect(isEncounterPartyContext(parsed)).toBe(true);
      const restored = cloneEncounterPartyContext(parsed as typeof context);
      expect(restored).toEqual(context);
      expect(contextToBudgetParty(restored).members.map((member) => member.level))
        .toEqual(context.snapshot.members.map((member) => member.level));
      expect(Object.isFrozen(restored.snapshot.members)).toBe(true);
    }
  });
});
