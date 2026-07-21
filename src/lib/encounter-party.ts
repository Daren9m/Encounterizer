import {
  CLASS_TEMPLATES,
  defaultPartyConfig,
  getTemplateById,
} from '@/data/class-templates';
import type { PartyConfig, PartyMemberConfig } from './battle-sim-types';
import {
  getSelectedPartyMembers,
  isPartyCombatOverrides,
  type PartyCombatOverrides,
  type PartyProfile,
} from './party';
import type { Party as BudgetParty } from './types';

export const ENCOUNTER_PARTY_SNAPSHOT_VERSION = 1 as const;
/** Keeps shared URLs and synchronous battle forecasts within a safe bound. */
export const MAX_ENCOUNTER_PARTY_MEMBERS = 50;

/**
 * The mechanics needed to reproduce an encounter budget and forecast without
 * carrying a character, player, or party identity into a save/share payload.
 */
export interface AnonymousPartyMemberSnapshot {
  readonly level: number;
  readonly templateId: string;
  readonly initiativeBonus?: number;
  readonly overrides?: AnonymousPartyCombatOverrides;
}

export interface AnonymousPartyCombatOverrides {
  readonly ac?: number;
  readonly maxHp?: number;
  readonly attackBonus?: number;
  readonly attacksPerRound?: number;
  readonly avgDamagePerHit?: number;
  readonly healingPerRound?: number;
  readonly saveBonuses?: Readonly<{ dex: number; con: number; wis: number }>;
  readonly spellDc?: number;
  readonly avgSpellDamagePerRound?: number;
}

export interface AnonymousPartySnapshot {
  readonly version: typeof ENCOUNTER_PARTY_SNAPSHOT_VERSION;
  readonly members: readonly AnonymousPartyMemberSnapshot[];
}

/**
 * Local saves and battle handoffs retain their durable source separately from
 * the anonymous snapshot. Only `snapshot` is ever written to a share URL.
 */
export type EncounterPartyContext =
  | {
      readonly source: 'library';
      readonly partyId: string;
      readonly selectedMemberIds: readonly string[];
      readonly snapshot: AnonymousPartySnapshot;
    }
  | {
      readonly source: 'custom' | 'shared';
      readonly snapshot: AnonymousPartySnapshot;
    };

function copyOverrides(
  overrides: PartyCombatOverrides | undefined,
): AnonymousPartyCombatOverrides | undefined {
  if (!overrides) return undefined;
  // Explicitly allowlist mechanics. Imported JSON and future schema fields can
  // never smuggle identity or prototype keys into an anonymous share payload.
  const copy: AnonymousPartyCombatOverrides = {
    ...(overrides.ac !== undefined ? { ac: overrides.ac } : {}),
    ...(overrides.maxHp !== undefined ? { maxHp: overrides.maxHp } : {}),
    ...(overrides.attackBonus !== undefined ? { attackBonus: overrides.attackBonus } : {}),
    ...(overrides.attacksPerRound !== undefined ? { attacksPerRound: overrides.attacksPerRound } : {}),
    ...(overrides.avgDamagePerHit !== undefined ? { avgDamagePerHit: overrides.avgDamagePerHit } : {}),
    ...(overrides.healingPerRound !== undefined ? { healingPerRound: overrides.healingPerRound } : {}),
    ...(overrides.saveBonuses
      ? {
          saveBonuses: {
            dex: overrides.saveBonuses.dex,
            con: overrides.saveBonuses.con,
            wis: overrides.saveBonuses.wis,
          },
        }
      : {}),
    ...(overrides.spellDc !== undefined ? { spellDc: overrides.spellDc } : {}),
    ...(overrides.avgSpellDamagePerRound !== undefined
      ? { avgSpellDamagePerRound: overrides.avgSpellDamagePerRound }
      : {}),
  };
  if (copy.saveBonuses) Object.freeze(copy.saveBonuses);
  return Object.freeze(copy);
}

function safeTemplateId(templateId: string): string {
  return typeof templateId === 'string'
    ? getTemplateById(templateId)?.id ?? CLASS_TEMPLATES[0].id
    : CLASS_TEMPLATES[0].id;
}

function captureMember(member: {
  level: number;
  templateId: string;
  initiativeBonus?: number;
  overrides?: PartyCombatOverrides;
}): AnonymousPartyMemberSnapshot {
  const level = Number.isFinite(member.level)
    ? Math.max(1, Math.min(20, Math.round(member.level)))
    : 1;
  const initiativeBonus = Number.isInteger(member.initiativeBonus)
    && (member.initiativeBonus as number) >= -30
    && (member.initiativeBonus as number) <= 30
    ? member.initiativeBonus
    : undefined;
  const overrides = member.overrides && isPartyCombatOverrides(member.overrides)
    ? copyOverrides(member.overrides)
    : undefined;
  const snapshot: AnonymousPartyMemberSnapshot = {
    level,
    templateId: safeTemplateId(member.templateId),
    ...(initiativeBonus !== undefined
      ? { initiativeBonus }
      : {}),
    ...(overrides ? { overrides } : {}),
  };
  return Object.freeze(snapshot);
}

