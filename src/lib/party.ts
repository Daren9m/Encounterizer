// ─── Durable Party domain ───────────────────────────────────────
// The Party Library is authoritative game data. Tool-specific state (current
// HP, conditions, encounter attendance, and similar session details) must stay
// outside this document and be derived as snapshots through party-adapters.ts.

export const PARTY_LIBRARY_VERSION = 2 as const;

export interface PartySaveBonuses {
  dex: number;
  con: number;
  wis: number;
}

/** Forecast-facing values a DM explicitly customized for a character. */
export interface PartyCombatOverrides {
  ac?: number;
  maxHp?: number;
  attackBonus?: number;
  attacksPerRound?: number;
  avgDamagePerHit?: number;
  healingPerRound?: number;
  saveBonuses?: PartySaveBonuses;
  spellDc?: number;
  avgSpellDamagePerRound?: number;
}

export interface PartyMemberProfile {
  /** Stable across edits, reordering, encounters, and battle snapshots. */
  id: string;
  name: string;
  playerName?: string;
  level: number;
  templateId: string;
  classLabel?: string;
  overrides?: PartyCombatOverrides;
  initiativeBonus?: number;
  passivePerception?: number;
  notes?: string;
}

export interface PartyProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Present when the party is hidden from active tool flows but recoverable. */
  archivedAt?: number;
  members: PartyMemberProfile[];
}

export interface PartyLibrary {
  version: typeof PARTY_LIBRARY_VERSION;
  /** Monotonically increases after each committed library write. */
  revision: number;
  activePartyId: string | null;
  parties: PartyProfile[];
}

export interface PartySelection {
  partyId: string;
  memberIds: string[];
}

export type PartyIdKind = 'party' | 'member';
export type PartyIdFactory = (kind: PartyIdKind) => string;

export type NewPartyMember = Omit<PartyMemberProfile, 'id'> & { id?: string };

/** A genuinely new member never supplies durable identity. */
export type NewPartyMemberInput = Omit<PartyMemberProfile, 'id'>;

/** Existing roster rows carry identity; imports and newly-added rows do not. */
export type PartyMemberDraft = Omit<PartyMemberProfile, 'id'> & { id?: string };

export type PartyDocumentReadResult =
  | { ok: true; library: PartyLibrary; migrated: boolean }
  | { ok: false; reason: 'invalid' | 'future-version'; message: string };

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numberInRange(
  value: unknown,
  min: number,
  max: number,
  integer = false,
): value is number {
  return finite(value)
    && (!integer || Number.isInteger(value))
    && value >= min
    && value <= max;
}

function integerInRange(value: unknown, min: number, max: number): value is number {
  return numberInRange(value, min, max, true);
}

function nonEmptyText(value: unknown, maxLength = 200): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= maxLength;
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function optionalText(value: unknown, maxLength: number): value is string | undefined {
  return value === undefined || boundedText(value, maxLength);
}

export function isPartySaveBonuses(value: unknown): value is PartySaveBonuses {
  const candidate = record(value);
  return candidate !== null
    && integerInRange(candidate.dex, -50, 100)
    && integerInRange(candidate.con, -50, 100)
    && integerInRange(candidate.wis, -50, 100);
}

export function isPartyCombatOverrides(value: unknown): value is PartyCombatOverrides {
  const candidate = record(value);
  if (!candidate) return false;

  const optionalNumber = (
    key: keyof PartyCombatOverrides,
    min: number,
    max: number,
    integer = false,
  ) => candidate[key] === undefined || numberInRange(candidate[key], min, max, integer);

  return optionalNumber('ac', 1, 100, true)
    && optionalNumber('maxHp', 1, 1_000_000, true)
    && optionalNumber('attackBonus', -50, 100, true)
    && optionalNumber('attacksPerRound', 1, 100, true)
    && optionalNumber('avgDamagePerHit', 0, 1_000_000)
    && optionalNumber('healingPerRound', 0, 1_000_000)
    && optionalNumber('spellDc', 1, 100, true)
    && optionalNumber('avgSpellDamagePerRound', 0, 1_000_000)
    && (candidate.saveBonuses === undefined || isPartySaveBonuses(candidate.saveBonuses));
}

export function isPartyMemberProfile(value: unknown): value is PartyMemberProfile {
  const member = record(value);
  return member !== null
    && nonEmptyText(member.id, 200)
    // Legacy party setup allows a blank name; adapters supply a display fallback.
    && boundedText(member.name, 120)
    && integerInRange(member.level, 1, 20)
    && nonEmptyText(member.templateId, 120)
    && optionalText(member.playerName, 120)
    && optionalText(member.classLabel, 120)
    && optionalText(member.notes, 2_000)
    && (member.initiativeBonus === undefined
      || integerInRange(member.initiativeBonus, -30, 30))
    && (member.passivePerception === undefined
      || integerInRange(member.passivePerception, 0, 100))
    && (member.overrides === undefined || isPartyCombatOverrides(member.overrides));
}

