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

const PINNED: Array<{ label: string; options: MapOptions; hash: string }> = [
  { label: 'dungeon (Urban)', options: { environment: 'Urban', seed: 42 }, hash: 'e15cf87f' },
  {
    label: 'dungeon with roomCount',
    options: { environment: 'Urban', seed: 7, width: 32, height: 24, roomCount: 6 },
    hash: 'd376383d',
  },
  { label: 'cave (Underdark)', options: { environment: 'Underdark', seed: 1 }, hash: '6150f7fd' },
  {
    label: 'cave with lava pool (Planar)',
    options: { environment: 'Planar', seed: 3, featureDensity: 'Dense', terrainVariety: 'Wild' },
    hash: '1c117e9c',
  },
  { label: 'outdoor with river (Forest)', options: { environment: 'Forest', seed: 12345 }, hash: '513e4f62' },
  { label: 'mountain coin flip', options: { environment: 'Mountain', seed: 9 }, hash: '381ee76b' },
];

describe('grid stream freeze', () => {
  it.each(PINNED)('$label stays pinned', ({ options, hash }) => {
    expect(gridHash(options)).toBe(hash);
  });
});
