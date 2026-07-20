import { CLASS_TEMPLATES } from '@/data/class-templates';
import {
  clonePartyLibrary,
  createPartyId,
  isPartyLibrary,
  migratePartyLibraryDocument,
  type PartyIdFactory,
  type PartyIdKind,
  type PartyLibrary,
} from './party';
import { PartyDomainError } from './party-manager';

export type PartyImportMode = 'merge' | 'replace';

export type PartyBackupParseResult =
  | {
      ok: true;
      library: PartyLibrary;
      migrated: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'invalid-json' | 'invalid-document' | 'future-version';
      error: string;
    };

export interface PartyImportPreview {
  parties: number;
  members: number;
  archivedParties: number;
  collisions: {
    partyIds: string[];
    memberIds: string[];
  };
  warnings: string[];
}

export interface PartyIdRemap {
  from: string;
  to: string;
}

export interface PartyLibraryMergeResult {
  library: PartyLibrary;
  partyIdRemaps: PartyIdRemap[];
  memberIdRemaps: PartyIdRemap[];
}

function assertLibrary(library: PartyLibrary): void {
  if (!isPartyLibrary(library)) {
    throw new PartyDomainError('invalid-library', 'The Party Library backup is invalid.');
  }
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function allocateId(
  kind: PartyIdKind,
  reserved: Set<string>,
  createId: PartyIdFactory,
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = createId(kind);
    if (validId(candidate) && !reserved.has(candidate)) {
      reserved.add(candidate);
      return candidate;
    }
  }
  throw new PartyDomainError(
    'id-allocation-failed',
    `A unique imported ${kind === 'party' ? 'party' : 'party member'} ID could not be generated.`,
  );
}

export function serializePartyLibrary(library: PartyLibrary): string {
  assertLibrary(library);
  return JSON.stringify(clonePartyLibrary(library), null, 2);
}

export function parsePartyLibraryBackup(
  json: string,
  now = Date.now(),
): PartyBackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      error: 'That backup is not valid JSON.',
    };
  }

  const result = migratePartyLibraryDocument(parsed, now);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'future-version' ? 'future-version' : 'invalid-document',
      error: result.message,
    };
  }
  return {
    ok: true,
    library: result.library,
    migrated: result.migrated,
    warnings: result.migrated
      ? ['This backup uses an older Party Library format and will be upgraded when saved.']
      : [],
  };
}

export function previewPartyLibraryImport(
  current: PartyLibrary,
  imported: PartyLibrary,
): PartyImportPreview {
  assertLibrary(current);
  assertLibrary(imported);
  const currentPartyIds = new Set(current.parties.map((party) => party.id));
  const currentMemberIds = new Set(
    current.parties.flatMap((party) => party.members.map((member) => member.id)),
  );
  const partyIdCollisions = imported.parties
    .map((party) => party.id)
    .filter((id) => currentPartyIds.has(id));
  const memberIdCollisions = imported.parties
    .flatMap((party) => party.members.map((member) => member.id))
    .filter((id) => currentMemberIds.has(id));
  const knownTemplates = new Set(CLASS_TEMPLATES.map((template) => template.id));
  const unknownTemplates = imported.parties.flatMap((party) => party.members)
    .filter((member) => !knownTemplates.has(member.templateId));
  const blankNames = imported.parties.flatMap((party) => party.members)
    .filter((member) => member.name.trim().length === 0);
  const warnings: string[] = [];
  if (partyIdCollisions.length > 0 || memberIdCollisions.length > 0) {
    warnings.push(
      `${partyIdCollisions.length + memberIdCollisions.length} colliding ID${partyIdCollisions.length + memberIdCollisions.length === 1 ? '' : 's'} will be reassigned during merge.`,
    );
  }
  if (unknownTemplates.length > 0) {
    warnings.push(
      `${unknownTemplates.length} member${unknownTemplates.length === 1 ? '' : 's'} use an unavailable class template and will use the default combat profile until edited.`,
    );
  }
  if (blankNames.length > 0) {
    warnings.push(
      `${blankNames.length} member${blankNames.length === 1 ? ' has' : 's have'} a blank name and will use a roster fallback label.`,
    );
  }
  return {
    parties: imported.parties.length,
    members: imported.parties.reduce((total, party) => total + party.members.length, 0),
    archivedParties: imported.parties.filter((party) => party.archivedAt !== undefined).length,
    collisions: {
      partyIds: partyIdCollisions,
      memberIds: memberIdCollisions,
    },
    warnings,
  };
}

export function mergePartyLibraries(
  current: PartyLibrary,
  imported: PartyLibrary,
  options: { createId?: PartyIdFactory } = {},
): PartyLibraryMergeResult {
  assertLibrary(current);
  assertLibrary(imported);
  const createId = options.createId ?? createPartyId;
  const currentPartyIds = new Set(current.parties.map((party) => party.id));
  const currentMemberIds = new Set(
    current.parties.flatMap((party) => party.members.map((member) => member.id)),
  );
  const reservedPartyIds = new Set([
    ...currentPartyIds,
    ...imported.parties.map((party) => party.id),
  ]);
  const reservedMemberIds = new Set([
    ...currentMemberIds,
    ...imported.parties.flatMap((party) => party.members.map((member) => member.id)),
  ]);
  const partyIdMap = new Map<string, string>();
  const partyIdRemaps: PartyIdRemap[] = [];
  const memberIdRemaps: PartyIdRemap[] = [];

  const importedParties = imported.parties.map((party) => {
    const id = currentPartyIds.has(party.id)
      ? allocateId('party', reservedPartyIds, createId)
      : party.id;
    partyIdMap.set(party.id, id);
    if (id !== party.id) partyIdRemaps.push({ from: party.id, to: id });
    return {
      ...party,
      id,
      members: party.members.map((member) => {
        const memberId = currentMemberIds.has(member.id)
          ? allocateId('member', reservedMemberIds, createId)
          : member.id;
        if (memberId !== member.id) memberIdRemaps.push({ from: member.id, to: memberId });
        return {
          ...member,
          id: memberId,
          ...(member.overrides ? {
            overrides: {
              ...member.overrides,
              ...(member.overrides.saveBonuses
                ? { saveBonuses: { ...member.overrides.saveBonuses } }
                : {}),
            },
          } : {}),
        };
      }),
    };
  });
  const library: PartyLibrary = {
    ...current,
    activePartyId: current.activePartyId
      ?? (imported.activePartyId ? partyIdMap.get(imported.activePartyId) ?? null : null),
    parties: [...current.parties, ...importedParties],
  };
  assertLibrary(library);
  return { library, partyIdRemaps, memberIdRemaps };
}

export function replacePartyLibrary(
  current: PartyLibrary,
  imported: PartyLibrary,
): PartyLibrary {
  assertLibrary(current);
  assertLibrary(imported);
  const replacement = {
    ...clonePartyLibrary(imported),
    revision: current.revision,
  };
  assertLibrary(replacement);
  return replacement;
}
