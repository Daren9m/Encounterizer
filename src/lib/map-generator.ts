import type {
  EncounterMap, MapCell, MapFeatureDensity, MapLayout, MapRoom, MapRoomTag,
  MapScale, MapTerrainVariety, TerrainType, Environment,
} from './types';
import { seededRandom } from './random';
import { FLAVOR_STREAM_SALT, flavorRooms, type MapStructure } from './map-flavor';

// ─── Procedural Map Generator ────────────────────────────────────
// BSP dungeons, cellular-automata caverns, outdoor scatter fields,
// and city street lattices, selected by layout and flavored by
// environment.
//
// FROZEN GRID DRAW ORDER — shareable ?seed= links replay the grid
// stream, so the rng draw sequence below is a compatibility contract
// (like the generator registry order in noncombat/generate.ts).
// Per map: (1) layout resolution (Mountain auto coin flip only),
// (2) dimension jitter (scale mode only — skipped entirely when
// width/height are given), (3) layout generation — BSP splits +
// carving + corridors / CA fill + smoothing / outdoor scatter +
// river / city streets + blocks, (4) feature scatter (caves scatter
// BEFORE connectivity so hazards can never sever the map), (5) doors,
// (6) entrance/exit/stairs. Connectivity enforcement, chamber
// detection, zone building, and room tagging draw NOTHING. Room
// flavor draws from a SEPARATE stream (see map-flavor.ts), and token
// placement (token-placement.ts) from a third — neither can shift
// the grid. Change the order above only with a versioning plan for
// existing links; the grid-hash tests pin it.

export type { MapFeatureDensity, MapLayout, MapScale, MapTerrainVariety } from './types';

export interface MapOptions {
  /** Exact dimensions — legacy links and JSON callers. When either is
   *  set, `scale` is ignored and no jitter draws occur. */
  width?: number;
  height?: number;
  environment: Environment;
  roomCount?: number;
  seed?: number;
  featureDensity?: MapFeatureDensity;
  terrainVariety?: MapTerrainVariety;
  /** Which algorithm draws the map; 'auto' lets environment decide. */
  layout?: MapLayout;
  /** Battle-scale tier used when width/height are absent. */
  scale?: MapScale;
}

/** Engine ceiling — exports stay VTT-exact up to here (4096px cap). */
export const MAX_MAP_WIDTH = 60;
export const MAX_MAP_HEIGHT = 45;

const SCALE_DIMS: Record<MapScale, readonly [number, number]> = {
  Skirmish: [16, 12],
  Standard: [26, 20],
  Large: [40, 30],
  Massive: [60, 45],
};

// UI option lists (noncombat's THEME_OPTIONS precedent): one source
// for both the maps page and the encounter builder.
// 'building' joins when its generator lands (milestone #8 PR 2).
export const MAP_LAYOUT_OPTIONS: Array<{ value: MapLayout; label: string; hint: string }> = [
  { value: 'auto', label: 'Auto', hint: 'Let the environment decide' },
  { value: 'dungeon', label: 'Dungeon', hint: 'Rooms, corridors, and doors' },
  { value: 'cavern', label: 'Cavern', hint: 'Organic cave systems' },
  { value: 'wilderness', label: 'Wilderness', hint: 'Open terrain and features' },
  { value: 'city', label: 'City Streets', hint: 'Blocks, plazas, and locked doors' },
];

export const MAP_SCALE_OPTIONS: Array<{ value: MapScale; label: string; hint: string }> = [
  { value: 'Skirmish', label: 'Skirmish', hint: 'about 16×12 cells' },
  { value: 'Standard', label: 'Standard', hint: 'about 26×20 cells' },
  { value: 'Large', label: 'Large', hint: 'about 40×30 cells' },
  { value: 'Massive', label: 'Massive', hint: 'about 60×45 cells' },
];

export const isMapLayout = (v: unknown): v is MapLayout =>
  MAP_LAYOUT_OPTIONS.some(o => o.value === v);
