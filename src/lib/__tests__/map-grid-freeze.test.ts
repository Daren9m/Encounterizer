import { describe, expect, it } from 'vitest';
import { generateMap, type MapOptions } from '@/lib/map-generator';

// ─── Grid draw-order freeze ──────────────────────────────────────
// These hashes pin the terrain output of the grid rng stream for
// fixed (environment, seed) pairs. Shareable ?seed= links replay the
// stream, so ANY change to these values is a compatibility break for
// every map link in the wild. If a change is intentional, it needs a
// versioning plan (see the draw-order contract in map-generator.ts),
// and these literals get re-recorded in the same commit.

/** FNV-1a over the terrain matrix (dimensions included). */
function gridHash(options: MapOptions): string {
  const map = generateMap(options);
  let hash = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  mix(`${map.width}x${map.height};`);
  for (const row of map.grid) {
    for (const cell of row) mix(`${cell.terrain},`);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Draw order v3 (layouts & scale, 2026-07-19): jitter draws precede
// layout generation and Urban auto-maps to city. Hashes re-recorded
// once for the accepted break, frozen again thereafter.
const PINNED: Array<{ label: string; options: MapOptions; hash: string }> = [
  { label: 'dungeon (explicit layout)', options: { environment: 'Urban', layout: 'dungeon', seed: 42, width: 32, height: 24 }, hash: '53560dfb' },
  {
    label: 'dungeon with roomCount',
    options: { environment: 'Any', seed: 7, width: 32, height: 24, roomCount: 6 },
    hash: 'd376383d',
  },
  { label: 'cave (Underdark)', options: { environment: 'Underdark', seed: 1 }, hash: 'e34f8ab1' },
  {
    label: 'cave with lava pool (Planar)',
    options: { environment: 'Planar', seed: 3, featureDensity: 'Dense', terrainVariety: 'Wild' },
    hash: 'b099c851',
  },
  { label: 'outdoor with river (Forest)', options: { environment: 'Forest', seed: 12345 }, hash: 'e0d7b8a9' },
  { label: 'mountain coin flip', options: { environment: 'Mountain', seed: 9 }, hash: '9973ab02' },
  { label: 'city streets (Urban auto)', options: { environment: 'Urban', seed: 42 }, hash: '603b8fad' },
  { label: 'scale mode with jitter', options: { environment: 'Forest', seed: 4242, scale: 'Large' }, hash: 'c56351b4' },
  { label: 'massive city', options: { environment: 'Urban', layout: 'city', seed: 11, scale: 'Massive' }, hash: 'f1c3fa1b' },
  { label: 'building interior', options: { environment: 'Urban', layout: 'building', seed: 42, scale: 'Standard' }, hash: '876b124e' },
];

describe('grid stream freeze', () => {
  it.each(PINNED)('$label stays pinned', ({ options, hash }) => {
    expect(gridHash(options)).toBe(hash);
  });
});
