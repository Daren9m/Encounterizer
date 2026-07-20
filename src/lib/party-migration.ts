import { defaultPartyConfig } from '@/data/class-templates';
import type { PartyMemberConfig } from './battle-sim-types';
import { storageKey } from './storage';
import {
  createEmptyPartyLibrary,
  createPartyId,
  createPartyLibrary,
  getActiveParty,
  isPartyCombatOverrides,
  type NewPartyMember,
  type PartyCombatOverrides,
  type PartyIdFactory,
  type PartyLibrary,
} from './party';

export const LEGACY_PARTY_KEYS = {
  partyConfig: 'partyConfig',
  encounterSettings: 'encounterSettings',
  noncombatPartySize: 'noncombatPartySize',
  noncombatPartyLevel: 'noncombatPartyLevel',
} as const;

export interface LegacyPartyData {
  partyConfig?: unknown;
  /** True when the key existed but could not be parsed as JSON. */
  partyConfigCorrupt?: boolean;
  encounterSettings?: unknown;
  noncombatPartySize?: unknown;
  noncombatPartyLevel?: unknown;
}

export type LegacyPartyReadResult =
  | { ok: true; data: LegacyPartyData }
  | { ok: false; message: string };

export type LegacyPartyMigrationResult =
  | {
      ok: true;
      library: PartyLibrary;
      source: 'party-config' | 'encounter-settings' | 'noncombat-settings' | 'empty';
    }
  | { ok: false; message: string };

interface LegacyPartyMember {
  name: string;
  templateId: string;
  level: number;
  overrides?: PartyCombatOverrides;
  initiativeBonus?: number;
}

interface LegacyPartyConfig {
  version: 1;
  members: LegacyPartyMember[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function boundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= min
    && value <= max;
}

function isLegacyPartyMember(value: unknown): value is LegacyPartyMember {
  const member = record(value);
  return member !== null
    && typeof member.name === 'string'
    && member.name.length <= 120
    && typeof member.templateId === 'string'
    && member.templateId.trim().length > 0
    && member.templateId.length <= 120
    && boundedInteger(member.level, 1, 20)
    && (member.initiativeBonus === undefined
      || boundedInteger(member.initiativeBonus, -30, 30))
    && (member.overrides === undefined || isPartyCombatOverrides(member.overrides));
}

function inspectLegacyPartyConfig(value: unknown):
  | { kind: 'absent' }
  | { kind: 'valid'; config: LegacyPartyConfig }
  | { kind: 'invalid' } {
  if (value === undefined || value === null) return { kind: 'absent' };
  const candidate = record(value);
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.members)) {
    return { kind: 'invalid' };
  }
  if (candidate.members.length === 0) return { kind: 'absent' };
  if (!candidate.members.every(isLegacyPartyMember)) return { kind: 'invalid' };
  return { kind: 'valid', config: candidate as unknown as LegacyPartyConfig };
}

function scalarParty(
  settings: unknown,
  sizeMax: number,
): { size: number; level: number } | null {
  const candidate = record(settings);
  if (!candidate
    || !boundedInteger(candidate.partySize, 1, sizeMax)
    || !boundedInteger(candidate.partyLevel, 1, 20)
  ) return null;
  return { size: candidate.partySize, level: candidate.partyLevel };
}

function noncombatParty(data: LegacyPartyData): { size: number; level: number } | null {
  return boundedInteger(data.noncombatPartySize, 1, 8)
    && boundedInteger(data.noncombatPartyLevel, 1, 20)
    ? { size: data.noncombatPartySize, level: data.noncombatPartyLevel }
    : null;
}

function defaultMembers(size: number, level: number): NewPartyMember[] {
  return defaultPartyConfig(size, level).map((member) => ({
    name: member.name,
    templateId: member.templateId,
    level: member.level,
    ...(member.overrides ? { overrides: member.overrides } : {}),
  }));
}

/**
 * Convert the old localStorage sources without touching them. A malformed,
 * non-empty detailed roster blocks scalar fallback so recoverable character
 * data is never silently replaced by generic members.
 */