export const isMapScale = (v: unknown): v is MapScale =>
  MAP_SCALE_OPTIONS.some(o => o.value === v);

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

/** Terrain no creature can occupy or walk through. */
export const IMPASSABLE_TERRAIN: ReadonlySet<TerrainType> = new Set([
  'wall', 'pillar', 'chasm', 'lava',
]);

const isPassable = (t: TerrainType) => !IMPASSABLE_TERRAIN.has(t);

function createGrid(w: number, h: number, fill: TerrainType): MapCell[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ terrain: fill }))
  );
}

/** Room data before flavor: geometry and tags only. */
interface ProtoRoom {
  kind: MapRoom['kind'];
  bounds: Rect;
  cells?: number[];
  tags: MapRoomTag[];
}

interface GenResult {
  grid: MapCell[][];
  rooms: ProtoRoom[];
}

/** Zone of passable cells within Chebyshev distance 2 of a marker cell —
 *  the fallback spawn area when no real room exists for a role. */
function zoneAround(
  grid: MapCell[][], cx: number, cy: number, w: number, h: number, tags: MapRoomTag[],
): ProtoRoom {
  const cells: number[] = [];
  let minX = cx, minY = cy, maxX = cx, maxY = cy;
  for (let y = Math.max(0, cy - 2); y <= Math.min(h - 1, cy + 2); y++) {
    for (let x = Math.max(0, cx - 2); x <= Math.min(w - 1, cx + 2); x++) {
      if (!isPassable(grid[y][x].terrain)) continue;
      cells.push(y * w + x);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return {
    kind: 'zone',
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    cells,
    tags,
  };
}

// ─── BSP Dungeon Generator ───────────────────────────────────────

interface Rect {
  x: number; y: number; w: number; h: number;
}

/** Split the largest splittable partition until `target` partitions exist
 *  (or nothing can split at `minSize`). Partition selection is
 *  deterministic; only split axis ties and positions draw from the rng. */
function splitBSPTarget(rect: Rect, minSize: number, target: number, rng: () => number): Rect[] {
  const parts: Rect[] = [rect];
  while (parts.length < target) {
    let best = -1;
    let bestArea = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.w < minSize * 2 && p.h < minSize * 2) continue;
      const area = p.w * p.h;
      if (area > bestArea) { bestArea = area; best = i; }
    }
    if (best < 0) break;

    const p = parts[best];
    const canH = p.h >= minSize * 2;
    const canV = p.w >= minSize * 2;
    const splitH = canH && canV
      ? (p.h > p.w ? true : p.w > p.h ? false : rng() > 0.5)
      : canH;

    if (splitH) {
      const split = minSize + Math.floor(rng() * (p.h - minSize * 2 + 1));
      parts.splice(best, 1,
        { x: p.x, y: p.y, w: p.w, h: split },
        { x: p.x, y: p.y + split, w: p.w, h: p.h - split },
      );
    } else {
      const split = minSize + Math.floor(rng() * (p.w - minSize * 2 + 1));
      parts.splice(best, 1,
        { x: p.x, y: p.y, w: split, h: p.h },
        { x: p.x + split, y: p.y, w: p.w - split, h: p.h },
      );
    }
  }
  return parts;
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

/** Place a stairs cell on the first plain-floor neighbor of a marker. */
function placeStairsNear(grid: MapCell[][], cx: number, cy: number, label: string) {
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    const cell = grid[cy + dy]?.[cx + dx];
    if (cell?.terrain === 'floor') {
      cell.terrain = 'stairs';
      cell.label = label;
      return;
    }
  }
}

