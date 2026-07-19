import { EncounterMap, MapCell, TerrainType, Environment } from './types';
import { seededRandom } from './random';

// ─── Procedural Map Generator ────────────────────────────────────
// Uses BSP (Binary Space Partition) for dungeon rooms and
// cellular automata for organic cave/outdoor maps.

export type MapFeatureDensity = 'Sparse' | 'Balanced' | 'Dense';
export type MapTerrainVariety = 'Focused' | 'Varied' | 'Wild';

export interface MapOptions {
  width?: number;
  height?: number;
  environment: Environment;
  roomCount?: number;
  seed?: number;
  featureDensity?: MapFeatureDensity;
  terrainVariety?: MapTerrainVariety;
}

const FEATURE_CHANCE: Record<MapFeatureDensity, number> = {
  Sparse: 0.035,
  Balanced: 0.08,
  Dense: 0.14,
};

const DENSITY_MULTIPLIER: Record<MapFeatureDensity, number> = {
  Sparse: 0.45,
  Balanced: 1,
  Dense: 1.75,
};

function createGrid(w: number, h: number, fill: TerrainType): MapCell[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ terrain: fill }))
  );
}

// ─── BSP Dungeon Generator ───────────────────────────────────────

interface Rect {
  x: number; y: number; w: number; h: number;
}

function splitBSP(rect: Rect, minSize: number, rng: () => number): Rect[] {
  if (rect.w < minSize * 2 && rect.h < minSize * 2) return [rect];

  const splitH = rect.w > rect.h ? false : rect.h > rect.w ? true : rng() > 0.5;

  if (splitH && rect.h >= minSize * 2) {
    const split = minSize + Math.floor(rng() * (rect.h - minSize * 2));
    return [
      ...splitBSP({ x: rect.x, y: rect.y, w: rect.w, h: split }, minSize, rng),
      ...splitBSP({ x: rect.x, y: rect.y + split, w: rect.w, h: rect.h - split }, minSize, rng),
    ];
  } else if (!splitH && rect.w >= minSize * 2) {
    const split = minSize + Math.floor(rng() * (rect.w - minSize * 2));
    return [
      ...splitBSP({ x: rect.x, y: rect.y, w: split, h: rect.h }, minSize, rng),
      ...splitBSP({ x: rect.x + split, y: rect.y, w: rect.w - split, h: rect.h }, minSize, rng),
    ];
  }

  return [rect];
}

function carveRoom(grid: MapCell[][], rect: Rect, rng: () => number): Rect {
  const padX = 1 + Math.floor(rng() * Math.max(1, rect.w - 5));
  const padY = 1 + Math.floor(rng() * Math.max(1, rect.h - 5));
  const room: Rect = {
    x: rect.x + Math.min(padX, Math.floor(rect.w * 0.3)),
    y: rect.y + Math.min(padY, Math.floor(rect.h * 0.3)),
    w: Math.max(3, rect.w - 2 * Math.min(padX, Math.floor(rect.w * 0.3))),
    h: Math.max(3, rect.h - 2 * Math.min(padY, Math.floor(rect.h * 0.3))),
  };

  for (let y = room.y; y < room.y + room.h && y < grid.length; y++) {
    for (let x = room.x; x < room.x + room.w && x < grid[0].length; x++) {
      if (y >= 0 && x >= 0) grid[y][x].terrain = 'floor';
    }
  }

  return room;
}

function carveCorridor(grid: MapCell[][], from: Rect, to: Rect, rng: () => number) {
  let cx = Math.floor(from.x + from.w / 2);
  let cy = Math.floor(from.y + from.h / 2);
  const tx = Math.floor(to.x + to.w / 2);
  const ty = Math.floor(to.y + to.h / 2);

  // L-shaped corridor
  const horizontalFirst = rng() > 0.5;

  if (horizontalFirst) {
    while (cx !== tx) {
      if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
        grid[cy][cx].terrain = 'floor';
      }
      cx += cx < tx ? 1 : -1;
    }
    while (cy !== ty) {
      if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
        grid[cy][cx].terrain = 'floor';
      }
      cy += cy < ty ? 1 : -1;
    }
  } else {
    while (cy !== ty) {
      if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
        grid[cy][cx].terrain = 'floor';
      }
      cy += cy < ty ? 1 : -1;
    }
    while (cx !== tx) {
      if (cy >= 0 && cy < grid.length && cx >= 0 && cx < grid[0].length) {
        grid[cy][cx].terrain = 'floor';
      }
      cx += cx < tx ? 1 : -1;
    }
  }
}

