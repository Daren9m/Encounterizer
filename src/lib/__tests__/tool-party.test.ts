import { describe, expect, it } from 'vitest';
import type { PartyProfile } from '@/lib/party';
import {
  createActiveToolPartySetup,
  createCustomToolPartySetup,
  getToolPartyTokenIdentities,
  isToolPartySetup,
  MAX_CUSTOM_PARTY_MEMBERS,
  MAX_SCENE_PARTY_MEMBERS,
  migrateLegacyPartyScalars,
  readToolPartySetup,
  reconcileToolPartySetup,
  resolveToolPartySetup,
} from '@/lib/tool-party';

function party(
  id = 'party-lanterns',
  members: Array<{ id: string; name: string; level: number; templateId?: string }> = [
    { id: 'aria', name: 'Aria Stone', level: 2 },
    { id: 'bran', name: 'Bran', level: 5 },
    { id: 'cinder', name: 'Cinder Vale', level: 9 },
  ],
): PartyProfile {
  return {
    id,
    name: 'The Lanterns',
    createdAt: 1,
    updatedAt: 2,
    members: members.map((member) => ({
      ...member,
      templateId: member.templateId ?? 'fighter-champion',
    })),
  };
}

describe('tool party setup', () => {
  it('validates the versioned modes and their separate safety limits', () => {
    expect(isToolPartySetup(createCustomToolPartySetup(0, 20))).toBe(true);
    expect(isToolPartySetup({
      version: 1,
      mode: 'custom',
      size: MAX_CUSTOM_PARTY_MEMBERS + 1,
      level: 5,
    })).toBe(false);
    expect(isToolPartySetup({
      version: 1,
      mode: 'active',
      partyId: 'party',
      selectedMemberIds: ['a'],
      knownMemberIds: [],
    })).toBe(false);
    expect(MAX_SCENE_PARTY_MEMBERS).toBe(50);
    expect(MAX_CUSTOM_PARTY_MEMBERS).toBe(10);
  });

  it('migrates tolerant legacy scalars without allowing an unusable setup', () => {
    expect(migrateLegacyPartyScalars('7', 99)).toEqual({
      version: 1,
      mode: 'custom',
      size: 7,
      level: 20,
    });
    expect(readToolPartySetup({ partySize: 'bad', partyLevel: 0 }, {
      defaultCustomSize: 4,
      defaultCustomLevel: 5,
    })).toEqual({
      setup: { version: 1, mode: 'custom', size: 4, level: 1 },
      source: 'legacy-scalars',
      migrated: true,
    });
  });

  it('prefers a valid current setup and falls back to the active party', () => {
    const current = createCustomToolPartySetup(3, 12);
    const active = party();

    expect(readToolPartySetup(JSON.stringify(current), { activeParty: active }))
      .toMatchObject({ setup: current, source: 'current', migrated: false });
    expect(readToolPartySetup({ broken: true }, { activeParty: active }).setup)
      .toEqual(createActiveToolPartySetup(active));
    expect(readToolPartySetup({ version: 2, mode: 'custom', size: 9, level: 20 }, {
      activeParty: active,
    }).source).toBe('active-default');
  });

  it('keeps absences, drops stale IDs, follows roster order, and selects new members', () => {
    const original = party();
    const setup = createActiveToolPartySetup(original, ['cinder', 'aria']);
    const changed = party('party-lanterns', [
      { id: 'cinder', name: 'Cinder Vale', level: 9 },
      { id: 'aria', name: 'Aria Stone', level: 2 },
      { id: 'dove', name: 'Dove', level: 4 },
    ]);

    expect(reconcileToolPartySetup(setup, changed)).toEqual({
      version: 1,
      mode: 'active',
      partyId: 'party-lanterns',
      selectedMemberIds: ['cinder', 'aria', 'dove'],
      knownMemberIds: ['cinder', 'aria', 'dove'],
    });
  });

  it('preserves an intentionally empty attendance list while selecting only new members', () => {
    const original = party();
    const empty = createActiveToolPartySetup(original, []);
    const unchanged = reconcileToolPartySetup(empty, original);

    expect(unchanged.mode).toBe('active');
    if (unchanged.mode !== 'active') throw new Error('Expected active setup');
    expect(unchanged.selectedMemberIds).toEqual([]);

    const withNewMember = party('party-lanterns', [
      ...original.members,
      { id: 'dove', name: 'Dove', level: 4 },
    ]);
    const reconciled = reconcileToolPartySetup(empty, withNewMember);
    expect(reconciled.mode).toBe('active');
    if (reconciled.mode !== 'active') throw new Error('Expected active setup');
    expect(reconciled.selectedMemberIds).toEqual(['dove']);
  });

  it('treats a newly active party as a fresh all-attending roster', () => {
    const oldSetup = createActiveToolPartySetup(party(), []);
    const nextParty = party('party-ravens', [
      { id: 'rook', name: 'Rook', level: 3 },
      { id: 'wren', name: 'Wren', level: 6 },
    ]);

    expect(reconcileToolPartySetup(oldSetup, nextParty))
      .toEqual(createActiveToolPartySetup(nextParty));
  });

  it('caps active attendance at fifty while retaining an intentional selection', () => {
    const large = party('party-large', Array.from({ length: 60 }, (_, index) => ({
      id: `member-${index}`,
      name: `Member ${index}`,
      level: (index % 20) + 1,
    })));
    const setup = createActiveToolPartySetup(large);
    const resolution = resolveToolPartySetup(setup, large);

    expect(setup.selectedMemberIds).toHaveLength(MAX_SCENE_PARTY_MEMBERS);
    expect(resolution.partySize).toBe(MAX_SCENE_PARTY_MEMBERS);
    expect(resolution.selectedMemberIds.at(-1)).toBe('member-49');
  });

  it('resolves exact mixed-level attendance and a rounded mean', () => {
    const active = party();
    const setup = createActiveToolPartySetup(active, ['cinder', 'aria']);
    const resolution = resolveToolPartySetup(setup, active);

    expect(resolution.selectedMemberIds).toEqual(['aria', 'cinder']);
    expect(resolution.exactLevels).toEqual([2, 9]);
    expect(resolution.partySize).toBe(2);
    expect(resolution.partyLevel).toBe(6);
  });

  it('preserves custom level, including for a zero-token map setup', () => {
    const active = party();
    const resolution = resolveToolPartySetup(createCustomToolPartySetup(0, 13), active);

    expect(resolution).toMatchObject({
      mode: 'custom',
      partySize: 0,
      partyLevel: 13,
      exactLevels: [],
    });
  });

  it('creates stable local token identities and anonymous export identities', () => {
    const active = party();
    const resolution = resolveToolPartySetup(
      createActiveToolPartySetup(active, ['aria', 'cinder']),
      active,
    );

    expect(getToolPartyTokenIdentities(resolution)).toEqual([
      {
        id: 'party-aria',
        sourcePartyMemberId: 'aria',
        name: 'Aria Stone',
        label: 'AS',
      },
      {
        id: 'party-cinder',
        sourcePartyMemberId: 'cinder',
        name: 'Cinder Vale',
        label: 'CV',
      },
    ]);
    expect(getToolPartyTokenIdentities(resolution, { anonymous: true })).toEqual([
      { id: 'party-0', name: 'Party Member 1', label: '1' },
      { id: 'party-1', name: 'Party Member 2', label: '2' },
    ]);
  });
});
