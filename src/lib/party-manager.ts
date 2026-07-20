import { DEFAULT_PARTY_TEMPLATE_ROTATION } from '@/data/class-templates';
import {
  createPartyId,
  isPartyLibrary,
  isPartyMemberProfile,
  movePartyMember,
  type NewPartyMemberInput,
  type PartyIdFactory,
  type PartyIdKind,
  type PartyLibrary,
  type PartyMemberDraft,
  type PartyMemberProfile,
  type PartyProfile,
} from './party';

export type PartyDomainErrorCode =
  | 'invalid-library'
  | 'party-not-found'
  | 'party-archived'
  | 'party-not-archived'
  | 'member-not-found'
  | 'duplicate-member-id'
  | 'invalid-name'
  | 'invalid-level'
  | 'invalid-member-count'
  | 'invalid-position'
  | 'invalid-member'
  | 'id-allocation-failed';

export class PartyDomainError extends Error {
  constructor(
    public readonly code: PartyDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PartyDomainError';
  }
}

export interface PartyOperationOptions {
  now?: number;
  createId?: PartyIdFactory;
}

export interface CreatePartyInput {
  name: string;
  members: readonly NewPartyMemberInput[];
}

export const STARTER_MEMBER_COUNT_MIN = 1;
export const STARTER_MEMBER_COUNT_MAX = 10;

export interface StarterPartyMembersInput {
  memberCount: number;
  level: number;
}

function assertLibrary(library: PartyLibrary): void {
  if (!isPartyLibrary(library)) {
    throw new PartyDomainError('invalid-library', 'The Party Library is invalid and was not changed.');
  }
}

function checkedLibrary(library: PartyLibrary): PartyLibrary {
  assertLibrary(library);
  return library;
}

function checkedName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0 || normalized.length > 120) {
    throw new PartyDomainError(
      'invalid-name',
      'Party names must contain between 1 and 120 characters.',
    );
  }
  return normalized;
}

function checkedLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new PartyDomainError('invalid-level', 'Party member levels must be whole numbers from 1 to 20.');
  }
  return level;
}

/**
 * Materialize an editable quick-start roster without storing a second party-size value.
 * Suggested class estimates match the encounter defaults and remain immediately editable.
 */
export function buildStarterPartyMembers({
  memberCount,
  level,
}: StarterPartyMembersInput): NewPartyMemberInput[] {
  if (
    !Number.isInteger(memberCount)
    || memberCount < STARTER_MEMBER_COUNT_MIN
    || memberCount > STARTER_MEMBER_COUNT_MAX
  ) {
    throw new PartyDomainError(
      'invalid-member-count',
      `Starter party size must be a whole number from ${STARTER_MEMBER_COUNT_MIN} to ${STARTER_MEMBER_COUNT_MAX}.`,
    );
  }

  const normalizedLevel = checkedLevel(level);
  return Array.from({ length: memberCount }, (_, index) => ({
    name: `Hero ${index + 1}`,
    templateId: DEFAULT_PARTY_TEMPLATE_ROTATION[index % DEFAULT_PARTY_TEMPLATE_ROTATION.length],
    level: normalizedLevel,
  }));
}

function operationTime(now: number | undefined, party?: PartyProfile): number {
  const candidate = now ?? Date.now();
  if (!Number.isSafeInteger(candidate) || candidate < 0) {
    throw new PartyDomainError('invalid-library', 'The Party Library timestamp is invalid.');
  }
  return party ? Math.max(candidate, party.updatedAt, party.createdAt) : candidate;
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
    `A unique ${kind === 'party' ? 'party' : 'party member'} ID could not be generated.`,
  );
}

function partyIds(library: PartyLibrary): Set<string> {
  return new Set(library.parties.map((party) => party.id));
}

function memberIds(library: PartyLibrary): Set<string> {
  return new Set(library.parties.flatMap((party) => party.members.map((member) => member.id)));
}