function generateDungeon(
  w: number,
  h: number,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
  roomCount: number,
): GenResult {
  const grid = createGrid(w, h, 'wall');
  const partitions = splitBSPTarget({ x: 1, y: 1, w: w - 2, h: h - 2 }, 5, roomCount, rng);
  const rects = partitions.map(p => carveRoom(grid, p, rng));

  // Connect adjacent rooms
  for (let i = 1; i < rects.length; i++) {
    carveCorridor(grid, rects[i - 1], rects[i], rng);
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

  // Entrance, exit, and connecting stairs
  const roomTags: Set<MapRoomTag>[] = rects.map(() => new Set());
  let entranceX: number, entranceY: number, exitX: number, exitY: number;
  if (rects.length >= 2) {
    const entrance = rects[0];
    const exit = rects[rects.length - 1];
    entranceX = Math.floor(entrance.x + entrance.w / 2);
    entranceY = Math.floor(entrance.y + entrance.h / 2);
    exitX = Math.floor(exit.x + exit.w / 2);
    exitY = Math.floor(exit.y + exit.h / 2);
    roomTags[rects.length - 1].add('exit');
    roomTags[rects.length - 1].add('spawn:monster');
  } else {
    // Degenerate single-room map: opposite corners of the one room.
    const only = rects[0];
    entranceX = only.x;
    entranceY = only.y;
    exitX = Math.min(w - 1, only.x + only.w - 1);
    exitY = Math.min(h - 1, only.y + only.h - 1);
  }
  roomTags[0].add('entrance');
  roomTags[0].add('spawn:party');
  grid[entranceY][entranceX] = { terrain: 'entrance', label: 'Entrance' };
  grid[exitY][exitX] = { terrain: 'exit', label: 'Exit' };
  placeStairsNear(grid, entranceX, entranceY, 'Stairs Up');
  placeStairsNear(grid, exitX, exitY, 'Stairs Down');

  // Boss room: largest carved room that is not the entrance; the far
  // half of the room chain belongs to the defenders.
  if (rects.length >= 2) {
    let bossIdx = -1;
    let bossArea = 0;
    for (let i = 1; i < rects.length; i++) {
      const area = rects[i].w * rects[i].h;
      if (area > bossArea) { bossArea = area; bossIdx = i; }
    }
    if (bossIdx >= 0) {
      roomTags[bossIdx].add('boss');
      roomTags[bossIdx].add('spawn:monster');
    }
    for (let i = Math.ceil(rects.length / 2); i < rects.length; i++) {
      roomTags[i].add('spawn:monster');
    }
  }

  // Scatter features
  rects.forEach((room, i) => {
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
        roomTags[i].add('trap');
      }
    }
    if (rng() < 0.2 * DENSITY_MULTIPLIER[featureDensity]) {
      const tx = room.x + Math.floor(rng() * room.w);
      const ty = room.y + Math.floor(rng() * room.h);
      if (ty < h && tx < w && grid[ty][tx].terrain === 'floor') {
        grid[ty][tx] = { terrain: 'treasure', label: 'Treasure' };
        roomTags[i].add('treasure');
      }
    }
  });

  const rooms: ProtoRoom[] = rects.map((r, i) => ({
    kind: 'room',
    bounds: r,
    tags: [...roomTags[i]],
  }));

  // A one-room dungeon still needs somewhere for the opposition.
  if (!rooms.some(r => r.tags.includes('spawn:monster'))) {
    rooms.push(zoneAround(grid, exitX, exitY, w, h, ['exit', 'spawn:monster']));
  }

  return { grid, rooms };
}

// ─── Cellular Automata (Caves / Organic) ─────────────────────────

