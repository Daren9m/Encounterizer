import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import type { EncounterMap, TerrainType } from '@/lib/types';

// ─── Layout & Scale (spec 2026-07-19-map-layouts-design) ─────────

const BLOCKED: ReadonlySet<TerrainType> = new Set(['wall', 'pillar', 'chasm', 'lava']);

function findTerrain(map: EncounterMap, terrain: TerrainType): [number, number] | null {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x].terrain === terrain) return [x, y];
    }
  }
  return null;
}

function countTerrain(map: EncounterMap, terrain: TerrainType): number {
  return map.grid.flat().filter(cell => cell.terrain === terrain).length;
}

function reachableFrom(map: EncounterMap, start: [number, number]): Set<number> {
  const idx = (x: number, y: number) => y * map.width + x;
  const seen = new Set<number>([idx(...start)]);
  const queue: [number, number][] = [start];
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (seen.has(idx(nx, ny)) || BLOCKED.has(map.grid[ny][nx].terrain)) continue;
      seen.add(idx(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('scale tiers', () => {
  it('derives dimensions per tier with seeded jitter inside the band', () => {
    const targets = {
      Skirmish: [16, 12], Standard: [26, 20], Large: [40, 30], Massive: [60, 45],
    } as const;
    for (const [scale, [tw, th]] of Object.entries(targets)) {
      for (const seed of [1, 2, 3]) {
        const map = generateMap({ environment: 'Forest', scale: scale as keyof typeof targets, seed });
        expect(map.width).toBeGreaterThanOrEqual(Math.max(10, Math.floor(tw * 0.9)));
        expect(map.width).toBeLessThanOrEqual(Math.min(60, Math.ceil(tw * 1.1)));
        expect(map.height).toBeGreaterThanOrEqual(Math.max(10, Math.floor(th * 0.9)));
        expect(map.height).toBeLessThanOrEqual(Math.min(45, Math.ceil(th * 1.1)));
      }
    }
  });

  it('varies dimensions across seeds at the same tier', () => {
    const dims = new Set(
      Array.from({ length: 12 }, (_, i) =>
        generateMap({ environment: 'Forest', scale: 'Standard', seed: i + 1 }))
        .map(m => `${m.width}x${m.height}`),
    );
    expect(dims.size).toBeGreaterThan(1);
  });

  it('honors explicit width/height exactly, ignoring scale', () => {
    const map = generateMap({ environment: 'Forest', seed: 9, width: 33, height: 21, scale: 'Massive' });
    expect(map.width).toBe(33);
    expect(map.height).toBe(21);
  });

  it('clamps to the new 60x45 ceiling', () => {
    const map = generateMap({ environment: 'Forest', seed: 1, width: 100, height: 100 });
    expect(map.width).toBe(60);
    expect(map.height).toBe(45);
  });

  it('echoes layout and scale in genOptions', () => {
    const map = generateMap({ environment: 'Urban', seed: 5, layout: 'dungeon', scale: 'Large' });
    expect(map.genOptions?.layout).toBe('dungeon');
    expect(map.genOptions?.scale).toBe('Large');
  });
});

describe('layout selection', () => {
  it('generates a dungeon in any environment when asked', () => {
    const map = generateMap({ environment: 'Forest', seed: 42, layout: 'dungeon', width: 32, height: 24 });
    expect(countTerrain(map, 'wall')).toBeGreaterThan(50);
    expect(findTerrain(map, 'stairs')).not.toBeNull();
    expect(map.rooms!.some(r => r.tags.includes('boss'))).toBe(true);
  });

  it('auto-maps Any to dungeon and Urban to city', () => {
    const dungeon = generateMap({ environment: 'Any', seed: 42, width: 32, height: 24 });
    expect(findTerrain(dungeon, 'stairs')).not.toBeNull();

    const city = generateMap({ environment: 'Urban', seed: 42, width: 32, height: 24 });
    expect(city.genOptions?.layout ?? 'auto').not.toBe('dungeon');
    expect(city.name).not.toBe('City Ruins');
  });
});

describe('city streets generator', () => {
  const CITY = generateMap({ environment: 'Urban', seed: 42, layout: 'city', width: 32, height: 24 });

  it('builds solid building masses with street-facing doors', () => {
    expect(countTerrain(CITY, 'wall')).toBeGreaterThan(60);
    expect(countTerrain(CITY, 'door')).toBeGreaterThan(2);
  });

  it('keeps every open cell reachable from the entrance (street connectivity)', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const city = generateMap({ environment: 'Urban', seed, layout: 'city' });
      const entrance = findTerrain(city, 'entrance');
      expect(entrance, `seed ${seed} has an entrance`).not.toBeNull();
      const reached = reachableFrom(city, entrance!);
      let open = 0;
      for (let y = 0; y < city.height; y++) {
        for (let x = 0; x < city.width; x++) {
          if (!BLOCKED.has(city.grid[y][x].terrain)) open++;
        }
      }
      expect(reached.size, `seed ${seed}: streets fragmented`).toBe(open);
    }
  });

  it('tags party and monster spawn zones plus at least one landmark', () => {
    const tags = CITY.rooms!.flatMap(r => r.tags);
    expect(tags).toContain('spawn:party');
    expect(tags).toContain('spawn:monster');
    expect(tags).toContain('landmark');
  });

  it('flavors zones with city archetypes', () => {
    for (const room of CITY.rooms!) {
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.readAloud.length).toBeGreaterThan(0);
    }
  });
});
