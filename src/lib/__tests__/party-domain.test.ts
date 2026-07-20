import { describe, expect, it } from 'vitest';
import {
  createPartyLibrary,
  isPartyLibrary,
  migratePartyLibraryDocument,
  movePartyMember,
  type PartyIdFactory,
  type PartyLibrary,
} from '@/lib/party';

function deterministicIds(): PartyIdFactory {
  const counts = { party: 0, member: 0 };
  return (kind) => `${kind}-${++counts[kind]}`;
}

function libraryFixture(): PartyLibrary {
  return createPartyLibrary(
    'Wayward Company',
    [
      { name: 'Aria', templateId: 'fighter-champion', level: 4 },
      { name: 'Bram', templateId: 'cleric-life', level: 5 },
      { name: 'Cyra', templateId: 'wizard-evoker', level: 6 },
    ],
    { now: 100, createId: deterministicIds() },
  );
}

describe('Party Library domain', () => {
  it('validates a complete current document and rejects broken identity or fields', () => {
    const valid = libraryFixture();
    expect(isPartyLibrary(valid)).toBe(true);

    expect(isPartyLibrary({
      ...valid,
      activePartyId: 'missing-party',
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      revision: -1,
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [valid.parties[0], { ...valid.parties[0] }],
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [{
        ...valid.parties[0],
        members: [
          valid.parties[0].members[0],
          { ...valid.parties[0].members[1], id: valid.parties[0].members[0].id },
        ],
      }],
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [{
        ...valid.parties[0],
        members: [{ ...valid.parties[0].members[0], level: 21 }],
      }],
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [{
        ...valid.parties[0],
        members: [{
          ...valid.parties[0].members[0],
          overrides: { saveBonuses: { dex: 2, con: Number.NaN, wis: 4 } },
        }],
      }],
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [{
        ...valid.parties[0],
        members: [{
          ...valid.parties[0].members[0],
          passivePerception: 12.5,
          overrides: { maxHp: -10, attacksPerRound: -3 },
        }],
      }],
    })).toBe(false);
    expect(isPartyLibrary({
      ...valid,
      parties: [{
        ...valid.parties[0],
        members: [{
          ...valid.parties[0].members[0],
          notes: 'x'.repeat(2_001),
        }],
      }],
    })).toBe(false);
  });

  it('keeps member identity attached to the same character when reordered', () => {
    const library = libraryFixture();
    const party = library.parties[0];
    const originalIdentity = Object.fromEntries(
      party.members.map((member) => [member.name, member.id]),
    );

    const moved = movePartyMember(party, originalIdentity.Cyra, 0, 200);

    expect(moved.members.map((member) => member.name)).toEqual(['Cyra', 'Aria', 'Bram']);
    expect(Object.fromEntries(moved.members.map((member) => [member.name, member.id])))
      .toEqual(originalIdentity);
    expect(moved.updatedAt).toBe(200);
    expect(party.members.map((member) => member.name)).toEqual(['Aria', 'Bram', 'Cyra']);
  });

  it('upgrades a valid version-zero document without sharing nested override state', () => {
    const current = libraryFixture();
    const versionZero = {
      version: 0,
      activePartyId: current.activePartyId,
      parties: current.parties.map(({ id, name, members }) => ({
        id,
        name,
        members: members.map((member, index) => index === 0
          ? { ...member, overrides: { saveBonuses: { dex: 3, con: 4, wis: 5 } } }
          : member),
      })),
    };

    const result = migratePartyLibraryDocument(versionZero, 500);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.library).toMatchObject({ version: 2, revision: 1 });
    expect(result.library.parties[0]).toMatchObject({ createdAt: 500, updatedAt: 500 });
    result.library.parties[0].members[0].overrides!.saveBonuses!.dex = 99;
    expect(versionZero.parties[0].members[0].overrides!.saveBonuses!.dex).toBe(3);
  });

  it('rejects future documents without modifying their contents', () => {
    const future = {
      ...libraryFixture(),
      version: 99,
      futureMetadata: { authoredBy: 'newer-app' },
    };
    const before = JSON.stringify(future);

    const result = migratePartyLibraryDocument(future);

    expect(result).toMatchObject({ ok: false, reason: 'future-version' });
    expect(JSON.stringify(future)).toBe(before);
  });

  it('returns an isolated snapshot when reading a valid current document', () => {
    const stored = libraryFixture();
    stored.parties[0].members[0].overrides = {
      ac: 18,
      saveBonuses: { dex: 3, con: 5, wis: 1 },
    };

    const result = migratePartyLibraryDocument(stored);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(false);
    result.library.parties[0].members[0].overrides!.saveBonuses!.con = 20;
    expect(stored.parties[0].members[0].overrides!.saveBonuses!.con).toBe(5);
  });

  it('upgrades a version-one library, preserving identity and incrementing its revision', () => {
    const current = libraryFixture();
    const versionOne = {
      ...current,
      version: 1,
      revision: 7,
    };

    const result = migratePartyLibraryDocument(versionOne, 900);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ migrated: true });
    expect(result.library).toMatchObject({ version: 2, revision: 8 });
    expect(result.library.activePartyId).toBe(current.activePartyId);
    expect(result.library.parties[0].members.map((member) => member.id))
      .toEqual(current.parties[0].members.map((member) => member.id));
  });

  it('allows an archived-only library but never allows an archived active party', () => {
    const library = libraryFixture();
    const archivedParty = {
      ...library.parties[0],
      updatedAt: 200,
      archivedAt: 200,
    };

    expect(isPartyLibrary({
      ...library,
      activePartyId: archivedParty.id,
      parties: [archivedParty],
    })).toBe(false);
    expect(isPartyLibrary({
      ...library,
      activePartyId: null,
      parties: [archivedParty],
    })).toBe(true);
  });
});