function captureSnapshot(
  members: readonly {
    level: number;
    templateId: string;
    initiativeBonus?: number;
    overrides?: PartyCombatOverrides;
  }[],
): AnonymousPartySnapshot {
  const captured = members
    .slice(0, MAX_ENCOUNTER_PARTY_MEMBERS)
    .map(captureMember);
  Object.freeze(captured);
  return Object.freeze({
    version: ENCOUNTER_PARTY_SNAPSHOT_VERSION,
    members: captured,
  });
}

/** Keep attendance in durable roster order while dropping stale IDs. */
export function reconcilePartySelection(
  party: PartyProfile,
  memberIds?: readonly string[],
): string[] {
  if (memberIds === undefined) {
    return party.members
      .slice(0, MAX_ENCOUNTER_PARTY_MEMBERS)
      .map((member) => member.id);
  }
  const selected = new Set(memberIds);
  return party.members
    .filter((member) => selected.has(member.id))
    .map((member) => member.id)
    .slice(0, MAX_ENCOUNTER_PARTY_MEMBERS);
}

export function snapshotActiveParty(
  party: PartyProfile,
  memberIds?: readonly string[],
): AnonymousPartySnapshot {
  return captureSnapshot(getSelectedPartyMembers(party, memberIds));
}

export function snapshotForecastConfig(config: PartyConfig): AnonymousPartySnapshot {
  return captureSnapshot(config.members);
}

export function snapshotCustomParty(size: number, level: number): AnonymousPartySnapshot {
  return snapshotForecastConfig({
    version: 1,
    members: defaultPartyConfig(size, level),
  });
}

export function contextFromActiveParty(
  party: PartyProfile,
  memberIds?: readonly string[],
): EncounterPartyContext {
  const selectedMemberIds = reconcilePartySelection(party, memberIds);
  return Object.freeze({
    source: 'library' as const,
    partyId: party.id,
    selectedMemberIds: Object.freeze(selectedMemberIds),
    snapshot: snapshotActiveParty(party, selectedMemberIds),
  });
}

export function contextFromCustomParty(config: PartyConfig): EncounterPartyContext {
  return Object.freeze({
    source: 'custom' as const,
    snapshot: snapshotForecastConfig(config),
  });
}

export function contextFromSharedSnapshot(
  snapshot: AnonymousPartySnapshot,
): EncounterPartyContext {
  return Object.freeze({
    source: 'shared' as const,
    snapshot: cloneAnonymousPartySnapshot(snapshot),
  });
}

export function snapshotToBudgetParty(snapshot: AnonymousPartySnapshot): BudgetParty {
  return {
    id: 'encounter-party-snapshot',
    name: 'Encounter Party',
    members: snapshot.members.map((member, index) => ({
      name: `Player ${index + 1}`,
      level: member.level,
      className: member.templateId,
    })),
  };
}

export function snapshotToForecastConfig(
  snapshot: AnonymousPartySnapshot,
  options: {
    memberIds?: readonly string[];
    names?: readonly string[];
  } = {},
): PartyConfig {
  return {
    version: 1,
    members: snapshot.members.map((member, index): PartyMemberConfig => ({
      ...(options.memberIds?.[index] ? { id: options.memberIds[index] } : {}),
      name: options.names?.[index]?.trim() || `Player ${index + 1}`,
      templateId: member.templateId,
      level: member.level,
      ...(member.initiativeBonus !== undefined
        ? { initiativeBonus: member.initiativeBonus }
        : {}),
      ...(member.overrides
        ? { overrides: copyOverrides(member.overrides as PartyCombatOverrides) }
        : {}),
    })),
  };
}

export function contextToBudgetParty(context: EncounterPartyContext): BudgetParty {
  return snapshotToBudgetParty(context.snapshot);
}

export function contextToForecastConfig(
  context: EncounterPartyContext,
  names?: readonly string[],
): PartyConfig {
  return snapshotToForecastConfig(context.snapshot, {
    ...(context.source === 'library'
      ? { memberIds: context.selectedMemberIds }
      : {}),
    ...(names ? { names } : {}),
  });
}

export function cloneAnonymousPartySnapshot(
  snapshot: AnonymousPartySnapshot,
): AnonymousPartySnapshot {
  return captureSnapshot(snapshot.members.map((member) => ({
    level: member.level,
    templateId: member.templateId,
    ...(member.initiativeBonus !== undefined
      ? { initiativeBonus: member.initiativeBonus }
      : {}),
    ...(member.overrides
      ? { overrides: member.overrides as PartyCombatOverrides }
      : {}),
  })));
}

