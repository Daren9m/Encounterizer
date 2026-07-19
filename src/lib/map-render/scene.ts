import { mergeWallRects, wallBoundaries } from './wall-geometry';
import type { Point, WallRect } from './wall-geometry';
import type { EncounterMap, MapToken, TerrainType } from '../types';

// ─── Map Scene ───────────────────────────────────────────────────
// Pure translation of an EncounterMap (+ optional tokens) into the
// geometry the svg builder draws. Nothing here touches the DOM.

/** SVG units per grid cell. */
export const CELL = 32;
/** Space reserved for the coordinate rulers (top and left). */
export const RULER_GUTTER = 20;

/** Terrain drawn as a full-cell wash over the floor. */
const TINT_TERRAINS: ReadonlySet<TerrainType> = new Set([
  'water', 'difficult', 'vegetation', 'ice', 'elevated', 'rubble', 'lava', 'chasm',
]);

/** Terrain drawn as a glyph on top of the ground. */
const ICON_TERRAINS: ReadonlySet<TerrainType> = new Set([
  'door', 'trap', 'treasure', 'entrance', 'exit', 'pillar', 'altar', 'stairs', 'bridge',
]);

export interface SceneIcon {
  kind: TerrainType;
  x: number;
  y: number;
  /** Doors only: bar drawn vertically (walls above and below). */
  vertical?: boolean;
}

export interface MapScene {
  width: number;
  height: number;
  widthPx: number;
  heightPx: number;
  floorTints: Array<{ terrain: TerrainType; cells: number[] }>;
  wallRects: WallRect[];
  wallOutlines: Point[][];
  icons: SceneIcon[];
  roomLabels: Array<{ id: number; x: number; y: number }>;
  rulers: { cols: string[]; rows: string[] };
  tokens: MapToken[];
}

/** Spreadsheet-style column label: A..Z, AA..AZ, BA.. */
function colLabel(i: number): string {
  if (i < 26) return String.fromCharCode(65 + i);
  return String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
}

export function buildMapScene(map: EncounterMap, tokens: MapToken[] = []): MapScene {
  const { width, height, grid } = map;
  const isWall = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && grid[y][x].terrain === 'wall';

  const tintCells = new Map<TerrainType, number[]>();
  const icons: SceneIcon[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = grid[y][x].terrain;
      if (TINT_TERRAINS.has(terrain)) {
        const cells = tintCells.get(terrain);
        if (cells) cells.push(y * width + x);
        else tintCells.set(terrain, [y * width + x]);
      } else if (ICON_TERRAINS.has(terrain)) {
        icons.push({
          kind: terrain,
          x,
          y,
          ...(terrain === 'door' ? { vertical: isWall(x, y - 1) && isWall(x, y + 1) } : {}),
        });
      }
    }
  }

  // Room number chips for rooms and chambers; zones live in the key
  // panel only (full-width bands would clutter the field).
  const roomLabels: Array<{ id: number; x: number; y: number }> = [];
  for (const room of map.rooms ?? []) {
    if (room.kind === 'zone') continue;
    if (room.cells && room.cells.length > 0) {
      // Irregular region: centroid snapped to the nearest member cell.
      let sumX = 0;
      let sumY = 0;
      for (const cell of room.cells) {
        sumX += cell % width;
        sumY += Math.floor(cell / width);
      }
      const cx = sumX / room.cells.length;
      const cy = sumY / room.cells.length;
      let best = room.cells[0];
      let bestDist = Infinity;
      for (const cell of room.cells) {
        const dx = cell % width - cx;
        const dy = Math.floor(cell / width) - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = cell;
        }
      }
      roomLabels.push({ id: room.id, x: best % width, y: Math.floor(best / width) });
    } else {
      roomLabels.push({
        id: room.id,
        x: room.bounds.x + Math.floor(room.bounds.w / 2),
        y: room.bounds.y + Math.floor(room.bounds.h / 2),
      });
    }
  }

  return {
    width,
    height,
    widthPx: width * CELL + RULER_GUTTER,
    heightPx: height * CELL + RULER_GUTTER,
    floorTints: [...tintCells.entries()].map(([terrain, cells]) => ({ terrain, cells })),
    wallRects: mergeWallRects(map),
    wallOutlines: wallBoundaries(map),
    icons,
    roomLabels,
    rulers: {
      cols: Array.from({ length: width }, (_, i) => colLabel(i)),
      rows: Array.from({ length: height }, (_, i) => String(i + 1)),
    },
    tokens,
  };
}
