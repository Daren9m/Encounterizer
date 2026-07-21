import type { PartyMemberProfile, PartyProfile } from './party';

/** Persisted shape for party choices that belong to one tool or scene. */
export const TOOL_PARTY_SETUP_VERSION = 1 as const;

/** Durable parties may bring this many members into a scene. */
export const MAX_SCENE_PARTY_MEMBERS = 50;

/** Temporary, anonymous parties stay intentionally quick to configure. */
export const MAX_CUSTOM_PARTY_MEMBERS = 10;

export interface ActiveToolPartySetup {
  readonly version: typeof TOOL_PARTY_SETUP_VERSION;
  readonly mode: 'active';
  readonly partyId: string;
  /** The members attending this scene. Order is always durable roster order. */
  readonly selectedMemberIds: readonly string[];
  /**
   * Roster IDs seen on the previous reconciliation. This lets a newly-added
   * character default to attending without re-selecting someone the DM
   * intentionally marked absent.
   */
  readonly knownMemberIds: readonly string[];
}

export interface CustomToolPartySetup {
  readonly version: typeof TOOL_PARTY_SETUP_VERSION;
  readonly mode: 'custom';
  /** Zero is useful for maps without player tokens. */
  readonly size: number;
  readonly level: number;
}

export type ToolPartySetup = ActiveToolPartySetup | CustomToolPartySetup;

export type ToolPartySetupReadSource =
  | 'current'
  | 'legacy-scalars'
  | 'active-default'
  | 'custom-default';

export interface ToolPartySetupReadResult {
  readonly setup: ToolPartySetup;
  readonly source: ToolPartySetupReadSource;
  readonly migrated: boolean;
}

export interface ReadToolPartySetupOptions {
  readonly activeParty?: PartyProfile | null;
  readonly legacyPartySize?: unknown;
  readonly legacyPartyLevel?: unknown;
  readonly defaultCustomSize?: number;
  readonly defaultCustomLevel?: number;
}

export interface ToolPartyTokenIdentity {
  /** Stable durable ID locally; positional and anonymous in custom/share mode. */
  readonly id: string;
  readonly sourcePartyMemberId?: string;
  readonly name: string;
  /** A compact, one- or two-character map label. */
  readonly label: string;
}

export interface ResolvedToolPartySetup {
  readonly setup: ToolPartySetup;
  readonly mode: ToolPartySetup['mode'];
  readonly partyId?: string;
  readonly members: readonly PartyMemberProfile[];
  readonly selectedMemberIds: readonly string[];
  readonly partySize: number;
  /** Null only when an active party has no attending members. */
  readonly partyLevel: number | null;
  /** Exact levels used by consumers that support mixed-level parties. */
  readonly exactLevels: readonly number[];
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
}

