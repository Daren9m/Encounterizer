import { EncounterMap, MapCell, TerrainType, Environment } from './types';
import { seededRandom } from './random';

// ─── Procedural Map Generator ────────────────────────────────────
// Uses BSP (Binary Space Partition) for dungeon rooms and
// cellular automata for organic cave/outdoor maps.

interface MapOptions {
  width?: number;
  height?: number;
  environment: Environment;
  roomCount?: number;
  seed?: number;
}

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

function generateDungeon(w: number, h: number, rng: () => number): MapCell[][] {
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
      if (wallCount === 2 && rng() < 0.15) {
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
    if (rng() < 0.3) {
      const px = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 2));
      const py = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (py < h && px < w && grid[py][px].terrain === 'floor') {
        grid[py][px].terrain = 'pillar';
      }
    }
    if (rng() < 0.15) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      if (ty < h && tx < w && grid[ty][tx].terrain === 'floor') {
        grid[ty][tx] = { terrain: 'trap', label: 'Trap' };
      }
    }
    if (rng() < 0.2) {
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

function generateCave(w: number, h: number, rng: () => number): MapCell[][] {
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

  return grid;
}

// ─── Outdoor / Arena Maps ────────────────────────────────────────

function generateOutdoor(
  w: number, h: number, env: Environment, rng: () => number
): MapCell[][] {
  const grid = createGrid(w, h, 'floor');

  // Scatter environment-appropriate features
  const featureChance = 0.08;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rng() > featureChance) continue;

      // Pick terrain based on environment
      switch (env) {
        case 'Forest':
          grid[y][x].terrain = rng() < 0.7 ? 'vegetation' : 'difficult';
          break;
        case 'Swamp':
          grid[y][x].terrain = rng() < 0.5 ? 'water' : 'difficult';
          break;
        case 'Desert':
          grid[y][x].terrain = rng() < 0.5 ? 'difficult' : 'elevated';
          break;
        case 'Arctic':
          grid[y][x].terrain = rng() < 0.5 ? 'ice' : 'difficult';
          break;
        case 'Mountain':
          grid[y][x].terrain = rng() < 0.4 ? 'elevated' : rng() < 0.5 ? 'chasm' : 'rubble';
          break;
        case 'Coastal':
        case 'Underwater':
          grid[y][x].terrain = rng() < 0.6 ? 'water' : 'difficult';
          break;
        case 'Urban':
          grid[y][x].terrain = rng() < 0.5 ? 'wall' : 'pillar';
          break;
        case 'Hill':
        case 'Grassland':
          grid[y][x].terrain = rng() < 0.5 ? 'elevated' : 'vegetation';
          break;
        default:
          grid[y][x].terrain = 'difficult';
      }
    }
  }

  // Add a water feature for some environments
  if (['Swamp', 'Coastal', 'Forest'].includes(env) && rng() < 0.6) {
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
  } = options;

  const rng = seededRandom(seed);
  const w = Math.max(10, Math.min(40, width));
  const h = Math.max(10, Math.min(30, height));

  let grid: MapCell[][];
  let name: string;

  // Choose generation strategy based on environment
  switch (environment) {
    case 'Underdark':
      grid = generateCave(w, h, rng);
      name = 'Underdark Cavern';
      break;
    case 'Mountain':
      grid = rng() < 0.5 ? generateCave(w, h, rng) : generateOutdoor(w, h, environment, rng);
      name = rng() < 0.5 ? 'Mountain Cave' : 'Mountain Pass';
      break;
    case 'Urban':
      grid = generateDungeon(w, h, rng);
      name = 'City Ruins';
      break;
    case 'Planar':
      grid = generateCave(w, h, rng);
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
      grid = generateOutdoor(w, h, environment, rng);
      name = `${environment} Battlefield`;
      break;
    default:
      grid = generateDungeon(w, h, rng);
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