function generateCave(
  w: number,
  h: number,
  env: Environment,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): GenResult {
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

  // Feature scatter BEFORE connectivity: hazards (lava) count as
  // impassable, so carving connectivity afterwards guarantees the kept
  // component is traversable no matter where hazards landed.
  const caveFeatures: TerrainType[] = terrainVariety === 'Focused'
    ? ['rubble']
    : terrainVariety === 'Varied'
      ? ['rubble', 'difficult']
      : env === 'Planar' || env === 'Mountain'
        ? ['rubble', 'difficult', 'water', 'lava']
        : ['rubble', 'difficult', 'water'];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x].terrain !== 'floor') continue;
      if (rng() < FEATURE_CHANCE[featureDensity] * 0.6) {
        grid[y][x].terrain = caveFeatures[Math.floor(rng() * caveFeatures.length)];
      }
    }
  }

  // Connectivity: keep only the largest open component (no rng draws).
  const idx = (x: number, y: number) => y * w + x;
  const componentOf = new Int32Array(w * h).fill(-1);
  const componentSizes: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (componentOf[idx(x, y)] !== -1 || !isPassable(grid[y][x].terrain)) continue;
      const component = componentSizes.length;
      let size = 0;
      const stack = [[x, y]];
      componentOf[idx(x, y)] = component;
      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        size++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (componentOf[idx(nx, ny)] !== -1 || !isPassable(grid[ny][nx].terrain)) continue;
          componentOf[idx(nx, ny)] = component;
          stack.push([nx, ny]);
        }
      }
      componentSizes.push(size);
    }
  }
  let largest = 0;
  for (let i = 1; i < componentSizes.length; i++) {
    if (componentSizes[i] > componentSizes[largest]) largest = i;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = componentOf[idx(x, y)];
      if (c !== -1 && c !== largest) grid[y][x].terrain = 'wall';
    }
  }

  // Safety net for degenerate automata output: carve an open block.
  if (componentSizes.length === 0 || componentSizes[largest] < 4) {
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let x = cx - 2; x <= cx + 2; x++) {
        grid[y][x].terrain = 'floor';
      }
    }
  }

  // Entrance/exit on the first/last plain floor cells of the component.
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
  const entranceCell = floors.length >= 2 ? idx(floors[0][1], floors[0][0]) : -1;
  const exitCell = floors.length >= 2 ? idx(floors[floors.length - 1][1], floors[floors.length - 1][0]) : -1;

  // Chamber detection (no rng draws): cores are open cells whose whole
  // 3x3 neighborhood is open; core regions of 6+ cells become chambers.
  const isOpen = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && isPassable(grid[y][x].terrain);
  const isCore = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!isOpen(x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  const chamberOf = new Int32Array(w * h).fill(-1);
  const chambers: number[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (chamberOf[idx(x, y)] !== -1 || !isCore(x, y)) continue;
      const cells: number[] = [];
      const stack = [[x, y]];
      chamberOf[idx(x, y)] = chambers.length;
      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        cells.push(idx(px, py));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx;
          const ny = py + dy;
          if (!isCore(nx, ny) || chamberOf[idx(nx, ny)] !== -1) continue;
          chamberOf[idx(nx, ny)] = chambers.length;
          stack.push([nx, ny]);
        }
      }
      if (cells.length >= 6) chambers.push(cells.sort((a, b) => a - b));
    }
  }

  // Tag chambers: entrance chamber hosts the party; distant chambers and
  // the largest chamber host the opposition.
  const rooms: ProtoRoom[] = chambers.map(cells => {
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (const cell of cells) {
      const x = cell % w;
      const y = Math.floor(cell / w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return {
      kind: 'chamber' as const,
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      cells,
      tags: [] as MapRoomTag[],
    };
  });

  const entranceRoom = entranceCell >= 0
    ? rooms.find(r => r.cells!.includes(entranceCell))
    : undefined;
  if (entranceRoom) {
    entranceRoom.tags.push('entrance', 'spawn:party');
  } else if (entranceCell >= 0) {
    rooms.unshift(zoneAround(
      grid, entranceCell % w, Math.floor(entranceCell / w), w, h, ['entrance', 'spawn:party'],
    ));
  }

  // BFS distances from the entrance over passable cells.
  if (entranceCell >= 0) {
    const dist = new Int32Array(w * h).fill(-1);
    dist[entranceCell] = 0;
    let frontier = [entranceCell];
    let maxDist = 0;
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const cell of frontier) {
        const x = cell % w;
        const y = Math.floor(cell / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (!isOpen(nx, ny) || dist[idx(nx, ny)] !== -1) continue;
          dist[idx(nx, ny)] = dist[cell] + 1;
          maxDist = Math.max(maxDist, dist[cell] + 1);
          next.push(idx(nx, ny));
        }
      }
      frontier = next;
    }

    let bossRoom: ProtoRoom | undefined;
    let bossSize = 0;
    for (const room of rooms) {
      if (room === entranceRoom || !room.cells) continue;
      const roomDist = Math.min(...room.cells.map(c => (dist[c] === -1 ? Infinity : dist[c])));
      if (roomDist !== Infinity && roomDist >= 0.6 * maxDist) {
        room.tags.push('spawn:monster');
      }
      if (room.cells.length > bossSize) {
        bossSize = room.cells.length;
        bossRoom = room;
      }
    }
    if (bossRoom) {
      if (!bossRoom.tags.includes('spawn:monster')) bossRoom.tags.push('spawn:monster');
      bossRoom.tags.push('boss');
    }
  }

  if (!rooms.some(r => r.tags.includes('spawn:monster')) && exitCell >= 0) {
    rooms.push(zoneAround(
      grid, exitCell % w, Math.floor(exitCell / w), w, h, ['exit', 'spawn:monster'],
    ));
  }

  return { grid, rooms };
}