export function migrateLegacyPartyData(
  data: LegacyPartyData,
  options: { now?: number; createId?: PartyIdFactory } = {},
): LegacyPartyMigrationResult {
  if (data.partyConfigCorrupt) {
    return {
      ok: false,
      message: 'The existing detailed party is corrupt. It was left untouched instead of being replaced with generic party settings.',
    };
  }

  const detailed = inspectLegacyPartyConfig(data.partyConfig);
  if (detailed.kind === 'invalid') {
    return {
      ok: false,
      message: 'The existing detailed party has invalid fields. It was left untouched instead of being replaced with generic party settings.',
    };
  }
  if (detailed.kind === 'valid') {
    const members = detailed.config.members.map((member): NewPartyMember => ({
      name: member.name,
      templateId: member.templateId,
      level: member.level,
      ...(member.initiativeBonus !== undefined ? { initiativeBonus: member.initiativeBonus } : {}),
      ...(member.overrides ? {
        overrides: {
          ...member.overrides,
          ...(member.overrides.saveBonuses
            ? { saveBonuses: { ...member.overrides.saveBonuses } }
            : {}),
        },
      } : {}),
    }));
    return {
      ok: true,
      source: 'party-config',
      library: createPartyLibrary('Adventuring Party', members, options),
    };
  }

  const encounter = scalarParty(data.encounterSettings, 10);
  if (encounter) {
    return {
      ok: true,
      source: 'encounter-settings',
      library: createPartyLibrary(
        'Adventuring Party',
        defaultMembers(encounter.size, encounter.level),
        options,
      ),
    };
  }

  const noncombat = noncombatParty(data);
  if (noncombat) {
    return {
      ok: true,
      source: 'noncombat-settings',
      library: createPartyLibrary(
        'Adventuring Party',
        defaultMembers(noncombat.size, noncombat.level),
        options,
      ),
    };
  }

  return { ok: true, source: 'empty', library: createEmptyPartyLibrary() };
}

/**
 * Temporary rollout bridge for the existing detailed forecast editor. Scalar
 * encounter controls never call this function, so tool resets and one-off
 * size/level changes cannot replace the durable party.
 */
export function mergeForecastMembersIntoPartyLibrary(
  library: PartyLibrary,
  members: readonly PartyMemberConfig[],
  options: { now?: number; createId?: PartyIdFactory } = {},
): PartyLibrary {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? createPartyId;
  const active = getActiveParty(library);
  if (!active) {
    const created = createPartyLibrary(
      'Adventuring Party',
      members.map((member) => ({
        name: member.name,
        templateId: member.templateId,
        level: member.level,
        ...(member.initiativeBonus !== undefined
          ? { initiativeBonus: member.initiativeBonus }
          : {}),
        ...(member.overrides ? { overrides: member.overrides } : {}),
      })),
      { now, createId },
    );
    return {
      ...library,
      activePartyId: created.activePartyId,
      parties: created.parties,
    };
  }

  const existingById = new Map(active.members.map((member) => [member.id, member]));
  const usedMemberIds = new Set(
    library.parties.flatMap((party) => party.members.map((member) => member.id)),
  );
  const allocateMemberId = () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = createId('member');
      if (!usedMemberIds.has(candidate)) {
        usedMemberIds.add(candidate);
        return candidate;
      }
    }
    throw new Error('A unique party member ID could not be generated.');
  };
  const legacyIdentityMode = members.every((member) => !member.id);
  const nextMembers = members.map((member, index) => {
    const existing = member.id
      ? existingById.get(member.id)
      : legacyIdentityMode
        ? active.members[index]
        : undefined;
    return {
      ...(existing ?? {}),
      id: existing?.id ?? allocateMemberId(),
      name: member.name,
      templateId: member.templateId,
      level: member.level,
      ...(member.initiativeBonus !== undefined
        ? { initiativeBonus: member.initiativeBonus }
        : { initiativeBonus: existing?.initiativeBonus }),
      ...(member.overrides
        ? {
            overrides: {
              ...member.overrides,
              ...(member.overrides.saveBonuses
                ? { saveBonuses: { ...member.overrides.saveBonuses } }
                : {}),
            },
          }
        : { overrides: undefined }),
    };
  });

  return {
    ...library,
    parties: library.parties.map((party) => party.id === active.id
      ? { ...party, updatedAt: now, members: nextMembers }
      : party),
  };
}

function readJson(storage: Storage, key: string): { value?: unknown; corrupt: boolean } {
  const raw = storage.getItem(storageKey(key));
  if (raw === null) return { corrupt: false };
  try {
    return { value: JSON.parse(raw) as unknown, corrupt: false };
  } catch {
    return { corrupt: true };
  }
}

/** Read all legacy sources together so an unavailable localStorage is visible. */
export function readLegacyPartyData(): LegacyPartyReadResult {
  if (typeof window === 'undefined') {
    return { ok: false, message: 'Browser storage is unavailable, so the existing party could not be migrated.' };
  }

  try {
    const storage = window.localStorage;
    const partyConfig = readJson(storage, LEGACY_PARTY_KEYS.partyConfig);
    const encounterSettings = readJson(storage, LEGACY_PARTY_KEYS.encounterSettings);
    const noncombatPartySize = readJson(storage, LEGACY_PARTY_KEYS.noncombatPartySize);
    const noncombatPartyLevel = readJson(storage, LEGACY_PARTY_KEYS.noncombatPartyLevel);
    return {
      ok: true,
      data: {
        partyConfig: partyConfig.value,
        partyConfigCorrupt: partyConfig.corrupt,
        encounterSettings: encounterSettings.value,
        noncombatPartySize: noncombatPartySize.value,
        noncombatPartyLevel: noncombatPartyLevel.value,
      },
    };
  } catch {
    return {
      ok: false,
      message: 'Browser storage could not be read, so the existing party was left untouched.',
    };
  }
}