function generateDungeon(
  w: number,
  h: number,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): MapCell[][] {
  const grid = createGrid(w, h, 'wall');
  const partitions = splitBSP({ x: 1, y: 1, w: w - 2, h: h - 2 }, 5, rng);
  const rooms = partitions.map(p => carveRoom(grid, p, rng));

  // Connect adjacent rooms
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(grid, rooms[i - 1], rooms[i], rng);
  }

  // Add doors at corridor-room junctions (heuristic)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x].terrain !== 'floor') continue;
      const adj = [
        grid[y - 1]?.[x]?.terrain,
        grid[y + 1]?.[x]?.terrain,
        grid[y]?.[x - 1]?.terrain,
        grid[y]?.[x + 1]?.terrain,
      ];
      const wallCount = adj.filter(t => t === 'wall').length;
      if (wallCount === 2 && rng() < 0.15 * DENSITY_MULTIPLIER[featureDensity]) {
        grid[y][x].terrain = 'door';
      }
    }
  }

  // Place entrance and exit
  if (rooms.length >= 2) {
    const entrance = rooms[0];
    const exit = rooms[rooms.length - 1];
    grid[Math.floor(entrance.y + entrance.h / 2)][Math.floor(entrance.x + entrance.w / 2)] = {
      terrain: 'entrance', label: 'Entrance',
    };
    grid[Math.floor(exit.y + exit.h / 2)][Math.floor(exit.x + exit.w / 2)] = {
      terrain: 'exit', label: 'Exit',
    };
  }

  // Scatter features
  for (const room of rooms) {
    if (rng() < 0.3 * DENSITY_MULTIPLIER[featureDensity]) {
      const px = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const py = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (py < h && px < w && grid[py][px].terrain === 'floor') {
        const alternatives: TerrainType[] = terrainVariety === 'Focused'
          ? ['pillar']
          : terrainVariety === 'Varied' ? ['pillar', 'rubble'] : ['pillar', 'rubble', 'altar'];
        grid[py][px].terrain = alternatives[Math.floor(rng() * alternatives.length)];
      }
    }
    if (rng() < 0.15 * DENSITY_MULTIPLIER[featureDensity]) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      if (ty < h && tx < w && grid[ty][tx].terrain === 'floor') {
        grid[ty][tx] = { terrain: 'trap', label: 'Trap' };
      }
    }
    if (rng() < 0.2 * DENSITY_MULTIPLIER[featureDensity]) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      if (ty < h && tx < w && grid[ty][tx].terrain === 'floor') {
        grid[ty][tx] = { terrain: 'treasure', label: 'Treasure' };
      }
    }
  }

  return grid;
}

// ─── Cellular Automata (Caves / Organic) ─────────────────────────

function generateCave(
  w: number,
  h: number,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): MapCell[][] {
  let grid = createGrid(w, h, 'wall');

  // Random fill (45% floor)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      grid[y][x].terrain = rng() < 0.45 ? 'floor' : 'wall';
    }
  }

  // Automata iterations
  for (let iter = 0; iter < 5; iter++) {
    const next = createGrid(w, h, 'wall');
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            if (grid[y + dy]?.[x + dx]?.terrain === 'wall') walls++;
          }
        }
        next[y][x].terrain = walls >= 5 ? 'wall' : 'floor';
      }
    }
    grid = next;
  }

  // Place entrance/exit on floor tiles
  const floors: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].terrain === 'floor') floors.push([y, x]);
    }
  }

  if (floors.length >= 2) {
    const [ey, ex] = floors[0];
    grid[ey][ex] = { terrain: 'entrance', label: 'Entrance' };
    const [xy, xx] = floors[floors.length - 1];
    grid[xy][xx] = { terrain: 'exit', label: 'Exit' };
  }

  const caveFeatures: TerrainType[] = terrainVariety === 'Focused'
    ? ['rubble']
    : terrainVariety === 'Varied' ? ['rubble', 'difficult'] : ['rubble', 'difficult', 'water'];
  for (const [y, x] of floors.slice(1, -1)) {
    if (grid[y][x].terrain === 'floor' && rng() < FEATURE_CHANCE[featureDensity] * 0.6) {
      grid[y][x].terrain = caveFeatures[Math.floor(rng() * caveFeatures.length)];
    }
  }

  return grid;
}

// ─── Outdoor / Arena Maps ────────────────────────────────────────