function cloneMember(member: PartyMemberProfile): PartyMemberProfile {
  return {
    ...member,
    ...(member.overrides ? {
      overrides: {
        ...member.overrides,
        ...(member.overrides.saveBonuses
          ? { saveBonuses: { ...member.overrides.saveBonuses } }
          : {}),
      },
    } : {}),
  };
}

function buildMember(input: NewPartyMemberInput, id: string): PartyMemberProfile {
  const member = cloneMember({ ...input, id });
  if (!isPartyMemberProfile(member)) {
    throw new PartyDomainError('invalid-member', 'A party member contains invalid fields.');
  }
  return member;
}

function findParty(library: PartyLibrary, partyId: string): PartyProfile {
  const party = library.parties.find((candidate) => candidate.id === partyId);
  if (!party) {
    throw new PartyDomainError('party-not-found', 'That party no longer exists.');
  }
  return party;
}

function assertEditable(party: PartyProfile): void {
  if (party.archivedAt !== undefined) {
    throw new PartyDomainError('party-archived', 'Restore this party before editing it.');
  }
}

function replaceParty(
  library: PartyLibrary,
  partyId: string,
  replacement: PartyProfile,
): PartyLibrary {
  return checkedLibrary({
    ...library,
    parties: library.parties.map((party) => party.id === partyId ? replacement : party),
  });
}

export function createParty(
  library: PartyLibrary,
  input: CreatePartyInput,
  options: PartyOperationOptions = {},
): PartyLibrary {
  assertLibrary(library);
  const now = operationTime(options.now);
  const createId = options.createId ?? createPartyId;
  const reservedPartyIds = partyIds(library);
  const reservedMemberIds = memberIds(library);
  const id = allocateId('party', reservedPartyIds, createId);
  const members = input.members.map((member) => buildMember(
    member,
    allocateId('member', reservedMemberIds, createId),
  ));
  const party: PartyProfile = {
    id,
    name: checkedName(input.name),
    createdAt: now,
    updatedAt: now,
    members,
  };
  return checkedLibrary({
    ...library,
    activePartyId: id,
    parties: [...library.parties, party],
  });
}

export function renameParty(
  library: PartyLibrary,
  partyId: string,
  name: string,
  now?: number,
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  const normalized = checkedName(name);
  if (party.name === normalized) return library;
  return replaceParty(library, partyId, {
    ...party,
    name: normalized,
    updatedAt: operationTime(now, party),
  });
}

export function setActiveParty(library: PartyLibrary, partyId: string): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  assertEditable(party);
  return library.activePartyId === partyId ? library : checkedLibrary({
    ...library,
    activePartyId: partyId,
  });
}

