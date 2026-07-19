import type { Battlefield } from '../battle-sim-types';
import type { EncounterMap, TerrainType } from '../types';
import type { TokenPlacement } from '../token-placement';
import { IMPASSABLE_TERRAIN } from '../map-generator';

// ─── Spatial movement ────────────────────────────────────────────
// Grid math for the spatial Battle Forecast. 5e 2024 gridded
// movement: 8-connected, diagonals cost the same as orthogonals
// (Chebyshev world), difficult terrain doubles the entry cost.
//
// Perf design: distance fields depend only on (cost grid, target
// cell) — never on the iteration — so ONE DistanceFieldCache is
// shared across all Monte Carlo iterations of a simulateBattle call.

/** Terrain that costs 2 movement per cell entered. */
const DIFFICULT_TERRAIN: ReadonlySet<TerrainType> = new Set([
  'difficult', 'water', 'rubble', 'vegetation', 'ice',
]);

const UNREACHABLE = 0xffff;

/** 5e gridded distance between two cell indices. */
export function chebyshev(a: number, b: number, width: number): number {
  return Math.max(
    Math.abs((a % width) - (b % width)),
    Math.abs(Math.floor(a / width) - Math.floor(b / width)),
  );
}

/** Digest a battle map + token placement into the sim's cost grid. */
export function battlefieldFromMap(map: EncounterMap, placement: TokenPlacement): Battlefield {
  const { width, height } = map;
  const cost = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = map.grid[y][x].terrain;
      cost[y * width + x] = IMPASSABLE_TERRAIN.has(terrain)
        ? 0
        : DIFFICULT_TERRAIN.has(terrain)
          // Everything swims on an underwater map — water is the floor.
          ? (terrain === 'water' && map.environment === 'Underwater' ? 1 : 2)
          : 1;
    }
  }

  const playerSpawns: number[] = [];
  const monsterSpawns = new Map<string, number>();
  for (const token of placement.tokens) {
    const cell = token.y * width + token.x;
    if (token.kind === 'party') {
      const slot = Number(token.id.slice('party-'.length));
      playerSpawns[Number.isInteger(slot) ? slot : playerSpawns.length] = cell;
    } else {
      monsterSpawns.set(token.id, cell);
    }
  }

  return { width, height, cost, playerSpawns, monsterSpawns };
}

/**
 * Cost-to-reach-target fields, memoized by target cell. Dial's
 * algorithm with three rotating buckets (edge weights are 1 or 2).
 */
export class DistanceFieldCache {
  private readonly fields = new Map<number, Uint16Array>();

  constructor(private readonly bf: Battlefield) {}

  fieldTo(target: number): Uint16Array {
    const cached = this.fields.get(target);
    if (cached) return cached;

    const { width: w, height: h, cost } = this.bf;
    const dist = new Uint16Array(w * h).fill(UNREACHABLE);
    dist[target] = 0;
    const buckets: number[][] = [[target], [], []];
    let remaining = 1;
    let d = 0;
    while (remaining > 0) {
      const bucket = buckets[d % 3];
      while (bucket.length > 0) {
        const cell = bucket.pop()!;
        remaining--;
        if (dist[cell] !== d) continue; // superseded entry
        const cx = cell % w;
        const cy = (cell - cx) / w;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const n = ny * w + nx;
            const entry = cost[n];
            if (entry === 0) continue;
            const nd = d + entry;
            if (nd < dist[n]) {
              dist[n] = nd;
              buckets[nd % 3].push(n);
              remaining++;
            }
          }
        }
      }
      d++;
    }

    this.fields.set(target, dist);
    return dist;
  }
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1],
];

/**
 * Greedy descent toward the field's target, spending up to
 * `speedCells` of movement. Enemies block cells outright; allies can
 * be moved through but not ended on. Deterministic.
 */
export function stepToward(
  from: number,
  field: Uint16Array,
  speedCells: number,
  bf: Battlefield,
  enemyCells: ReadonlySet<number>,
  allyCells: ReadonlySet<number>,
): number {
  const { width: w, height: h, cost } = bf;
  let cell = from;
  let budget = speedCells;
  let lastRestable = from;

  for (;;) {
    if (field[cell] === 0) break;
    const cx = cell % w;
    const cy = (cell - cx) / w;
    let best = -1;
    let bestDist = field[cell];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (cost[n] === 0 || enemyCells.has(n)) continue;
      if (field[n] < bestDist) {
        bestDist = field[n];
        best = n;
      }
    }
    if (best < 0 || cost[best] > budget) break;
    budget -= cost[best];
    cell = best;
    if (!allyCells.has(cell)) lastRestable = cell;
  }

  return allyCells.has(cell) ? lastRestable : cell;
}

/**
 * Greedy ascent away from a threat (ranged kiting). Same occupancy
 * rules as stepToward.
 */
export function stepAway(
  from: number,
  threatField: Uint16Array,
  speedCells: number,
  bf: Battlefield,
  enemyCells: ReadonlySet<number>,
  allyCells: ReadonlySet<number>,
): number {
  const { width: w, height: h, cost } = bf;
  let cell = from;
  let budget = speedCells;
  let lastRestable = from;

  for (;;) {
    const cx = cell % w;
    const cy = (cell - cx) / w;
    let best = -1;
    let bestDist = threatField[cell];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (cost[n] === 0 || enemyCells.has(n)) continue;
      if (threatField[n] > bestDist && threatField[n] !== UNREACHABLE) {
        bestDist = threatField[n];
        best = n;
      }
    }
    if (best < 0 || cost[best] > budget) break;
    budget -= cost[best];
    cell = best;
    if (!allyCells.has(cell)) lastRestable = cell;
  }

  return allyCells.has(cell) ? lastRestable : cell;
}
