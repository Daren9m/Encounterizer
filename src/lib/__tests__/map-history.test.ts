import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import {
  isMapHistoryArray, resolveHistoryEntry, toHistoryEntry,
} from '@/lib/map-history';
import type { EncounterMap } from '@/lib/types';

const MAP = generateMap({
  environment: 'Urban', seed: 4242, width: 32, height: 24,
  featureDensity: 'Dense', terrainVariety: 'Wild', roomCount: 8,
});

/** Pre-overhaul persisted shape: no seed, no rooms, no genOptions. */
function legacyMap(): EncounterMap {
  return {
    id: MAP.id, name: MAP.name, width: MAP.width, height: MAP.height,
    environment: MAP.environment, grid: MAP.grid,
  };
}

describe('toHistoryEntry', () => {
  it('slims reproducible maps down to seed + options', () => {
    const entry = toHistoryEntry(MAP);
    expect('grid' in entry).toBe(false);
    expect('rooms' in entry).toBe(false);
    expect(entry.id).toBe(MAP.id);
    expect(entry.name).toBe(MAP.name);
    expect(entry.seed).toBe(4242);
    // An order of magnitude smaller is the whole point.
    expect(JSON.stringify(entry).length).toBeLessThan(500);
    expect(JSON.stringify(MAP).length).toBeGreaterThan(10000);
  });

  it('keeps legacy maps whole — they cannot be regenerated', () => {
    const legacy = legacyMap();
    expect(toHistoryEntry(legacy)).toBe(legacy);
  });
});

describe('resolveHistoryEntry', () => {
  it('regenerates a stub into the exact original map (grid-freeze contract)', () => {
    const resolved = resolveHistoryEntry(toHistoryEntry(MAP));
    expect(resolved).toEqual(MAP);
  });

  it('replays scale mode for scale-generated maps (jitter draws included)', () => {
    // A scale-mode map consumed jitter draws; regenerating with explicit
    // width/height would skip them and produce a different grid.
    const scaled = generateMap({
      environment: 'Urban', seed: 777, layout: 'city', scale: 'Large',
    });
    expect(scaled.genOptions?.scale).toBe('Large');
    expect(resolveHistoryEntry(toHistoryEntry(scaled))).toEqual(scaled);
  });

  it('returns full maps untouched', () => {
    const legacy = legacyMap();
    expect(resolveHistoryEntry(legacy)).toBe(legacy);
    expect(resolveHistoryEntry(MAP)).toBe(MAP);
  });
});

describe('isMapHistoryArray', () => {
  it('accepts mixed stub and legacy arrays', () => {
    expect(isMapHistoryArray([toHistoryEntry(MAP), legacyMap(), MAP])).toBe(true);
    expect(isMapHistoryArray([])).toBe(true);
  });

  it('rejects non-arrays and malformed entries', () => {
    expect(isMapHistoryArray(null)).toBe(false);
    expect(isMapHistoryArray('nope')).toBe(false);
    expect(isMapHistoryArray([{ id: 'x' }])).toBe(false);
    expect(isMapHistoryArray([{ ...toHistoryEntry(MAP), seed: 'bad' }])).toBe(false);
  });
});