function copyName(library: PartyLibrary, sourceName: string): string {
  const names = new Set(library.parties.map((party) => party.name.toLocaleLowerCase()));
  for (let index = 1; index <= 10_000; index += 1) {
    const suffix = index === 1 ? ' copy' : ` copy ${index}`;
    const stem = sourceName.slice(0, 120 - suffix.length).trimEnd();
    const candidate = `${stem}${suffix}`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
  throw new PartyDomainError('invalid-name', 'A unique name for the party copy could not be created.');
}

export function duplicateParty(
  library: PartyLibrary,
  partyId: string,
  options: PartyOperationOptions & { name?: string } = {},
): PartyLibrary {
  assertLibrary(library);
  const source = findParty(library, partyId);
  const now = operationTime(options.now);
  const createId = options.createId ?? createPartyId;
  const reservedPartyIds = partyIds(library);
  const reservedMemberIds = memberIds(library);
  const id = allocateId('party', reservedPartyIds, createId);
  const members = source.members.map((member) => ({
    ...cloneMember(member),
    id: allocateId('member', reservedMemberIds, createId),
  }));
  const duplicate: PartyProfile = {
    id,
    name: options.name === undefined ? copyName(library, source.name) : checkedName(options.name),
    createdAt: now,
    updatedAt: now,
    members,
  };
  return checkedLibrary({
    ...library,
    activePartyId: id,
    parties: [...library.parties, duplicate],
  });
}

export function archiveParty(
  library: PartyLibrary,
  partyId: string,
  now?: number,
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  if (party.archivedAt !== undefined) return library;
  const archivedAt = operationTime(now, party);
  const index = library.parties.findIndex((candidate) => candidate.id === partyId);
  let activePartyId = library.activePartyId;
  if (activePartyId === partyId) {
    const next = library.parties.slice(index + 1)
      .find((candidate) => candidate.archivedAt === undefined);
    const previous = [...library.parties.slice(0, index)].reverse()
      .find((candidate) => candidate.archivedAt === undefined);
    activePartyId = next?.id ?? previous?.id ?? null;
  }
  return checkedLibrary({
    ...library,
    activePartyId,
    parties: library.parties.map((candidate) => candidate.id === partyId
      ? { ...candidate, archivedAt, updatedAt: archivedAt }
      : candidate),
  });
}

export function restoreParty(
  library: PartyLibrary,
  partyId: string,
  now?: number,
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  if (party.archivedAt === undefined) return library;
  const updatedAt = operationTime(now, party);
  const { archivedAt: _archivedAt, ...restored } = party;
  return replaceParty(
    { ...library, activePartyId: library.activePartyId ?? partyId },
    partyId,
    { ...restored, updatedAt },
  );
}

export function deleteArchivedParty(library: PartyLibrary, partyId: string): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  if (party.archivedAt === undefined) {
    throw new PartyDomainError(
      'party-not-archived',
      'Archive this party before permanently deleting it.',
    );
  }
  return checkedLibrary({
    ...library,
    parties: library.parties.filter((candidate) => candidate.id !== partyId),
  });
}

export function reorderPartyMember(
  library: PartyLibrary,
  partyId: string,
  memberId: string,
  destinationIndex: number,
  now?: number,
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  assertEditable(party);
  if (!Number.isFinite(destinationIndex)) {
    throw new PartyDomainError('invalid-position', 'The roster position must be a finite number.');
  }
  if (!party.members.some((member) => member.id === memberId)) {
    throw new PartyDomainError('member-not-found', 'That party member no longer exists.');
  }
  const moved = movePartyMember(party, memberId, destinationIndex, operationTime(now, party));
  return moved === party ? library : replaceParty(library, partyId, moved);
}

export function setAllPartyMemberLevels(
  library: PartyLibrary,
  partyId: string,
  level: number,
  now?: number,
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  assertEditable(party);
  const normalized = checkedLevel(level);
  if (party.members.every((member) => member.level === normalized)) return library;
  return replaceParty(library, partyId, {
    ...party,
    updatedAt: operationTime(now, party),
    members: party.members.map((member) => ({ ...member, level: normalized })),
  });
}

export function replacePartyMembers(
  library: PartyLibrary,
  partyId: string,
  drafts: readonly PartyMemberDraft[],
  options: PartyOperationOptions = {},
): PartyLibrary {
  assertLibrary(library);
  const party = findParty(library, partyId);
  assertEditable(party);
  const createId = options.createId ?? createPartyId;
  const currentIds = new Set(party.members.map((member) => member.id));
  const seenDraftIds = new Set<string>();
  const reserved = memberIds(library);
  const members = drafts.map((draft) => {
    if (draft.id && seenDraftIds.has(draft.id)) {
      throw new PartyDomainError('duplicate-member-id', 'A member appears more than once in the party draft.');
    }
    if (draft.id) seenDraftIds.add(draft.id);
    const id = draft.id && currentIds.has(draft.id)
      ? draft.id
      : allocateId('member', reserved, createId);
    const { id: _draftId, ...input } = draft;
    return buildMember(input, id);
  });
  return replaceParty(library, partyId, {
    ...party,
    updatedAt: operationTime(options.now, party),
    members,
  });
}