export function cloneEncounterPartyContext(
  context: EncounterPartyContext,
): EncounterPartyContext {
  if (context.source === 'library') {
    return Object.freeze({
      source: 'library' as const,
      partyId: context.partyId,
      selectedMemberIds: Object.freeze([
        ...context.selectedMemberIds.slice(0, MAX_ENCOUNTER_PARTY_MEMBERS),
      ]),
      snapshot: cloneAnonymousPartySnapshot(context.snapshot),
    });
  }
  return Object.freeze({
    source: context.source,
    snapshot: cloneAnonymousPartySnapshot(context.snapshot),
  });
}

function isSnapshotMember(value: unknown): value is {
  level: number;
  templateId: string;
  initiativeBonus?: number;
  overrides?: PartyCombatOverrides;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  return Number.isInteger(member.level)
    && (member.level as number) >= 1
    && (member.level as number) <= 20
    && typeof member.templateId === 'string'
    && getTemplateById(member.templateId) !== undefined
    && (member.initiativeBonus === undefined
      || (Number.isInteger(member.initiativeBonus)
        && (member.initiativeBonus as number) >= -30
        && (member.initiativeBonus as number) <= 30))
    && (member.overrides === undefined || isPartyCombatOverrides(member.overrides));
}

export function isAnonymousPartySnapshot(value: unknown): value is AnonymousPartySnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  return snapshot.version === ENCOUNTER_PARTY_SNAPSHOT_VERSION
    && Array.isArray(snapshot.members)
    && snapshot.members.length > 0
    && snapshot.members.length <= MAX_ENCOUNTER_PARTY_MEMBERS
    && snapshot.members.every(isSnapshotMember);
}

export function isEncounterPartyContext(value: unknown): value is EncounterPartyContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  if (!isAnonymousPartySnapshot(context.snapshot)) return false;
  if (context.source === 'custom' || context.source === 'shared') return true;
  return context.source === 'library'
    && typeof context.partyId === 'string'
    && context.partyId.length > 0
    && Array.isArray(context.selectedMemberIds)
    && context.selectedMemberIds.length === (context.snapshot as AnonymousPartySnapshot).members.length
    && context.selectedMemberIds.every((id) => typeof id === 'string' && id.length > 0)
    && new Set(context.selectedMemberIds).size === context.selectedMemberIds.length;
}

/** JSON remains URLSearchParams-safe after normal query encoding. */
export function serializeAnonymousPartySnapshot(snapshot: AnonymousPartySnapshot): string {
  return JSON.stringify(cloneAnonymousPartySnapshot(snapshot));
}

/** Re-capture parsed data so unknown fields, identity, and mutable references disappear. */
export function parseAnonymousPartySnapshot(raw: string | null): AnonymousPartySnapshot | null {
  if (!raw || raw.length > 100_000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAnonymousPartySnapshot(parsed)
      ? cloneAnonymousPartySnapshot(parsed)
      : null;
  } catch {
    return null;
  }
}

export function partyLevelRange(snapshot: AnonymousPartySnapshot): {
  min: number;
  max: number;
} | null {
  if (snapshot.members.length === 0) return null;
  const levels = snapshot.members.map((member) => member.level);
  return { min: Math.min(...levels), max: Math.max(...levels) };
}

export function representativePartyLevel(snapshot: AnonymousPartySnapshot): number {
  if (snapshot.members.length === 0) return 1;
  return Math.round(
    snapshot.members.reduce((total, member) => total + member.level, 0)
      / snapshot.members.length,
  );
}

export interface EncounterSharePartyResolution {
  mode: 'snapshot' | 'custom';
  context: EncounterPartyContext;
  size: number;
  level: number;
}

function boundedIntegerParam(
  raw: string | null,
  min: number,
  max: number,
): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= min && value <= max
    ? value
    : null;
}

/** Add anonymous exact-party data plus scalar fallbacks for legacy clients. */
export function writeEncounterPartyShareParams(
  params: URLSearchParams,
  context: EncounterPartyContext,
): void {
  params.set('size', String(context.snapshot.members.length));
  params.set('level', String(representativePartyLevel(context.snapshot)));
  params.set('ps', serializeAnonymousPartySnapshot(context.snapshot));
}

/** A valid anonymous snapshot wins; old size/level links remain temporary. */
export function readEncounterPartyShareParams(
  params: URLSearchParams,
): EncounterSharePartyResolution | null {
  const snapshot = parseAnonymousPartySnapshot(params.get('ps'));
  if (snapshot) {
    return {
      mode: 'snapshot',
      context: contextFromSharedSnapshot(snapshot),
      size: snapshot.members.length,
      level: representativePartyLevel(snapshot),
    };
  }

  const size = boundedIntegerParam(params.get('size'), 1, 10);
  const level = boundedIntegerParam(params.get('level'), 1, 20);
  if (size === null || level === null) return null;
  const config: PartyConfig = {
    version: 1,
    members: defaultPartyConfig(size, level),
  };
  return {
    mode: 'custom',
    context: contextFromCustomParty(config),
    size,
    level,
  };
}
