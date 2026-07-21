import { generateMap } from './map-generator';
import { MAX_SCENE_PARTY_MEMBERS } from './tool-party';
import type {
  EncounterMap,
  MapFeatureDensity,
  MapTerrainVariety,
  MapToken,
} from './types';

// ─── Recent Maps storage ─────────────────────────────────────────
// Ten full 40×30 maps with rooms weigh ~300–400 KB of localStorage;
// a map generated after the overhaul is fully reproducible from its
// seed + options, so history stores a ~200-byte stub and regenerates
// on click. The grid-stream freeze (map-grid-freeze.test.ts) is what
// makes that regeneration exact. Pre-overhaul entries have no seed —
// they stay stored whole and age out of the 10-slot list naturally.

/** Everything needed to reproduce (or display a card for) a map. */
export interface MapHistoryStub {
  id: string;
  name: string;
  width: number;
  height: number;
  environment: EncounterMap['environment'];
  seed: number;
  genOptions: NonNullable<EncounterMap['genOptions']>;
  /** Frozen local presentation; omitted for legacy tokenless maps. */
  partyTokens?: MapToken[];
  /** Requested slots, including any that could not fit on the generated map. */
  partyCount?: number;
}

export type MapHistoryEntry = (EncounterMap & {
  partyTokens?: MapToken[];
  partyCount?: number;
}) | MapHistoryStub;

const isStub = (entry: MapHistoryEntry): entry is MapHistoryStub =>
  !('grid' in entry);

/** Slim a map for storage when it can be regenerated; else keep it whole. */
export function toHistoryEntry(
  map: EncounterMap,
  partyTokens: readonly MapToken[] = [],
  partyCount = partyTokens.filter((token) => token.kind === 'party').length,
): MapHistoryEntry {
  const frozenTokens = partyTokens.map((token) => ({ ...token }));
  const frozenPartyCount = Math.max(
    0,
    Math.min(MAX_SCENE_PARTY_MEMBERS, Math.floor(partyCount)),
  );
  if (map.seed === undefined || map.genOptions === undefined) {
    if (frozenTokens.length === 0 && frozenPartyCount === 0) return map;
    return {
      ...map,
      ...(frozenTokens.length > 0 ? { partyTokens: frozenTokens } : {}),
      ...(frozenPartyCount > 0 ? { partyCount: frozenPartyCount } : {}),
    };
  }
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    environment: map.environment,
    seed: map.seed,
    genOptions: map.genOptions,
    ...(frozenTokens.length > 0 ? { partyTokens: frozenTokens } : {}),
    ...(frozenPartyCount > 0 ? { partyCount: frozenPartyCount } : {}),
  };
}

export function historyEntryPartyTokens(entry: MapHistoryEntry): MapToken[] {
  return (entry.partyTokens ?? []).map((token) => ({ ...token }));
}

export function historyEntryPartyCount(entry: MapHistoryEntry): number {
  if (entry.partyCount !== undefined) return entry.partyCount;
  return (entry.partyTokens ?? []).filter((token) => token.kind === 'party').length;
}

/** Turn a history entry back into a displayable map. Scale-generated
 *  maps replay scale mode (their grids include the jitter draws);
 *  explicit-dimension maps replay with exact width/height. */
export function resolveHistoryEntry(entry: MapHistoryEntry): EncounterMap {
  if (!isStub(entry)) {
    if (!('partyTokens' in entry) && !('partyCount' in entry)) return entry;
    // Presentation snapshots stay beside the map, never inside map exports.
    const {
      partyTokens: _partyTokens,
      partyCount: _partyCount,
      ...map
    } = entry;
    return map;
  }
  return generateMap({
    environment: entry.environment,
    seed: entry.seed,
    featureDensity: entry.genOptions.featureDensity,
    terrainVariety: entry.genOptions.terrainVariety,
    ...(entry.genOptions.scale !== undefined
      ? { scale: entry.genOptions.scale }
      : { width: entry.width, height: entry.height }),
    ...(entry.genOptions.layout !== undefined ? { layout: entry.genOptions.layout } : {}),
    ...(entry.genOptions.roomCount !== undefined
      ? { roomCount: entry.genOptions.roomCount }
      : {}),
  });
}

/** Tolerant reader: full pre-overhaul maps and slim stubs both load. */
export function isMapHistoryArray(v: unknown): v is MapHistoryEntry[] {
  if (!Array.isArray(v)) return false;
  return v.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Partial<MapHistoryStub & EncounterMap>;
    const base = typeof e.id === 'string'
      && typeof e.name === 'string'
      && typeof e.width === 'number'
      && typeof e.height === 'number'
      && typeof e.environment === 'string';
    if (!base) return false;
    if (e.partyTokens !== undefined
      && (!Array.isArray(e.partyTokens) || !e.partyTokens.every(isMapToken))) return false;
    if (e.partyCount !== undefined
      && (typeof e.partyCount !== 'number'
        || !Number.isInteger(e.partyCount)
        || e.partyCount < 0
        || e.partyCount > MAX_SCENE_PARTY_MEMBERS)) return false;
    if (Array.isArray(e.grid)) return true; // full map (legacy or current)
    return typeof e.seed === 'number' && typeof e.genOptions === 'object' && e.genOptions !== null;
  });
}

function isMapToken(value: unknown): value is MapToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const token = value as Partial<MapToken>;
  return typeof token.id === 'string'
    && (token.kind === 'party' || token.kind === 'monster')
    && typeof token.name === 'string'
    && typeof token.label === 'string'
    && token.label.length >= 1
    && token.label.length <= 2
    && typeof token.x === 'number'
    && Number.isInteger(token.x)
    && typeof token.y === 'number'
    && Number.isInteger(token.y)
    && typeof token.sizeCells === 'number'
    && Number.isInteger(token.sizeCells)
    && (token.sizeCells === 1 || token.sizeCells === 2
      || token.sizeCells === 3 || token.sizeCells === 4);
}