// ─── Outdoor / Arena Maps ────────────────────────────────────────

function generateOutdoor(
  w: number,
  h: number,
  env: Environment,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): GenResult {
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
  const riverCells: number[] = [];
  const riverChance = featureDensity === 'Sparse' ? 0.25 : featureDensity === 'Dense' ? 0.85 : 0.6;
  if (['Swamp', 'Coastal', 'Forest'].includes(env) && rng() < riverChance) {
    const riverY = Math.floor(h * 0.3 + rng() * h * 0.4);
    for (let x = 0; x < w; x++) {
      const wobble = Math.floor(Math.sin(x * 0.5) * 2);
      const ry = riverY + wobble;
      if (ry >= 0 && ry < h) {
        grid[ry][x].terrain = 'water';
        riverCells.push(ry * w + x);
      }
      if (ry + 1 < h) {
        grid[ry + 1][x].terrain = 'water';
        riverCells.push((ry + 1) * w + x);
      }
      if (rng() < 0.15 && ry >= 0 && ry < h) {
        grid[ry][x] = { terrain: 'bridge', label: 'Bridge' };
      }
    }
  }

  // Place entrance
  grid[h - 1][Math.floor(w / 2)] = { terrain: 'entrance', label: 'Party Start' };

  // Zones (no rng draws): approach band, opposition band, densest
  // feature cluster, and the river when one was carved.
  const rooms: ProtoRoom[] = [
    { kind: 'zone', bounds: { x: 0, y: h - 3, w, h: 3 }, tags: ['entrance', 'spawn:party'] },
    { kind: 'zone', bounds: { x: 0, y: 0, w, h: 3 }, tags: ['spawn:monster'] },
  ];

  let bestCount = 0;
  let bestX = 0;
  let bestY = 0;
  for (let y = 3; y <= h - 8; y++) {
    for (let x = 0; x <= w - 5; x++) {
      let count = 0;
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          const t = grid[y + dy][x + dx].terrain;
          if (t !== 'floor' && t !== 'entrance') count++;
        }
      }
      if (count > bestCount) { bestCount = count; bestX = x; bestY = y; }
    }
  }
  if (bestCount >= 5) {
    rooms.push({
      kind: 'zone',
      bounds: { x: bestX, y: bestY, w: 5, h: 5 },
      tags: ['landmark', 'spawn:monster'],
    });
  }

  if (riverCells.length > 0) {
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (const cell of riverCells) {
      const x = cell % w;
      const y = Math.floor(cell / w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    rooms.push({
      kind: 'zone',
      bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
      cells: riverCells,
      tags: ['landmark', 'hazard'],
    });
  }

  return { grid, rooms };
}

// ─── City Streets ────────────────────────────────────────────────

interface CityBlock {
  rect: Rect;
  type: 'building' | 'plaza' | 'market' | 'grove';
}

function generateCity(
  w: number,
  h: number,
  rng: () => number,
  featureDensity: MapFeatureDensity,
  terrainVariety: MapTerrainVariety,
): GenResult {
  const grid = createGrid(w, h, 'floor');

  // Street lattice: full-run 2-wide streets at jittered intervals cut
  // the map into blocks. Streets span edge to edge, so the street
  // network is connected by construction.
  const cutPositions = (extent: number): number[] => {
    const lines: number[] = [];
    let pos = 3 + Math.floor(rng() * 3);
    while (pos < extent - 4) {
      lines.push(pos);
      pos += 2 + 4 + Math.floor(rng() * 4); // street + block of 4–7
    }
    return lines;
  };
  const xCuts = cutPositions(w);
  const yCuts = cutPositions(h);

  // Block rectangles between streets (and the map border).
  const spans = (cuts: number[], extent: number): Array<[number, number]> => {
    const result: Array<[number, number]> = [];
    let start = 0;
    for (const cut of cuts) {
      if (cut - start >= 3) result.push([start, cut - 1]);
      start = cut + 2;
    }
    if (extent - start >= 3) result.push([start, extent - 1]);
    return result;
  };

  const blocks: CityBlock[] = [];
  for (const [y0, y1] of spans(yCuts, h)) {
    for (const [x0, x1] of spans(xCuts, w)) {
      const rect: Rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      const roll = rng();
      const type: CityBlock['type'] = roll < 0.62 ? 'building'
        : roll < 0.78 ? 'plaza'
          : roll < 0.9 ? 'market'
            : 'grove';
      blocks.push({ rect, type });

      if (type === 'building') {
        for (let y = rect.y; y <= y1; y++) {
          for (let x = rect.x; x <= x1; x++) {
            grid[y][x].terrain = 'wall';
          }
        }
        // Street-facing door: perimeter cells whose outward neighbor is
        // open street (never the map border).
        const candidates: Array<[number, number]> = [];
        for (let x = rect.x; x <= x1; x++) {
          if (rect.y > 0) candidates.push([x, rect.y]);
          if (y1 < h - 1) candidates.push([x, y1]);
        }
        for (let y = rect.y; y <= y1; y++) {
          if (rect.x > 0) candidates.push([rect.x, y]);
          if (x1 < w - 1) candidates.push([x1, y]);
        }
        if (candidates.length > 0) {
          const [dx, dy] = candidates[Math.floor(rng() * candidates.length)];
          grid[dy][dx] = { terrain: 'door', label: 'Locked Door' };
        }
      } else if (type === 'plaza') {
        const cx = rect.x + Math.floor(rect.w / 2);
        const cy = rect.y + Math.floor(rect.h / 2);
        if (rect.w >= 4 && rect.h >= 4) {
          const centerpiece = rng();
          if (centerpiece < 0.5) {
            grid[cy][cx] = { terrain: 'water', label: 'Fountain' };
          } else if (centerpiece < 0.8) {
            grid[cy][cx] = { terrain: 'altar', label: 'Statue' };
          }
        }
      } else if (type === 'market') {
        for (let y = rect.y; y <= y1; y++) {
          for (let x = rect.x; x <= x1; x++) {
            if (rng() < 0.18 * DENSITY_MULTIPLIER[featureDensity]) {
              grid[y][x].terrain = rng() < 0.6 ? 'rubble' : 'difficult';
            }
          }
        }
      } else {
        const chance = terrainVariety === 'Focused' ? 0.15 : 0.25;
        for (let y = rect.y; y <= y1; y++) {
          for (let x = rect.x; x <= x1; x++) {
            if (rng() < chance) grid[y][x].terrain = 'vegetation';
          }
        }
      }
    }
  }

  // Entrance: nearest open cell to bottom-center (deterministic scan).
  let entranceX = Math.floor(w / 2);
  let entranceY = h - 1;
  outer: for (let radius = 0; radius < Math.max(w, h); radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = Math.floor(w / 2) + dx;
      const y = h - 1 - (radius - Math.abs(dx));
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      if (isPassable(grid[y][x].terrain) && grid[y][x].terrain !== 'door') {
        entranceX = x;
        entranceY = y;
        break outer;
      }
    }
  }
  grid[entranceY][entranceX] = { terrain: 'entrance', label: 'City Gate' };

  // Zones (no rng draws).
  const openCellsIn = (rect: Rect): number[] => {
    const cells: number[] = [];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (isPassable(grid[y][x].terrain)) cells.push(y * w + x);
      }
    }
    return cells;
  };

  const rooms: ProtoRoom[] = [];
  const gateRect: Rect = {
    x: Math.max(0, entranceX - 2), y: Math.max(0, entranceY - 2),
    w: Math.min(5, w - Math.max(0, entranceX - 2)),
    h: Math.min(5, h - Math.max(0, entranceY - 2)),
  };
  rooms.push({
    kind: 'zone', bounds: gateRect, cells: openCellsIn(gateRect),
    tags: ['entrance', 'spawn:party'],
  });

  // Far ward: the open street/plaza cells of the top quarter host the
  // opposition even when every block rolled 'building'.
  const farRect: Rect = { x: 0, y: 0, w, h: Math.max(3, Math.floor(h / 4)) };
  rooms.push({
    kind: 'zone', bounds: farRect, cells: openCellsIn(farRect),
    tags: ['spawn:monster'],
  });

  let bossBlock: CityBlock | null = null;
  for (const block of blocks) {
    if (block.type === 'building') continue;
    const tags: MapRoomTag[] = ['landmark'];
    if (block.rect.y + block.rect.h <= h / 2) tags.push('spawn:monster');
    rooms.push({
      kind: 'zone', bounds: block.rect, cells: openCellsIn(block.rect), tags,
    });
    if (block.type === 'plaza'
      && (!bossBlock || block.rect.w * block.rect.h > bossBlock.rect.w * bossBlock.rect.h)) {
      bossBlock = block;
    }
  }
  if (bossBlock) {
    const zone = rooms.find(r => r.bounds === bossBlock!.rect);
    if (zone && !zone.tags.includes('boss')) {
      zone.tags.push('boss');
      if (!zone.tags.includes('spawn:monster')) zone.tags.push('spawn:monster');
    }
  }

  return { grid, rooms };
}

