import { describe, expect, it } from 'vitest';
import {
  mergePartyLibraries,
  parsePartyLibraryBackup,
  previewPartyLibraryImport,
  replacePartyLibrary,
  serializePartyLibrary,
} from '@/lib/party-backup';
import { archiveParty } from '@/lib/party-manager';
import { createPartyLibrary, type PartyIdFactory, type PartyLibrary } from '@/lib/party';

function deterministicIds(): PartyIdFactory {
  const counts = { party: 0, member: 0 };
  return (kind) => `${kind}-${++counts[kind]}`;
}

function currentLibrary(): PartyLibrary {
  return createPartyLibrary('Current', [
    { name: 'Aria', templateId: 'fighter-champion', level: 5 },
  ], { now: 10, createId: deterministicIds() });
}

function importedLibrary(): PartyLibrary {
  return {
    version: 2,
    revision: 4,
    activePartyId: 'party-1',
    parties: [
      {
        id: 'party-1',
        name: 'Imported A',
        createdAt: 20,
        updatedAt: 20,
        members: [
          {
            id: 'member-1',
            name: 'Bram',
            templateId: 'cleric-life',
            level: 6,
            overrides: { saveBonuses: { dex: 1, con: 4, wis: 7 } },
          },
          {
            id: 'remote-member',
            name: 'Cyra',
            templateId: 'wizard-evoker',
            level: 6,
          },
        ],
      },
      {
        id: 'remote-party',
        name: 'Imported B',
        createdAt: 30,
        updatedAt: 30,
        members: [{
          id: 'remote-member-2',
          name: 'Dara',
          templateId: 'rogue-thief',
          level: 6,
        }],
      },
    ],
  };
}

describe('Party Library backups', () => {
  it('serializes a validated document and parses an isolated round trip', () => {
    const current = currentLibrary();
    const json = serializePartyLibrary(current);
    const parsed = parsePartyLibraryBackup(json, 100);

    expect(json).toContain('\n  "version": 2');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed).toMatchObject({ migrated: false, warnings: [] });
    expect(parsed.library).toEqual(current);
    parsed.library.parties[0].name = 'Changed in preview';
    expect(current.parties[0].name).toBe('Current');
  });

  it('upgrades a version-one backup before previewing it', () => {
    const current = currentLibrary();
    const versionOne = JSON.stringify({ ...current, version: 1, revision: 6 });

    const parsed = parsePartyLibraryBackup(versionOne, 100);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.library).toMatchObject({ version: 2, revision: 7 });
    expect(parsed.migrated).toBe(true);
    expect(parsed.warnings).toHaveLength(1);
  });

  it('rejects malformed, invalid, and future backups without touching the current library', () => {
    const current = currentLibrary();
    const before = JSON.stringify(current);

    expect(parsePartyLibraryBackup('{')).toMatchObject({
      ok: false,
      reason: 'invalid-json',
    });
    expect(parsePartyLibraryBackup(JSON.stringify({
      ...current,
      activePartyId: 'missing',
    }))).toMatchObject({ ok: false, reason: 'invalid-document' });
    expect(parsePartyLibraryBackup(JSON.stringify({
      ...current,
      version: 99,
    }))).toMatchObject({ ok: false, reason: 'future-version' });
    expect(JSON.stringify(current)).toBe(before);
  });

  it('previews collision, archive, unknown-template, and blank-name warnings', () => {
    const current = currentLibrary();
    const imported = importedLibrary();
    imported.parties[0] = {
      ...imported.parties[0],
      updatedAt: 40,
      archivedAt: 40,
      members: [{
        ...imported.parties[0].members[0],
        name: '',
        templateId: 'missing-template',
      }],
    };
    imported.activePartyId = 'remote-party';

    const preview = previewPartyLibraryImport(current, imported);

    expect(preview).toMatchObject({
      parties: 2,
      members: 2,
      archivedParties: 1,
      collisions: { partyIds: ['party-1'], memberIds: ['member-1'] },
    });
    expect(preview.warnings).toHaveLength(3);
  });

  it('merges non-destructively, preserving noncolliding IDs and remapping only conflicts', () => {
    const current = currentLibrary();
    const imported = importedLibrary();

    const result = mergePartyLibraries(current, imported, { createId: deterministicIds() });

    expect(result.partyIdRemaps).toEqual([{ from: 'party-1', to: 'party-2' }]);
    expect(result.memberIdRemaps).toEqual([{ from: 'member-1', to: 'member-2' }]);
    expect(result.library.activePartyId).toBe(current.activePartyId);
    expect(result.library.parties.map((party) => party.id))
      .toEqual(['party-1', 'party-2', 'remote-party']);
    expect(result.library.parties.flatMap((party) => party.members.map((member) => member.id)))
      .toEqual(['member-1', 'member-2', 'remote-member', 'remote-member-2']);
    expect(new Set(result.library.parties.flatMap((party) => party.members.map((member) => member.id))).size)
      .toBe(4);
    result.library.parties[1].members[0].overrides!.saveBonuses!.wis = 99;
    expect(imported.parties[0].members[0].overrides!.saveBonuses!.wis).toBe(7);
  });

  it('uses the remapped imported active party when the current library has no live party', () => {
    const current = archiveParty(currentLibrary(), 'party-1', 20);
    const result = mergePartyLibraries(current, importedLibrary(), {
      createId: deterministicIds(),
    });

    expect(current.activePartyId).toBeNull();
    expect(result.library.activePartyId).toBe('party-2');
  });

  it('replaces the complete data set while leaving revision ownership to the repository', () => {
    const current = { ...currentLibrary(), revision: 9 };
    const imported = importedLibrary();

    const replaced = replacePartyLibrary(current, imported);

    expect(replaced.revision).toBe(9);
    expect(replaced.activePartyId).toBe(imported.activePartyId);
    expect(replaced.parties).toEqual(imported.parties);
    expect(replaced.parties).not.toBe(imported.parties);
    expect(current.parties[0].name).toBe('Current');
  });
});
