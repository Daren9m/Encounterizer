import { describe, expect, it } from 'vitest';
import { DEFAULT_PARTY_TEMPLATE_ROTATION } from '@/data/class-templates';
import {
  archiveParty,
  buildStarterPartyMembers,
  createParty,
  deleteArchivedParty,
  duplicateParty,
  PartyDomainError,
  renameParty,
  reorderPartyMember,
  replacePartyMembers,
  restoreParty,
  setActiveParty,
  setAllPartyMemberLevels,
} from '@/lib/party-manager';
import { createPartyLibrary, type PartyIdFactory, type PartyLibrary } from '@/lib/party';

function deterministicIds(): PartyIdFactory {
  const counts = { party: 0, member: 0 };
  return (kind) => `${kind}-${++counts[kind]}`;
}

function libraryFixture(createId: PartyIdFactory = deterministicIds()): PartyLibrary {
  return createPartyLibrary('Wayward Company', [
    {
      name: 'Aria',
      playerName: 'Dana',
      templateId: 'fighter-champion',
      classLabel: 'Champion',
      level: 4,
      passivePerception: 14,
      notes: 'Carries the key.',
      overrides: { ac: 19, saveBonuses: { dex: 2, con: 5, wis: 1 } },
    },
    { name: 'Bram', templateId: 'cleric-life', level: 5 },
    { name: 'Cyra', templateId: 'wizard-evoker', level: 6 },
  ], { now: 10, createId });
}