// ─── Public API ──────────────────────────────────────────────────

/** Layout resolution + dimension derivation — draws 1–3 of the grid
 *  stream (see the contract at the top of this file). */
function resolveLayout(
  layout: MapLayout,
  environment: Environment,
  rng: () => number,
): Exclude<MapLayout, 'auto'> {
  if (layout !== 'auto') return layout;
  switch (environment) {
    case 'Urban': return 'city';
    case 'Underdark':
    case 'Planar': return 'cavern';
    case 'Mountain': return rng() < 0.5 ? 'cavern' : 'wilderness';
    case 'Any': return 'dungeon';
    default: return 'wilderness';
  }
}

function resolveDimensions(
  layout: Exclude<MapLayout, 'auto'>,
  scale: MapScale,
  rng: () => number,
): [number, number] {
  let [tw, th] = SCALE_DIMS[scale];
  if (layout === 'city') { tw = Math.round(tw * 1.1); th = Math.round(th * 0.95); }
  if (layout === 'building') { tw = Math.round(tw * 0.6); th = Math.round(th * 0.65); }
  // ±8% seeded jitter so same-tier maps vary in silhouette.
  const jw = 0.92 + rng() * 0.16;
  const jh = 0.92 + rng() * 0.16;
  return [
    Math.max(10, Math.min(MAX_MAP_WIDTH, Math.round(tw * jw))),
    Math.max(10, Math.min(MAX_MAP_HEIGHT, Math.round(th * jh))),
  ];
}

