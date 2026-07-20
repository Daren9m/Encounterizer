import { generateMap } from './map-generator';
import type { EncounterMap, MapFeatureDensity, MapTerrainVariety } from './types';

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
}

export type MapHistoryEntry = EncounterMap | MapHistoryStub;

const isStub = (entry: MapHistoryEntry): entry is MapHistoryStub =>
  !('grid' in entry);

/** Slim a map for storage when it can be regenerated; else keep it whole. */
export function toHistoryEntry(map: EncounterMap): MapHistoryEntry {
  if (map.seed === undefined || map.genOptions === undefined) return map;
  return {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    environment: map.environment,
    seed: map.seed,
    genOptions: map.genOptions,
  };
}

/** Turn a history entry back into a displayable map. Scale-generated
 *  maps replay scale mode (their grids include the jitter draws);
 *  explicit-dimension maps replay with exact width/height. */
export function resolveHistoryEntry(entry: MapHistoryEntry): EncounterMap {
  if (!isStub(entry)) return entry;
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
    if (Array.isArray(e.grid)) return true; // full map (legacy or current)
    return typeof e.seed === 'number' && typeof e.genOptions === 'object' && e.genOptions !== null;
  });
}