function generateOutdoor(
  w: number,
  h: number,
  env: Environment,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): MapCell[][] {
  const grid = createGrid(w, h, 'floor');

  // Scatter environment-appropriate features
  const featureChance = FEATURE_CHANCE[featureDensity];

  const terrainChoices: Partial<Record<Environment, TerrainType[]>> = {
    Forest: ['vegetation', 'difficult', 'water'],
    Swamp: ['water', 'difficult', 'vegetation'],
    Desert: ['difficult', 'elevated', 'rubble'],
    Arctic: ['ice', 'difficult', 'elevated'],
    Mountain: ['elevated', 'rubble', 'chasm'],
    Coastal: ['water', 'difficult', 'elevated'],
    Underwater: ['water', 'difficult', 'vegetation'],
    Urban: ['wall', 'pillar', 'rubble'],
    Hill: ['elevated', 'vegetation', 'difficult'],
    Grassland: ['vegetation', 'elevated', 'difficult'],
  };

  const pickTerrain = (): TerrainType => {
    const choices = terrainChoices[env] ?? ['difficult', 'elevated', 'rubble'];
    if (terrainVariety === 'Focused') return rng() < 0.88 ? choices[0] : choices[1];
    if (terrainVariety === 'Varied') return rng() < 0.58 ? choices[0] : choices[1 + Math.floor(rng() * 2)];
    return choices[Math.floor(rng() * choices.length)];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rng() > featureChance) continue;

      grid[y][x].terrain = pickTerrain();
    }
  }

  // Add a water feature for some environments
  const riverChance = featureDensity === 'Sparse' ? 0.25 : featureDensity === 'Dense' ? 0.85 : 0.6;
  if (['Swamp', 'Coastal', 'Forest'].includes(env) && rng() < riverChance) {
    const riverY = Math.floor(h * 0.3 + rng() * h * 0.4);
    for (let x = 0; x < w; x++) {
      const wobble = Math.floor(Math.sin(x * 0.5) * 2);
      const ry = riverY + wobble;
      if (ry >= 0 && ry < h) grid[ry][x].terrain = 'water';
      if (ry + 1 < h) grid[ry + 1][x].terrain = 'water';
      if (rng() < 0.15 && ry >= 0 && ry < h) {
        grid[ry][x] = { terrain: 'bridge', label: 'Bridge' };
      }
    }
  }

  // Place entrance
  grid[h - 1][Math.floor(w / 2)] = { terrain: 'entrance', label: 'Party Start' };

  return grid;
}

// ─── Public API ──────────────────────────────────────────────────

export function generateMap(options: MapOptions): EncounterMap {
  const {
    width = 24,
    height = 18,
    environment,
    seed = Date.now(),
    featureDensity = 'Balanced',
    terrainVariety = 'Varied',
  } = options;

  const rng = seededRandom(seed);
  const w = Math.max(10, Math.min(40, width));
  const h = Math.max(10, Math.min(30, height));

  let grid: MapCell[][];
  let name: string;

  // Choose generation strategy based on environment
  switch (environment) {
    case 'Underdark':
      grid = generateCave(w, h, rng, featureDensity, terrainVariety);
      name = 'Underdark Cavern';
      break;
    case 'Mountain':
      grid = rng() < 0.5
        ? generateCave(w, h, rng, featureDensity, terrainVariety)
        : generateOutdoor(w, h, environment, rng, featureDensity, terrainVariety);
      name = rng() < 0.5 ? 'Mountain Cave' : 'Mountain Pass';
      break;
    case 'Urban':
      grid = generateDungeon(w, h, rng, featureDensity, terrainVariety);
      name = 'City Ruins';
      break;
    case 'Planar':
      grid = generateCave(w, h, rng, featureDensity, terrainVariety);
      name = 'Planar Rift';
      break;
    case 'Forest':
    case 'Grassland':
    case 'Hill':
    case 'Desert':
    case 'Arctic':
    case 'Coastal':
    case 'Swamp':
    case 'Underwater':
      grid = generateOutdoor(w, h, environment, rng, featureDensity, terrainVariety);
      name = `${environment} Battlefield`;
      break;
    default:
      grid = generateDungeon(w, h, rng, featureDensity, terrainVariety);
      name = 'Dungeon';
  }

  return {
    id: `map-${seed}`,
    name,
    width: w,
    height: h,
    environment,
    grid,
  };
}

// Terrain display metadata for the UI
export const TERRAIN_INFO: Record<TerrainType, { symbol: string; color: string; label: string }> = {
  floor:      { symbol: '·', color: '#d4c4a1', label: 'Floor' },
  wall:       { symbol: '█', color: '#4a4a4a', label: 'Wall' },
  water:      { symbol: '~', color: '#4a90d9', label: 'Water' },
  difficult:  { symbol: '░', color: '#8b7355', label: 'Difficult Terrain' },
  door:       { symbol: '▯', color: '#8b6914', label: 'Door' },
  trap:       { symbol: '⚠', color: '#d4a017', label: 'Trap' },
  treasure:   { symbol: '✦', color: '#f0c040', label: 'Treasure' },
  entrance:   { symbol: '▶', color: '#4caf50', label: 'Entrance' },
  exit:       { symbol: '◀', color: '#f44336', label: 'Exit' },
  pillar:     { symbol: '◯', color: '#9e9e9e', label: 'Pillar' },
  elevated:   { symbol: '▲', color: '#7d6b5d', label: 'Elevated' },
  lava:       { symbol: '≈', color: '#ff4500', label: 'Lava' },
  ice:        { symbol: '◇', color: '#b0e0e6', label: 'Ice' },
  vegetation: { symbol: '♣', color: '#2e8b57', label: 'Vegetation' },
  bridge:     { symbol: '═', color: '#8b6914', label: 'Bridge' },
  chasm:      { symbol: '▼', color: '#1a1a1a', label: 'Chasm' },
  rubble:     { symbol: '▒', color: '#808080', label: 'Rubble' },
  altar:      { symbol: '†', color: '#9932cc', label: 'Altar' },
  stairs:     { symbol: '⊞', color: '#696969', label: 'Stairs' },
};