describe('Party Manager domain operations', () => {
  it.each([1, 4, 6, 10])('builds an editable quick roster for %i characters', (memberCount) => {
    const members = buildStarterPartyMembers({ memberCount, level: 7 });

    expect(members).toHaveLength(memberCount);
    expect(members.map((member) => member.name))
      .toEqual(Array.from({ length: memberCount }, (_, index) => `Hero ${index + 1}`));
    expect(members.every((member) => member.level === 7)).toBe(true);
    expect(members.map((member) => member.templateId)).toEqual(
      Array.from(
        { length: memberCount },
        (_, index) => DEFAULT_PARTY_TEMPLATE_ROTATION[index % DEFAULT_PARTY_TEMPLATE_ROTATION.length],
      ),
    );
  });

  it('materializes party size in the roster instead of storing a second count', () => {
    const base = libraryFixture();
    const members = buildStarterPartyMembers({ memberCount: 6, level: 7 });
    const created = createParty(base, { name: 'Six Seats', members }, {
      now: 20,
      createId: deterministicIds(),
    });
    const party = created.parties[1];

    expect(party.members).toHaveLength(6);
    expect(new Set(party.members.map((member) => member.id)).size).toBe(6);
    expect(party).not.toHaveProperty('memberCount');
    expect(base.parties).toHaveLength(1);
  });

  it('rejects invalid quick-roster counts and levels', () => {
    for (const memberCount of [0, 11, 2.5, Number.NaN]) {
      expect(() => buildStarterPartyMembers({ memberCount, level: 3 }))
        .toThrow(PartyDomainError);
    }
    for (const level of [0, 21, 3.5]) {
      expect(() => buildStarterPartyMembers({ memberCount: 4, level }))
        .toThrow(PartyDomainError);
    }
  });

  it('creates and duplicates parties with globally unique, deeply isolated identities', () => {
    const base = libraryFixture();
    const created = createParty(base, {
      name: '  Lantern Guard  ',
      members: [{ name: 'Dara', templateId: 'rogue-thief', level: 4 }],
    }, { now: 20, createId: deterministicIds() });

    expect(created.activePartyId).toBe('party-2');
    expect(created.parties[1]).toMatchObject({
      id: 'party-2',
      name: 'Lantern Guard',
      createdAt: 20,
      updatedAt: 20,
      members: [{ id: 'member-4', name: 'Dara' }],
    });

    const duplicated = duplicateParty(created, base.parties[0].id, {
      now: 30,
      createId: deterministicIds(),
    });
    const copy = duplicated.parties[2];
    expect(copy).toMatchObject({ id: 'party-3', name: 'Wayward Company copy' });
    expect(copy.members.map((member) => member.id)).toEqual(['member-5', 'member-6', 'member-7']);
    expect(copy.members.map((member) => member.name)).toEqual(['Aria', 'Bram', 'Cyra']);
    expect(copy.members[0].overrides).not.toBe(base.parties[0].members[0].overrides);
    expect(copy.members[0].overrides?.saveBonuses)
      .not.toBe(base.parties[0].members[0].overrides?.saveBonuses);
    expect(new Set(duplicated.parties.flatMap((party) => party.members.map((member) => member.id))).size)
      .toBe(7);
    expect(base.parties).toHaveLength(1);
  });

  it('renames and activates parties without changing durable roster identity', () => {
    const ids = deterministicIds();
    const base = libraryFixture(ids);
    const withSecond = createParty(base, {
      name: 'Second',
      members: [],
    }, { now: 20, createId: ids });
    const firstId = base.parties[0].id;
    const renamed = renameParty(withSecond, firstId, '  Night Watch  ', 30);
    const activated = setActiveParty(renamed, firstId);

    expect(renamed.parties[0].name).toBe('Night Watch');
    expect(renamed.parties[0].members.map((member) => member.id))
      .toEqual(base.parties[0].members.map((member) => member.id));
    expect(activated.activePartyId).toBe(firstId);
    expect(() => renameParty(activated, firstId, '   ')).toThrow(PartyDomainError);
  });

  it('archives every party recoverably, restores one as active, and only deletes archived parties', () => {
    const ids = deterministicIds();
    const first = libraryFixture(ids);
    const second = createParty(first, { name: 'Second', members: [] }, { now: 20, createId: ids });
    const third = createParty(second, { name: 'Third', members: [] }, { now: 30, createId: ids });
    const [firstId, secondId, thirdId] = third.parties.map((party) => party.id);

    const firstActive = setActiveParty(third, firstId);
    const firstArchived = archiveParty(firstActive, firstId, 40);
    expect(firstArchived.activePartyId).toBe(secondId);
    const secondArchived = archiveParty(firstArchived, secondId, 50);
    expect(secondArchived.activePartyId).toBe(thirdId);
    const archivedOnly = archiveParty(secondArchived, thirdId, 60);
    expect(archivedOnly.activePartyId).toBeNull();
    expect(archivedOnly.parties.every((party) => party.archivedAt !== undefined)).toBe(true);

    const restoredSecond = restoreParty(archivedOnly, secondId, 70);
    expect(restoredSecond.activePartyId).toBe(secondId);
    expect(restoredSecond.parties[1].archivedAt).toBeUndefined();
    const restoredFirst = restoreParty(restoredSecond, firstId, 80);
    expect(restoredFirst.activePartyId).toBe(secondId);
    expect(() => deleteArchivedParty(restoredFirst, firstId)).toThrow(PartyDomainError);
    const deletedThird = deleteArchivedParty(restoredFirst, thirdId);
    expect(deletedThird.parties.map((party) => party.id)).toEqual([firstId, secondId]);
  });

  it('reorders by stable identity and sets every level without losing individual overrides', () => {
    const library = libraryFixture();
    const party = library.parties[0];
    const [aria, bram, cyra] = party.members;
    const reordered = reorderPartyMember(library, party.id, cyra.id, 0, 20);
    expect(reordered.parties[0].members.map((member) => member.id))
      .toEqual([cyra.id, aria.id, bram.id]);

    const leveled = setAllPartyMemberLevels(reordered, party.id, 9, 30);
    expect(leveled.parties[0].members.every((member) => member.level === 9)).toBe(true);
    const leveledAria = leveled.parties[0].members.find((member) => member.id === aria.id);
    expect(leveledAria).toMatchObject({
      playerName: 'Dana',
      classLabel: 'Champion',
      passivePerception: 14,
      notes: 'Carries the key.',
      overrides: { ac: 19, saveBonuses: { dex: 2, con: 5, wis: 1 } },
    });
    expect(library.parties[0].members.map((member) => member.level)).toEqual([4, 5, 6]);
    expect(() => setAllPartyMemberLevels(leveled, party.id, 20.5)).toThrow(PartyDomainError);
    expect(() => reorderPartyMember(leveled, party.id, aria.id, Number.NaN))
      .toThrow(PartyDomainError);
  });

  it('replaces a roster while preserving owned IDs and remapping imported or foreign IDs', () => {
    const ids = deterministicIds();
    const base = libraryFixture(ids);
    const withSecond = createParty(base, {
      name: 'Second',
      members: [{ name: 'Ezra', templateId: 'bard-lore', level: 5 }],
    }, { now: 20, createId: ids });
    const firstParty = withSecond.parties[0];
    const preservedId = firstParty.members[1].id;
    const foreignId = withSecond.parties[1].members[0].id;

    const replaced = replacePartyMembers(withSecond, firstParty.id, [
      { ...firstParty.members[1], name: 'Bram Updated' },
      { id: foreignId, name: 'Imported', templateId: 'rogue-thief', level: 7 },
      { name: 'New', templateId: 'wizard-evoker', level: 7 },
    ], { now: 30, createId: deterministicIds() });

    expect(replaced.parties[0].members.map((member) => member.id))
      .toEqual([preservedId, 'member-5', 'member-6']);
    expect(replaced.parties[0].members.map((member) => member.name))
      .toEqual(['Bram Updated', 'Imported', 'New']);
    expect(new Set(replaced.parties.flatMap((party) => party.members.map((member) => member.id))).size)
      .toBe(4);
    expect(() => replacePartyMembers(withSecond, firstParty.id, [
      firstParty.members[0],
      firstParty.members[0],
    ])).toThrow(PartyDomainError);

    const archived = archiveParty(withSecond, firstParty.id, 40);
    expect(() => replacePartyMembers(archived, firstParty.id, [])).toThrow(PartyDomainError);
  });
});
