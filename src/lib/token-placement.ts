import { seededRandom, shuffleArray } from './random';
import { IMPASSABLE_TERRAIN } from './map-generator';
import type {
  EncounterMap, EncounterMonster, MapRoom, MapToken, Size, TerrainType,
} from './types';

// ─── Token Placement ─────────────────────────────────────────────
// Seeded, deterministic starting positions for party and monsters.
// Draws come from a THIRD rng stream (seed ^ PLACEMENT_STREAM_SALT):
// the terrain grid and room flavor are untouched, so encounter links
// shared before placement existed keep reproducing identical maps.
//
// Deployment doctrine (tune freely — it only affects new placements):
// party packs the spawn:party room nearest the entrance; the highest-
// XP monster claims the boss room and the strongest remaining melee
// instance stands adjacent as a bodyguard; ranged-only instances
// deploy deep and prefer high ground; melee holds the zone edge facing
// the party; everything else scatters across the monster zones.

export const PLACEMENT_STREAM_SALT = 0x504c4143; // 'PLAC'

/** Terrain a token can never start on (walkable-but-wet water and
 *  doorways included — nobody briefs for battle standing in a door). */
export const TOKEN_BLOCKING: ReadonlySet<TerrainType> = new Set([
  'wall', 'pillar', 'chasm', 'lava', 'water', 'door',
]);

const SIZE_CELLS: Record<Size, 1 | 2 | 3 | 4> = {
  Tiny: 1, Small: 1, Medium: 1, Large: 2, Huge: 3, Gargantuan: 4,
};

