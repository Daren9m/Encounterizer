import { wallBoundaries } from './map-render/wall-geometry';
import type { Point } from './map-render/wall-geometry';
import type { EncounterMap } from './types';

// ─── Universal VTT export (.dd2vtt) ──────────────────────────────
// The Dungeondraft-originated interchange format Foundry (via the
// Universal Battlemap Importer), Arkenforge, and friends consume.
// Coordinates are in GRID units; the embedded image must be rendered
// at exactly `pixels_per_grid` px per cell with no rulers/gutter so
// walls line up. format 0.3 matches the ecosystem's expectations —
// verify against a live importer before changing it.

export interface UvttPortal {
  position: Point;
  bounds: [Point, Point];
  rotation: number;
  closed: boolean;
  freestanding: boolean;
}

export interface UvttDocument {
  format: number;
  resolution: {
    map_origin: Point;
    map_size: Point;
    pixels_per_grid: number;
  };
  line_of_sight: Point[][];
  objects_line_of_sight: Point[][];
  portals: UvttPortal[];
  environment: { baked_lighting: boolean; ambient_light: string };
  lights: never[];
  /** Base64 PNG, no data: prefix. */
  image: string;
}

export function buildUvtt(
  map: EncounterMap,
  imageBase64Png: string,
  pixelsPerGrid = 70,
): UvttDocument {
  const isWall = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < map.width && y < map.height &&
    map.grid[y][x].terrain === 'wall';

  // Doors block sight until opened: each door cell becomes a portal
  // spanning the doorway, oriented across the passage.
  const portals: UvttPortal[] = [];
  const pillars: Point[][] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const terrain = map.grid[y][x].terrain;
      if (terrain === 'door') {
        const vertical = isWall(x, y - 1) && isWall(x, y + 1);
        portals.push({
          position: { x: x + 0.5, y: y + 0.5 },
          bounds: vertical
            ? [{ x: x + 0.5, y }, { x: x + 0.5, y: y + 1 }]
            : [{ x, y: y + 0.5 }, { x: x + 1, y: y + 0.5 }],
          rotation: 0,
          closed: true,
          freestanding: false,
        });
      } else if (terrain === 'pillar') {
        pillars.push([
          { x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }, { x, y },
        ]);
      }
    }
  }

  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: map.width, y: map.height },
      pixels_per_grid: pixelsPerGrid,
    },
    // Pillars ride with the walls: the reference Foundry importer
    // (moo-man/FVTT-DD-Import) never reads objects_line_of_sight, and
    // our pillars are solid columns, not furniture.
    line_of_sight: [...wallBoundaries(map), ...pillars],
    objects_line_of_sight: [],
    portals,
    environment: { baked_lighting: false, ambient_light: 'ffffffff' },
    lights: [],
    image: imageBase64Png,
  };
}