export function isPartyProfile(value: unknown): value is PartyProfile {
  const party = record(value);
  if (!party
    || !nonEmptyText(party.id, 200)
    || !nonEmptyText(party.name, 120)
    || !integerInRange(party.createdAt, 0, Number.MAX_SAFE_INTEGER)
    || !integerInRange(party.updatedAt, party.createdAt, Number.MAX_SAFE_INTEGER)
    || (party.archivedAt !== undefined
      && !integerInRange(party.archivedAt, party.createdAt, party.updatedAt as number))
    || !Array.isArray(party.members)
    || !party.members.every(isPartyMemberProfile)
  ) return false;

  const memberIds = party.members.map((member) => member.id);
  return new Set(memberIds).size === memberIds.length;
}

export function isPartyLibrary(value: unknown): value is PartyLibrary {
  const library = record(value);
  if (!library
    || library.version !== PARTY_LIBRARY_VERSION
    || !integerInRange(library.revision, 0, Number.MAX_SAFE_INTEGER)
    || !(library.activePartyId === null || nonEmptyText(library.activePartyId, 200))
    || !Array.isArray(library.parties)
    || !library.parties.every(isPartyProfile)
  ) return false;

  const partyIds = library.parties.map((party) => party.id);
  if (new Set(partyIds).size !== partyIds.length) return false;

  const memberIds = library.parties.flatMap((party) => party.members.map((member) => member.id));
  if (new Set(memberIds).size !== memberIds.length) return false;

  const availablePartyIds = library.parties
    .filter((party) => party.archivedAt === undefined)
    .map((party) => party.id);
  return availablePartyIds.length === 0
    ? library.activePartyId === null
    : library.activePartyId !== null && availablePartyIds.includes(library.activePartyId);
}

function cloneOverrides(overrides: PartyCombatOverrides | undefined): PartyCombatOverrides | undefined {
  if (!overrides) return undefined;
  return {
    ...overrides,
    ...(overrides.saveBonuses ? { saveBonuses: { ...overrides.saveBonuses } } : {}),
  };
}

export function clonePartyLibrary(library: PartyLibrary): PartyLibrary {
  return {
    ...library,
    parties: library.parties.map((party) => ({
      ...party,
      members: party.members.map((member) => ({
        ...member,
        ...(member.overrides ? { overrides: cloneOverrides(member.overrides) } : {}),
      })),
    })),
  };
}

