import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import type { EncounterMap, MapRoom, TerrainType } from '@/lib/types';

// Terrain a creature cannot walk through. Water is swimmable and doors
// open, so neither blocks the connectivity guarantee.
const BLOCKED: ReadonlySet<TerrainType> = new Set(['wall', 'pillar', 'chasm', 'lava']);

function findTerrain(map: EncounterMap, terrain: TerrainType): [number, number] | null {
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.grid[y][x].terrain === terrain) return [x, y];
    }
  }
  return null;
}

/** 4-connected flood fill over passable cells; returns reached cell indices. */
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

/** Cell indices belonging to a room: explicit cells, else its bounding box. */
function roomCells(map: EncounterMap, room: MapRoom): number[] {
  if (room.cells && room.cells.length > 0) return room.cells;
  const cells: number[] = [];
  for (let y = room.bounds.y; y < room.bounds.y + room.bounds.h; y++) {
    for (let x = room.bounds.x; x < room.bounds.x + room.bounds.w; x++) {
      cells.push(y * map.width + x);
    }
  }
  return cells;
}

describe('generateMap rooms', () => {
  it('returns rooms with spawn zones for every structure kind', () => {
    for (const environment of ['Urban', 'Underdark', 'Grassland'] as const) {
      const map = generateMap({ environment, seed: 42 });
      expect(map.rooms, `${environment} should have rooms`).toBeDefined();
      expect(map.rooms!.length).toBeGreaterThan(0);
      const tags = map.rooms!.flatMap((room) => room.tags);
      expect(tags, `${environment} needs a party spawn`).toContain('spawn:party');
      expect(tags, `${environment} needs a monster spawn`).toContain('spawn:monster');
    }
  });

  it('echoes the seed and generation options on the map', () => {
    const map = generateMap({
      environment: 'Forest', seed: 4242,
      featureDensity: 'Dense', terrainVariety: 'Wild',
    });
    expect(map.seed).toBe(4242);
    expect(map.genOptions).toEqual({ featureDensity: 'Dense', terrainVariety: 'Wild', scale: 'Standard' });

    const withRooms = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 7, roomCount: 6 });
    expect(withRooms.genOptions?.roomCount).toBe(6);
  });

  it('honors roomCount within a tolerance of 2 on dungeon maps', () => {
    for (const seed of [11, 22, 33]) {
      const map = generateMap({ environment: 'Urban', layout: 'dungeon', seed, width: 32, height: 24, roomCount: 8 });
      const carved = map.rooms!.filter((room) => room.kind === 'room');
      expect(carved.length).toBeGreaterThanOrEqual(6);
      expect(carved.length).toBeLessThanOrEqual(10);
    }
  });

  it('numbers rooms sequentially and keeps bounds inside the map', () => {
    const map = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 99 });
    map.rooms!.forEach((room, i) => {
      expect(room.id).toBe(i + 1);
      expect(room.bounds.x).toBeGreaterThanOrEqual(0);
      expect(room.bounds.y).toBeGreaterThanOrEqual(0);
      expect(room.bounds.x + room.bounds.w).toBeLessThanOrEqual(map.width);
      expect(room.bounds.y + room.bounds.h).toBeLessThanOrEqual(map.height);
    });
  });

  it('tags entrance, exit, and boss rooms on dungeon maps', () => {
    const map = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 42, width: 32, height: 24 });
    const tags = map.rooms!.flatMap((room) => room.tags);
    expect(tags).toContain('entrance');
    expect(tags).toContain('exit');
    expect(tags).toContain('boss');
  });

  it('keeps entrance, exit, and every room mutually reachable', () => {
    for (const environment of ['Urban', 'Underdark', 'Mountain'] as const) {
      for (let seed = 1; seed <= 25; seed++) {
        const map = generateMap({ environment, seed });
        const entrance = findTerrain(map, 'entrance');
        expect(entrance, `${environment} seed ${seed} has an entrance`).not.toBeNull();
        const reached = reachableFrom(map, entrance!);

        const exit = findTerrain(map, 'exit');
        if (exit) {
          expect(
            reached.has(exit[1] * map.width + exit[0]),
            `${environment} seed ${seed}: exit unreachable from entrance`,
          ).toBe(true);
        }

        for (const room of map.rooms!) {
          const cells = roomCells(map, room);
          expect(
            cells.some((cell) => reached.has(cell)),
            `${environment} seed ${seed}: room ${room.id} (${room.kind}) unreachable`,
          ).toBe(true);
        }
      }
    }
  });

  it('places stairs on dungeon maps', () => {
    const map = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 42, width: 32, height: 24 });
    expect(findTerrain(map, 'stairs')).not.toBeNull();
  });

  it('can produce lava on Planar cave maps with a Wild terrain mix', () => {
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const hasLava = seeds.some((seed) => findTerrain(generateMap({
      environment: 'Planar', seed, featureDensity: 'Dense', terrainVariety: 'Wild',
    }), 'lava') !== null);
    expect(hasLava).toBe(true);
  });

  it('provides spawn zones even on the smallest dungeon maps', () => {
    const map = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 5, width: 10, height: 10 });
    const tags = map.rooms!.flatMap((room) => room.tags);
    expect(tags).toContain('spawn:party');
    expect(tags).toContain('spawn:monster');
    expect(findTerrain(map, 'entrance')).not.toBeNull();
    expect(findTerrain(map, 'exit')).not.toBeNull();
  });
});

describe('room flavor', () => {
  it('fills name, purpose, and read-aloud text for every room', () => {
    for (const environment of ['Urban', 'Underdark', 'Swamp'] as const) {
      const map = generateMap({ environment, seed: 1234 });
      for (const room of map.rooms!) {
        expect(room.name.length, `${environment} room ${room.id} name`).toBeGreaterThan(0);
        expect(room.purpose.length, `${environment} room ${room.id} purpose`).toBeGreaterThan(0);
        expect(room.readAloud.length, `${environment} room ${room.id} readAloud`).toBeGreaterThan(0);
      }
    }
  });

  it('varies flavor across seeds', () => {
    const a = generateMap({ environment: 'Urban', seed: 1 });
    const b = generateMap({ environment: 'Urban', seed: 2 });
    const flavorOf = (map: EncounterMap) =>
      JSON.stringify(map.rooms!.map((room) => [room.name, room.readAloud]));
    expect(flavorOf(a)).not.toBe(flavorOf(b));
  });

  it('remains deterministic including room flavor', () => {
    const a = generateMap({ environment: 'Underdark', seed: 777 });
    const b = generateMap({ environment: 'Underdark', seed: 777 });
    expect(a).toEqual(b);
  });
});