export interface TokenPlacement {
  tokens: MapToken[];
  /** Human-readable fallbacks taken (zone overflow, unplaceable tokens). */
  notes: string[];
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function placeTokens(
  map: EncounterMap,
  monsters: EncounterMonster[],
  partySize: number,
  seed: number,
): TokenPlacement {
  const { width: w, height: h, grid } = map;
  const rng = seededRandom((seed ^ PLACEMENT_STREAM_SALT) & 0x7fffffff);
  const notes: string[] = [];
  const tokens: MapToken[] = [];
  const occupied = new Uint8Array(w * h);

  const standable = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && !TOKEN_BLOCKING.has(grid[y][x].terrain);
  const freeAt = (x: number, y: number) => standable(x, y) && occupied[y * w + x] === 0;

  // Entrance anchor (falls back to the first standable cell).
  let entrance = -1;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].terrain === 'entrance') { entrance = y * w + x; break outer; }
    }
  }
  if (entrance < 0) {
    for (let cell = 0; cell < w * h && entrance < 0; cell++) {
      if (standable(cell % w, Math.floor(cell / w))) entrance = cell;
    }
  }

  // BFS distance from the entrance over MOVEMENT-passable cells (water
  // and doors are crossable even though tokens cannot start on them).
  const dist = new Int32Array(w * h).fill(-1);
  if (entrance >= 0) {
    dist[entrance] = 0;
    let frontier = [entrance];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const cell of frontier) {
        const cx = cell % w;
        const cy = Math.floor(cell / w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const idx = ny * w + nx;
          if (dist[idx] !== -1 || IMPASSABLE_TERRAIN.has(grid[ny][nx].terrain)) continue;
          dist[idx] = dist[cell] + 1;
          next.push(idx);
        }
      }
      frontier = next;
    }
  }
  const distOf = (cell: number) => (dist[cell] === -1 ? Number.MAX_SAFE_INTEGER : dist[cell]);

  const roomCells = (room: MapRoom): number[] => {
    if (room.cells && room.cells.length > 0) return room.cells;
    const cells: number[] = [];
    for (let y = room.bounds.y; y < room.bounds.y + room.bounds.h; y++) {
      for (let x = room.bounds.x; x < room.bounds.x + room.bounds.w; x++) {
        cells.push(y * w + x);
      }
    }
    return cells;
  };

  const standableIn = (rooms: MapRoom[]): number[] => {
    const seen = new Set<number>();
    for (const room of rooms) {
      for (const cell of roomCells(room)) {
        if (standable(cell % w, Math.floor(cell / w))) seen.add(cell);
      }
    }
    return [...seen];
  };

  const allStandable: number[] = [];
  for (let cell = 0; cell < w * h; cell++) {
    if (standable(cell % w, Math.floor(cell / w))) allStandable.push(cell);
  }

  const rooms = map.rooms ?? [];

  // ── Party: pack the spawn zone nearest the entrance ─────────────
  let partyCells = standableIn(rooms.filter(r => r.tags.includes('spawn:party')));
  if (partyCells.length === 0) {
    partyCells = allStandable.filter(cell => {
      const dx = Math.abs(cell % w - entrance % w);
      const dy = Math.abs(Math.floor(cell / w) - Math.floor(entrance / w));
      return Math.max(dx, dy) <= 2;
    });
    if (partyCells.length > 0) notes.push('No party spawn zone — party placed around the entrance.');
  }
  partyCells.sort((a, b) => distOf(a) - distOf(b) || a - b);

  let partyFallbacks = 0;
  for (let i = 0; i < partySize; i++) {
    let cell = partyCells.find(c => occupied[c] === 0);
    if (cell === undefined) {
      cell = [...allStandable].sort((a, b) => distOf(a) - distOf(b) || a - b)
        .find(c => occupied[c] === 0);
      partyFallbacks++;
    }
    if (cell === undefined) {
      notes.push(`No open cell for party member ${i + 1}.`);
      continue;
    }
    occupied[cell] = 1;
    tokens.push({
      id: `party-${i}`,
      kind: 'party',
      name: `Party Member ${i + 1}`,
      label: `P${i + 1}`,
      x: cell % w,
      y: Math.floor(cell / w),
      sizeCells: 1,
    });
  }
  if (partyFallbacks > 0) {
    notes.push(`Party spawn overflowed — ${partyFallbacks} member(s) placed on the nearest open ground.`);
  }

  // ── Monsters ─────────────────────────────────────────────────────
  const bossRoom = rooms.find(r => r.tags.includes('boss'));
  let monsterCells = standableIn(rooms.filter(r => r.tags.includes('spawn:monster')));
  if (monsterCells.length === 0) {
    monsterCells = allStandable;
    if (rooms.length > 0) notes.push('No monster spawn zone — using the whole field.');
  }

  // One seeded shuffle; stable re-sorts on top give each role its
  // ordering while equal-distance ties stay seed-varied. The extra
  // draw rotates the bodyguard ring so hardened doctrine still varies
  // between seeds. Draw count is fixed per call — keep it that way.
  const shuffled = shuffleArray(monsterCells, rng);
  const ringRotation = Math.floor(rng() * 8);
  const deepFirst = [...shuffled].sort((a, b) => distOf(b) - distOf(a));
  const nearFirst = [...shuffled].sort((a, b) => distOf(a) - distOf(b));

  // Ranged prefer high ground (#122): elevated cells in the deep 40%
  // of the field jump the queue, then normal depth ordering resumes.
  const maxCellDist = monsterCells.reduce(
    (max, cell) => (dist[cell] === -1 ? max : Math.max(max, dist[cell])), 0,
  );
  const isHighGround = (cell: number) =>
    grid[Math.floor(cell / w)][cell % w].terrain === 'elevated'
    && distOf(cell) >= 0.6 * maxCellDist;
  const rangedFirst = [
    ...deepFirst.filter(isHighGround),
    ...deepFirst.filter(cell => !isHighGround(cell)),
  ];
  const bossCells = bossRoom
    ? standableIn([bossRoom]).sort((a, b) => {
        const center = (bossRoom.bounds.y + Math.floor(bossRoom.bounds.h / 2)) * w
          + bossRoom.bounds.x + Math.floor(bossRoom.bounds.w / 2);
        const da = Math.hypot(a % w - center % w, Math.floor(a / w) - Math.floor(center / w));
        const db = Math.hypot(b % w - center % w, Math.floor(b / w) - Math.floor(center / w));
        return da - db || a - b;
      })
    : [];

  interface Instance {
    id: string;
    name: string;
    sizeCells: 1 | 2 | 3 | 4;
    ranged: boolean;
    melee: boolean;
    meleeCapable: boolean;
    xp: number;
  }
  const instances: Instance[] = monsters.flatMap(({ monster, count }) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${monster.id}#${i}`,
      name: count > 1 ? `${monster.name} #${i + 1}` : monster.name,
      sizeCells: SIZE_CELLS[monster.size],
      ranged: monster.attackDeliveryModes.includes('Ranged') && !monster.attackDeliveryModes.includes('Melee'),
      melee: monster.attackDeliveryModes.includes('Melee') && !monster.attackDeliveryModes.includes('Ranged'),
      meleeCapable: monster.attackDeliveryModes.includes('Melee'),
      xp: monster.xp,
    })),
  );
  const bossId = bossRoom && instances.length > 0
    ? instances.reduce((best, inst) => (inst.xp > best.xp ? inst : best), instances[0]).id
    : null;

  // Bodyguard (#122): the strongest remaining melee-capable instance
  // deploys adjacent to the boss instead of at the zone edge.
  const bodyguardId = bossId
    ? instances
        .filter(inst => inst.id !== bossId && inst.meleeCapable)
        .reduce<Instance | null>((best, inst) => (!best || inst.xp > best.xp ? inst : best), null)
        ?.id ?? null
    : null;

  // Boss first, bodyguard second (it anchors on the boss's placed
  // footprint), everyone else in encounter order.
  const placementOrder = [
    ...instances.filter(inst => inst.id === bossId),
    ...instances.filter(inst => inst.id === bodyguardId),
    ...instances.filter(inst => inst.id !== bossId && inst.id !== bodyguardId),
  ];

  const fits = (cell: number, n: number): boolean => {
    const x = cell % w;
    const y = Math.floor(cell / w);
    if (x + n > w || y + n > h) return false;
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        if (!freeAt(x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  const claim = (cell: number, n: number) => {
    const x = cell % w;
    const y = Math.floor(cell / w);
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        occupied[(y + dy) * w + (x + dx)] = 1;
      }
    }
  };

  // Anchor cells whose footprint would stand flush against the boss's,
  // rotated by the seeded offset so the flank varies between rolls.
  const bossRing = (boss: MapToken, n: number): number[] => {
    const ring: number[] = [];
    for (let y = boss.y - n; y <= boss.y + boss.sizeCells; y++) {
      for (let x = boss.x - n; x <= boss.x + boss.sizeCells; x++) {
        if (x < 0 || y < 0 || x + n > w || y + n > h) continue;
        ring.push(y * w + x);
      }
    }
    if (ring.length === 0) return ring;
    const offset = ringRotation % ring.length;
    return [...ring.slice(offset), ...ring.slice(0, offset)];
  };

  let bossToken: MapToken | undefined;
  for (const inst of placementOrder) {
    const preferred = inst.id === bossId && bossCells.length > 0
      ? bossCells
      : inst.id === bodyguardId && bossToken
        ? [...bossRing(bossToken, inst.sizeCells), ...nearFirst]
        : inst.ranged
          ? rangedFirst
          : inst.melee
            ? nearFirst
            : shuffled;
    let spot = preferred.find(cell => fits(cell, inst.sizeCells));
    if (spot === undefined) {
      spot = allStandable.find(cell => fits(cell, inst.sizeCells));
      if (spot !== undefined) notes.push(`${inst.name} overflowed its zone — placed on open ground.`);
    }
    if (spot === undefined) {
      notes.push(`No room left on the map for ${inst.name}.`);
      continue;
    }
    claim(spot, inst.sizeCells);
    const token: MapToken = {
      id: inst.id,
      kind: 'monster',
      name: inst.name,
      label: initials(inst.name),
      x: spot % w,
      y: Math.floor(spot / w),
      sizeCells: inst.sizeCells,
    };
    tokens.push(token);
    if (inst.id === bossId) bossToken = token;
  }

  return { tokens, notes };
}