export function generateMap(options: MapOptions): EncounterMap {
  const {
    environment,
    seed = Date.now(),
    featureDensity = 'Balanced',
    terrainVariety = 'Varied',
    layout = 'auto',
    scale = 'Standard',
  } = options;

  const rng = seededRandom(seed);
  const resolved = resolveLayout(layout, environment, rng);

  // Exact dimensions (legacy links, JSON callers) skip the jitter
  // draws entirely; scale mode derives dimensions per layout.
  let w: number;
  let h: number;
  if (options.width !== undefined || options.height !== undefined) {
    w = Math.max(10, Math.min(MAX_MAP_WIDTH, options.width ?? 24));
    h = Math.max(10, Math.min(MAX_MAP_HEIGHT, options.height ?? 18));
  } else {
    [w, h] = resolveDimensions(resolved, scale, rng);
  }

  const requestedRooms = options.roomCount !== undefined
    ? Math.max(3, Math.min(14, Math.round(options.roomCount)))
    : undefined;
  const roomCount = requestedRooms ?? Math.max(4, Math.min(12, Math.round((w * h) / 55)));

  let result: GenResult;
  let name: string;
  let structure: MapStructure;

  switch (resolved) {
    case 'cavern':
      result = generateCave(w, h, environment, rng, featureDensity, terrainVariety);
      name = environment === 'Underdark' ? 'Underdark Cavern'
        : environment === 'Planar' ? 'Planar Rift'
          : environment === 'Mountain' ? 'Mountain Cave'
            : `${environment} Cavern`;
      structure = 'cave';
      break;
    case 'wilderness':
      result = generateOutdoor(w, h, environment, rng, featureDensity, terrainVariety);
      name = environment === 'Mountain' ? 'Mountain Pass' : `${environment} Battlefield`;
      structure = 'outdoor';
      break;
    case 'city':
      result = generateCity(w, h, rng, featureDensity, terrainVariety);
      name = environment === 'Urban' ? 'City Streets' : `${environment} Settlement`;
      structure = 'city';
      break;
    case 'building':
      // PR 2 of the milestone delivers generateBuilding; until then the
      // layout exists in the type but the UI does not offer it.
      result = generateDungeon(w, h, rng, featureDensity, terrainVariety, roomCount);
      name = 'Building Interior';
      structure = 'dungeon';
      break;
    default:
      result = generateDungeon(w, h, rng, featureDensity, terrainVariety, roomCount);
      name = environment === 'Any' ? 'Dungeon' : `${environment} Dungeon`;
      structure = 'dungeon';
  }

  const rooms: MapRoom[] = result.rooms.map((proto, i) => ({
    id: i + 1,
    name: '',
    purpose: '',
    readAloud: '',
    kind: proto.kind,
    bounds: proto.bounds,
    ...(proto.cells ? { cells: proto.cells } : {}),
    tags: proto.tags,
  }));
  const flavorRng = seededRandom((seed ^ FLAVOR_STREAM_SALT) & 0x7fffffff);
  flavorRooms(rooms, environment, structure, flavorRng);

  return {
    id: `map-${seed}`,
    name,
    width: w,
    height: h,
    environment,
    grid: result.grid,
    seed,
    rooms,
    genOptions: {
      featureDensity,
      terrainVariety,
      ...(requestedRooms !== undefined ? { roomCount: requestedRooms } : {}),
      ...(layout !== 'auto' ? { layout } : {}),
      ...(options.width === undefined && options.height === undefined ? { scale } : {}),
    },
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
