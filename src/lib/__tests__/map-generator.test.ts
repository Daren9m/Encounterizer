import { describe, expect, it } from 'vitest';
import { generateMap, TERRAIN_INFO } from '@/lib/map-generator';
import type { TerrainType } from '@/lib/types';

describe('generateMap', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMap({ environment: 'Forest', seed: 12345 });
    const b = generateMap({ environment: 'Forest', seed: 12345 });
    expect(a).toEqual(b);
  });

  it('produces different maps for different seeds', () => {
    const a = generateMap({ environment: 'Underdark', seed: 1 });
    const b = generateMap({ environment: 'Underdark', seed: 2 });
    expect(a.grid).not.toEqual(b.grid);
  });

  it('embeds the seed in the map id', () => {
    expect(generateMap({ environment: 'Desert', seed: 777 }).id).toBe('map-777');
  });

  it('clamps dimensions to the supported range', () => {
    const big = generateMap({ environment: 'Forest', seed: 1, width: 100, height: 100 });
    expect(big.width).toBe(40);
    expect(big.height).toBe(30);
    expect(big.grid).toHaveLength(30);
    expect(big.grid[0]).toHaveLength(40);

    const small = generateMap({ environment: 'Forest', seed: 1, width: 2, height: 2 });
    expect(small.width).toBe(10);
    expect(small.height).toBe(10);
  });

  it('places an entrance on outdoor maps', () => {
    const map = generateMap({ environment: 'Grassland', seed: 42 });
    const terrains = map.grid.flat().map((cell) => cell.terrain);
    expect(terrains).toContain('entrance');
  });

  it('uses dungeon generation with walls for urban maps', () => {
    const map = generateMap({ environment: 'Urban', seed: 42 });
    const terrains = new Set(map.grid.flat().map((cell) => cell.terrain));
    expect(terrains.has('wall')).toBe(true);
    expect(terrains.has('floor')).toBe(true);
  });
});

describe('TERRAIN_INFO', () => {
  it('covers every terrain type with a symbol, color, and label', () => {
    const allTerrains: TerrainType[] = [
      'floor', 'wall', 'water', 'difficult', 'door', 'trap', 'treasure',
      'entrance', 'exit', 'pillar', 'elevated', 'lava', 'ice', 'vegetation',
      'bridge', 'chasm', 'rubble', 'altar', 'stairs',
    ];
    for (const terrain of allTerrains) {
      expect(TERRAIN_INFO[terrain].symbol).toBeTruthy();
      expect(TERRAIN_INFO[terrain].color).toMatch(/^#/);
      expect(TERRAIN_INFO[terrain].label).toBeTruthy();
    }
  });
});