export function createPartyId(kind: PartyIdKind): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${suffix}`;
}

export function createPartyLibrary(
  partyName: string,
  members: readonly NewPartyMember[],
  options: { now?: number; createId?: PartyIdFactory } = {},
): PartyLibrary {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? createPartyId;
  const partyId = createId('party');
  const normalizedMembers = members.map((member, index): PartyMemberProfile => ({
    ...member,
    id: member.id || createId('member'),
    name: member.name,
    templateId: member.templateId.trim() || 'fighter-champion',
    level: Math.max(1, Math.min(20, Math.round(member.level))),
    ...(member.overrides ? { overrides: cloneOverrides(member.overrides) } : {}),
  }));

  return {
    version: PARTY_LIBRARY_VERSION,
    revision: 1,
    activePartyId: partyId,
    parties: [{
      id: partyId,
      name: partyName.trim() || 'Adventuring Party',
      createdAt: now,
      updatedAt: now,
      members: normalizedMembers,
    }],
  };
}

export function createEmptyPartyLibrary(): PartyLibrary {
  return {
    version: PARTY_LIBRARY_VERSION,
    revision: 0,
    activePartyId: null,
    parties: [],
  };
}

/** Move a member without regenerating any identity. */
export function movePartyMember(
  party: PartyProfile,
  memberId: string,
  destinationIndex: number,
  now = Date.now(),
): PartyProfile {
  const sourceIndex = party.members.findIndex((member) => member.id === memberId);
  if (sourceIndex < 0 || party.members.length < 2) return party;
  const targetIndex = Math.max(0, Math.min(party.members.length - 1, Math.round(destinationIndex)));
  if (sourceIndex === targetIndex) return party;

  const members = [...party.members];
  const [member] = members.splice(sourceIndex, 1);
  members.splice(targetIndex, 0, member);
  return { ...party, updatedAt: now, members };
}

export function getActiveParty(library: PartyLibrary): PartyProfile | null {
  if (!library.activePartyId) return null;
  return library.parties.find((party) => (
    party.id === library.activePartyId && party.archivedAt === undefined
  )) ?? null;
}

/** Selection keeps the party's display order; memberIds only controls attendance. */
export function getSelectedPartyMembers(
  party: PartyProfile,
  memberIds?: readonly string[],
): PartyMemberProfile[] {
  if (memberIds === undefined) return [...party.members];
  const selected = new Set(memberIds);
  return party.members.filter((member) => selected.has(member.id));
}

interface PartyProfileV0 {
  id: string;
  name: string;
  members: PartyMemberProfile[];
}

interface PartyLibraryV0 {
  version: 0;
  activePartyId: string | null;
  parties: PartyProfileV0[];
}

interface PartyProfileV1 {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  members: PartyMemberProfile[];
}

interface PartyLibraryV1 {
  version: 1;
  revision: number;
  activePartyId: string | null;
  parties: PartyProfileV1[];
}

function isPartyProfileV0(value: unknown): value is PartyProfileV0 {
  const party = record(value);
  if (!party
    || !nonEmptyText(party.id, 200)
    || !nonEmptyText(party.name, 120)
    || !Array.isArray(party.members)
    || !party.members.every(isPartyMemberProfile)
  ) return false;
  const ids = party.members.map((member) => member.id);
  return new Set(ids).size === ids.length;
}

function isPartyLibraryV0(value: unknown): value is PartyLibraryV0 {
  const library = record(value);
  if (!library
    || library.version !== 0
    || !(library.activePartyId === null || nonEmptyText(library.activePartyId, 200))
    || !Array.isArray(library.parties)
    || !library.parties.every(isPartyProfileV0)
  ) return false;
  const ids = library.parties.map((party) => party.id);
  if (new Set(ids).size !== ids.length) return false;
  return library.parties.length === 0
    ? library.activePartyId === null
    : library.activePartyId !== null && ids.includes(library.activePartyId);
}

function isPartyProfileV1(value: unknown): value is PartyProfileV1 {
  const party = record(value);
  if (!party || party.archivedAt !== undefined) return false;
  return isPartyProfile(party);
}

function isPartyLibraryV1(value: unknown): value is PartyLibraryV1 {
  const library = record(value);
  if (!library
    || library.version !== 1
    || !integerInRange(library.revision, 0, Number.MAX_SAFE_INTEGER)
    || !(library.activePartyId === null || nonEmptyText(library.activePartyId, 200))
    || !Array.isArray(library.parties)
    || !library.parties.every(isPartyProfileV1)
  ) return false;

  const partyIds = library.parties.map((party) => party.id);
  if (new Set(partyIds).size !== partyIds.length) return false;
  const memberIds = library.parties.flatMap((party) => party.members.map((member) => member.id));
  if (new Set(memberIds).size !== memberIds.length) return false;
  return library.parties.length === 0
    ? library.activePartyId === null
    : library.activePartyId !== null && partyIds.includes(library.activePartyId);
}

/**
 * Validate and upgrade a stored Party Library document. Unknown future
 * versions are rejected so callers can leave their bytes untouched.
 */
export function migratePartyLibraryDocument(
  value: unknown,
  now = Date.now(),
): PartyDocumentReadResult {
  const candidate = record(value);
  if (!candidate || !Number.isInteger(candidate.version)) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'The saved Party Library is not a recognized document and was left untouched.',
    };
  }

  if ((candidate.version as number) > PARTY_LIBRARY_VERSION) {
    return {
      ok: false,
      reason: 'future-version',
      message: 'This Party Library was created by a newer version of Encounterizer and was left untouched.',
    };
  }

  if (candidate.version === PARTY_LIBRARY_VERSION) {
    return isPartyLibrary(candidate)
      ? { ok: true, library: clonePartyLibrary(candidate), migrated: false }
      : {
          ok: false,
          reason: 'invalid',
          message: 'The saved Party Library has invalid fields and was left untouched.',
        };
  }

  if (candidate.version === 1 && isPartyLibraryV1(candidate)) {
    if (candidate.revision >= Number.MAX_SAFE_INTEGER) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'The saved Party Library revision cannot be upgraded safely and was left untouched.',
      };
    }
    const migrated: PartyLibrary = {
      version: PARTY_LIBRARY_VERSION,
      revision: candidate.revision + 1,
      activePartyId: candidate.activePartyId,
      parties: candidate.parties.map((party) => ({
        ...party,
        members: party.members.map((member) => ({
          ...member,
          ...(member.overrides ? { overrides: cloneOverrides(member.overrides) } : {}),
        })),
      })),
    };
    return isPartyLibrary(migrated)
      ? { ok: true, library: migrated, migrated: true }
      : {
          ok: false,
          reason: 'invalid',
          message: 'The saved Party Library could not be upgraded and was left untouched.',
        };
  }

  if (candidate.version === 0 && isPartyLibraryV0(candidate)) {
    const migrated: PartyLibrary = {
      version: PARTY_LIBRARY_VERSION,
      revision: 1,
      activePartyId: candidate.activePartyId,
      parties: candidate.parties.map((party) => ({
        ...party,
        createdAt: now,
        updatedAt: now,
        members: party.members.map((member) => ({
          ...member,
          ...(member.overrides ? { overrides: cloneOverrides(member.overrides) } : {}),
        })),
      })),
    };
    return isPartyLibrary(migrated)
      ? { ok: true, library: migrated, migrated: true }
      : {
          ok: false,
          reason: 'invalid',
          message: 'The saved Party Library could not be upgraded and was left untouched.',
        };
  }

  return {
    ok: false,
    reason: 'invalid',
    message: 'The saved Party Library uses an unsupported document version and was left untouched.',
  };
}
