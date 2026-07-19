import type { EncounterMap } from '../types';

// ─── Wall Geometry ───────────────────────────────────────────────
// Pure helpers turning the wall cells of a map into vector shapes.
// Two consumers: the SVG renderer (fills + strokes) and the UVTT
// export (the boundary polylines ARE the line-of-sight segments).
// All coordinates are in grid units; the renderer scales by CELL.

export interface WallRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Cover all wall cells with non-overlapping rectangles: horizontal
 * runs per row, merged downward when the run below matches exactly.
 * Typically reduces ~500 wall cells to well under 100 rects.
 */
export function mergeWallRects(map: EncounterMap): WallRect[] {
  const { width: w, height: h, grid } = map;
  const rects: WallRect[] = [];
  let prevRow: WallRect[] = [];

  for (let y = 0; y < h; y++) {
    const currentRow: WallRect[] = [];
    let x = 0;
    while (x < w) {
      if (grid[y][x].terrain !== 'wall') {
        x++;
        continue;
      }
      let run = 0;
      while (x + run < w && grid[y][x + run].terrain === 'wall') run++;

      // prevRow rects all end at row y, so an exact x/w match extends.
      const above = prevRow.find(r => r.x === x && r.w === run);
      if (above) {
        above.h += 1;
        currentRow.push(above);
      } else {
        const rect: WallRect = { x, y, w: run, h: 1 };
        rects.push(rect);
        currentRow.push(rect);
      }
      x += run;
    }
    prevRow = currentRow;
  }

  return rects;
}

type EdgeKey = string;

/** Canonical key for the unit edge between two adjacent corner points. */
function edgeKey(ax: number, ay: number, bx: number, by: number): EdgeKey {
  return ax < bx || (ax === bx && ay < by)
    ? `${ax},${ay}-${bx},${by}`
    : `${bx},${by}-${ax},${ay}`;
}

function edgeEndpoints(key: EdgeKey): [Point, Point] {
  const [a, b] = key.split('-');
  const [ax, ay] = a.split(',').map(Number);
  const [bx, by] = b.split(',').map(Number);
  return [{ x: ax, y: ay }, { x: bx, y: by }];
}

const pointKey = (p: Point) => `${p.x},${p.y}`;

/**
 * Boundary edges between wall cells and in-bounds open cells, chained
 * into axis-aligned polylines with collinear runs merged. Coordinates
 * live on grid corners (0..width, 0..height). Deterministic for a
 * given map.
 */
export function wallBoundaries(map: EncounterMap): Point[][] {
  const { width: w, height: h, grid } = map;
  const isOpen = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && grid[y][x].terrain !== 'wall';

  // Emit each wall/open boundary edge once (from the wall side).
  const emitted: EdgeKey[] = [];
  const unused = new Set<EdgeKey>();
  const incident = new Map<string, EdgeKey[]>();
  const addEdge = (ax: number, ay: number, bx: number, by: number) => {
    const key = edgeKey(ax, ay, bx, by);
    emitted.push(key);
    unused.add(key);
    for (const p of [`${ax},${ay}`, `${bx},${by}`]) {
      const list = incident.get(p);
      if (list) list.push(key);
      else incident.set(p, [key]);
    }
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x].terrain !== 'wall') continue;
      if (isOpen(x, y - 1)) addEdge(x, y, x + 1, y);
      if (isOpen(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1);
      if (isOpen(x - 1, y)) addEdge(x, y, x, y + 1);
      if (isOpen(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
    }
  }

  // Chain edges into polylines. At junctions, prefer the straight
  // continuation, then emission order — both deterministic.
  const nextEdgeFrom = (at: Point, cameFrom: Point | null): EdgeKey | null => {
    const options = (incident.get(pointKey(at)) ?? []).filter(k => unused.has(k));
    if (options.length === 0) return null;
    if (cameFrom) {
      const dirX = at.x - cameFrom.x;
      const dirY = at.y - cameFrom.y;
      for (const key of options) {
        const [a, b] = edgeEndpoints(key);
        const other = a.x === at.x && a.y === at.y ? b : a;
        if (other.x - at.x === dirX && other.y - at.y === dirY) return key;
      }
    }
    return options[0];
  };

  const polylines: Point[][] = [];
  for (const start of emitted) {
    if (!unused.has(start)) continue;
    unused.delete(start);
    const [a, b] = edgeEndpoints(start);
    let line: Point[] = [a, b];

    // Extend the tail; when it dead-ends, flip once and extend the head.
    for (let pass = 0; pass < 2; pass++) {
      for (;;) {
        const tail = line[line.length - 1];
        const prev = line[line.length - 2];
        const key = nextEdgeFrom(tail, prev);
        if (!key) break;
        unused.delete(key);
        const [p, q] = edgeEndpoints(key);
        line.push(p.x === tail.x && p.y === tail.y ? q : p);
      }
      line = line.reverse();
    }

    // Merge collinear runs.
    const merged: Point[] = [line[0]];
    for (let i = 1; i < line.length - 1; i++) {
      const prev = merged[merged.length - 1];
      const cur = line[i];
      const next = line[i + 1];
      const straight =
        (prev.x === cur.x && cur.x === next.x) ||
        (prev.y === cur.y && cur.y === next.y);
      if (!straight) merged.push(cur);
    }
    merged.push(line[line.length - 1]);
    polylines.push(merged);
  }

  return polylines;
}