function validUniqueIds(value: unknown, maximum: number): value is string[] {
  return Array.isArray(value)
    && value.length <= maximum
    && value.every(validId)
    && new Set(value).size === value.length;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum;
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function rosterIds(party: PartyProfile): string[] {
  return party.members
    .slice(0, MAX_SCENE_PARTY_MEMBERS)
    .map((member) => member.id);
}

function orderedSelectedIds(
  party: PartyProfile,
  selectedMemberIds: readonly string[],
): string[] {
  const selected = new Set(selectedMemberIds);
  return rosterIds(party).filter((memberId) => selected.has(memberId));
}

export function isToolPartySetup(value: unknown): value is ToolPartySetup {
  const setup = record(value);
  if (!setup || setup.version !== TOOL_PARTY_SETUP_VERSION) return false;

  if (setup.mode === 'custom') {
    return boundedInteger(setup.size, 0, MAX_CUSTOM_PARTY_MEMBERS)
      && boundedInteger(setup.level, 1, 20);
  }

  if (setup.mode !== 'active'
    || !validId(setup.partyId)
    || !validUniqueIds(setup.selectedMemberIds, MAX_SCENE_PARTY_MEMBERS)
    || !validUniqueIds(setup.knownMemberIds, MAX_SCENE_PARTY_MEMBERS)
  ) return false;

  const known = new Set(setup.knownMemberIds);
  return setup.selectedMemberIds.every((memberId) => known.has(memberId));
}

export function createActiveToolPartySetup(
  party: PartyProfile,
  selectedMemberIds?: readonly string[],
): ActiveToolPartySetup {
  const knownMemberIds = rosterIds(party);
  const selected = selectedMemberIds === undefined
    ? [...knownMemberIds]
    : orderedSelectedIds(party, selectedMemberIds);
  return {
    version: TOOL_PARTY_SETUP_VERSION,
    mode: 'active',
    partyId: party.id,
    selectedMemberIds: selected,
    knownMemberIds,
  };
}

export function createCustomToolPartySetup(
  size: unknown,
  level: unknown,
  defaults: { readonly size?: number; readonly level?: number } = {},
): CustomToolPartySetup {
  const fallbackSize = clampInteger(
    defaults.size,
    4,
    0,
    MAX_CUSTOM_PARTY_MEMBERS,
  );
  const fallbackLevel = clampInteger(defaults.level, 5, 1, 20);
  return {
    version: TOOL_PARTY_SETUP_VERSION,
    mode: 'custom',
    size: clampInteger(size, fallbackSize, 0, MAX_CUSTOM_PARTY_MEMBERS),
    level: clampInteger(level, fallbackLevel, 1, 20),
  };
}

/** Convert the two pre-durable-party storage values into one isolated setup. */
export function migrateLegacyPartyScalars(
  partySize: unknown,
  partyLevel: unknown,
  defaults: { readonly size?: number; readonly level?: number } = {},
): CustomToolPartySetup {
  return createCustomToolPartySetup(partySize, partyLevel, defaults);
}

function cloneSetup(setup: ToolPartySetup): ToolPartySetup {
  return setup.mode === 'custom'
    ? { ...setup }
    : {
        ...setup,
        selectedMemberIds: [...setup.selectedMemberIds],
        knownMemberIds: [...setup.knownMemberIds],
      };
}

function parsedValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * Tolerantly read persisted setup state. Invalid/future data cannot block a
 * tool: it falls back to the active party, legacy scalars, or safe defaults.
 */
export function readToolPartySetup(
  raw: unknown,
  options: ReadToolPartySetupOptions = {},
): ToolPartySetupReadResult {
  const parsed = parsedValue(raw);
  if (isToolPartySetup(parsed)) {
    const setup = parsed.mode === 'active' && options.activeParty
      ? reconcileToolPartySetup(parsed, options.activeParty)
      : cloneSetup(parsed);
    return { setup, source: 'current', migrated: false };
  }

  const legacy = record(parsed);
  // Only unversioned scalar objects are legacy. A future structured document
  // must fall back safely instead of being misread as today's custom shape.
  const scalarObject = legacy && legacy.version === undefined && legacy.mode === undefined
    ? legacy
    : null;
  const legacySize = scalarObject?.partySize ?? scalarObject?.size ?? options.legacyPartySize;
  const legacyLevel = scalarObject?.partyLevel ?? scalarObject?.level ?? options.legacyPartyLevel;
  if (legacySize !== undefined || legacyLevel !== undefined) {
    return {
      setup: migrateLegacyPartyScalars(legacySize, legacyLevel, {
        size: options.defaultCustomSize,
        level: options.defaultCustomLevel,
      }),
      source: 'legacy-scalars',
      migrated: true,
    };
  }

  if (options.activeParty) {
    return {
      setup: createActiveToolPartySetup(options.activeParty),
      source: 'active-default',
      migrated: false,
    };
  }

  return {
    setup: createCustomToolPartySetup(
      options.defaultCustomSize,
      options.defaultCustomLevel,
    ),
    source: 'custom-default',
    migrated: false,
  };
}

/**
 * Reconcile scene attendance against the live roster. Existing absences stay
 * absent, stale IDs disappear, and genuinely new members default to attending.
 */
export function reconcileToolPartySetup(
  setup: ToolPartySetup,
  party: PartyProfile,
): ToolPartySetup {
  if (setup.mode === 'custom') return cloneSetup(setup);
  if (setup.partyId !== party.id) return createActiveToolPartySetup(party);

  const currentIds = rosterIds(party);
  const previouslyKnown = new Set(setup.knownMemberIds);
  const previouslySelected = new Set(setup.selectedMemberIds);
  const selectedMemberIds = currentIds.filter((memberId) => (
    previouslySelected.has(memberId) || !previouslyKnown.has(memberId)
  ));

  return {
    version: TOOL_PARTY_SETUP_VERSION,
    mode: 'active',
    partyId: party.id,
    selectedMemberIds,
    knownMemberIds: currentIds,
  };
}

/** Resolve the scalar inputs while retaining exact active-party attendance. */
export function resolveToolPartySetup(
  setup: ToolPartySetup,
  activeParty: PartyProfile | null | undefined,
): ResolvedToolPartySetup {
  if (setup.mode === 'custom') {
    return {
      setup: cloneSetup(setup),
      mode: 'custom',
      members: [],
      selectedMemberIds: [],
      partySize: setup.size,
      partyLevel: setup.level,
      exactLevels: Array.from({ length: setup.size }, () => setup.level),
    };
  }

  if (!activeParty) {
    return {
      setup: cloneSetup(setup),
      mode: 'active',
      partyId: setup.partyId,
      members: [],
      selectedMemberIds: [],
      partySize: 0,
      partyLevel: null,
      exactLevels: [],
    };
  }

  const reconciled = reconcileToolPartySetup(setup, activeParty) as ActiveToolPartySetup;
  const selected = new Set(reconciled.selectedMemberIds);
  const members = activeParty.members
    .filter((member) => selected.has(member.id))
    .slice(0, MAX_SCENE_PARTY_MEMBERS);
  const exactLevels = members.map((member) => member.level);

  return {
    setup: reconciled,
    mode: 'active',
    partyId: activeParty.id,
    members,
    selectedMemberIds: members.map((member) => member.id),
    partySize: members.length,
    partyLevel: exactLevels.length === 0
      ? null
      : Math.round(exactLevels.reduce((total, level) => total + level, 0) / exactLevels.length),
    exactLevels,
  };
}

function compactLabel(name: string, fallbackIndex: number): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return (fallbackIndex + 1).toString(36).toUpperCase();
  const points = (value: string) => Array.from(value);
  if (words.length === 1) return points(words[0]).slice(0, 2).join('').toUpperCase();
  return `${points(words[0])[0] ?? ''}${points(words[1])[0] ?? ''}`.toUpperCase();
}

/**
 * Build map-ready identities. Pass `anonymous: true` before sharing or export
 * to discard durable IDs and character names.
 */
export function getToolPartyTokenIdentities(
  resolution: ResolvedToolPartySetup,
  options: { readonly anonymous?: boolean } = {},
): ToolPartyTokenIdentity[] {
  const anonymous = options.anonymous === true || resolution.mode === 'custom';
  return Array.from({ length: resolution.partySize }, (_, index) => {
    const member = resolution.members[index];
    if (!anonymous && member) {
      const name = member.name.trim() || `Party Member ${index + 1}`;
      return {
        id: `party-${member.id}`,
        sourcePartyMemberId: member.id,
        name,
        label: compactLabel(name, index),
      };
    }
    return {
      id: `party-${index}`,
      name: `Party Member ${index + 1}`,
      label: compactLabel('', index),
    };
  });
}
