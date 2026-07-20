import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import { mergeWallRects, wallBoundaries } from '@/lib/map-render/wall-geometry';
import { buildMapScene, CELL, RULER_GUTTER } from '@/lib/map-render/scene';
import { DARK_PALETTE, LIGHT_PALETTE } from '@/lib/map-render/palettes';
import { sceneToSvgString } from '@/lib/map-render/svg';
import type { EncounterMap, MapToken } from '@/lib/types';

const SAMPLE_MAPS: EncounterMap[] = [];
for (const environment of ['Urban', 'Underdark', 'Forest'] as const) {
  for (let seed = 1; seed <= 10; seed++) {
    SAMPLE_MAPS.push(generateMap({ environment, seed }));
  }
}

function wallCellCount(map: EncounterMap): number {
  return map.grid.flat().filter((cell) => cell.terrain === 'wall').length;
}

describe('mergeWallRects', () => {
  it('covers every wall cell exactly once and stays in bounds', () => {
    for (const map of SAMPLE_MAPS) {
      const rects = mergeWallRects(map);
      const painted = new Set<number>();
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(map.width);
        expect(rect.y + rect.h).toBeLessThanOrEqual(map.height);
        for (let y = rect.y; y < rect.y + rect.h; y++) {
          for (let x = rect.x; x < rect.x + rect.w; x++) {
            const cell = y * map.width + x;
            expect(painted.has(cell), `overlap at ${x},${y}`).toBe(false);
            painted.add(cell);
            expect(map.grid[y][x].terrain).toBe('wall');
          }
        }
      }
      expect(painted.size).toBe(wallCellCount(map));
    }
  });
});

describe('wallBoundaries', () => {
  /** Count wall/open boundary edges directly from the grid. */
  function boundaryEdgeCount(map: EncounterMap): number {
    let count = 0;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x].terrain !== 'wall') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          if (map.grid[ny][nx].terrain !== 'wall') count++;
        }
      }
    }
    return count;
  }

  it('preserves every boundary edge exactly once across polylines', () => {
    for (const map of SAMPLE_MAPS) {
      const polylines = wallBoundaries(map);
      let totalLength = 0;
      for (const line of polylines) {
        expect(line.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < line.length; i++) {
          const dx = Math.abs(line[i].x - line[i - 1].x);
          const dy = Math.abs(line[i].y - line[i - 1].y);
          expect(dx === 0 || dy === 0, 'polylines are axis-aligned').toBe(true);
          totalLength += dx + dy;
        }
      }
      expect(totalLength).toBe(boundaryEdgeCount(map));
    }
  });

  it('keeps all points within the grid corner space', () => {
    for (const map of SAMPLE_MAPS) {
      for (const line of wallBoundaries(map)) {
        for (const point of line) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(map.width);
          expect(point.y).toBeLessThanOrEqual(map.height);
        }
      }
    }
  });

  it('is deterministic', () => {
    const map = generateMap({ environment: 'Urban', seed: 42 });
    expect(wallBoundaries(map)).toEqual(wallBoundaries(map));
  });
});

describe('buildMapScene', () => {
  it('sizes the scene from cells plus the ruler gutter', () => {
    const map = generateMap({ environment: 'Urban', seed: 42 });
    const scene = buildMapScene(map);
    expect(scene.widthPx).toBe(map.width * CELL + RULER_GUTTER);
    expect(scene.heightPx).toBe(map.height * CELL + RULER_GUTTER);
    expect(scene.rulers.cols).toHaveLength(map.width);
    expect(scene.rulers.rows).toHaveLength(map.height);
    expect(scene.rulers.cols[0]).toBe('A');
    expect(scene.rulers.rows[0]).toBe('1');
  });

  it('labels rooms and chambers but not zones', () => {
    const dungeon = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 42, width: 32, height: 24 });
    const scene = buildMapScene(dungeon);
    const labelable = dungeon.rooms!.filter((room) => room.kind !== 'zone');
    expect(scene.roomLabels).toHaveLength(labelable.length);
  });

  it('renders maps without rooms (pre-overhaul persisted shape)', () => {
    const map = generateMap({ environment: 'Underdark', seed: 7 });
    const legacy: EncounterMap = {
      id: map.id, name: map.name, width: map.width, height: map.height,
      environment: map.environment, grid: map.grid,
    };
    const scene = buildMapScene(legacy);
    expect(scene.roomLabels).toHaveLength(0);
    const svg = sceneToSvgString(scene, DARK_PALETTE);
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('carries tokens through to the scene', () => {
    const map = generateMap({ environment: 'Urban', seed: 42 });
    const tokens: MapToken[] = [
      { id: 'party-0', kind: 'party', name: 'Fighter', label: 'F', x: 2, y: 2, sizeCells: 1 },
      { id: 'm#0', kind: 'monster', name: 'Ogre', label: 'O', x: 5, y: 5, sizeCells: 2 },
    ];
    expect(buildMapScene(map, tokens).tokens).toEqual(tokens);
  });
});

describe('sceneToSvgString', () => {
  const map = generateMap({ environment: 'Urban', seed: 42 });
  const scene = buildMapScene(map);

  it('produces a deterministic, well-formed svg document', () => {
    const svg = sceneToSvgString(scene, DARK_PALETTE);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${scene.widthPx} ${scene.heightPx}"`);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('NaN');
    expect(sceneToSvgString(scene, DARK_PALETTE)).toBe(svg);
  });

  it('differs between dark and light palettes', () => {
    expect(sceneToSvgString(scene, DARK_PALETTE)).not.toBe(sceneToSvgString(scene, LIGHT_PALETTE));
  });

  it('draws room number chips when labels are on', () => {
    // Chips need rooms/chambers (city zones are keyed off-map), and
    // rulers off so row-label "1" text can't shadow the room chip "1".
    const dungeonScene = buildMapScene(
      generateMap({ environment: 'Urban', layout: 'dungeon', seed: 42 }),
    );
    const withLabels = sceneToSvgString(dungeonScene, DARK_PALETTE, { showRoomLabels: true, showRulers: false });
    const without = sceneToSvgString(dungeonScene, DARK_PALETTE, { showRoomLabels: false, showRulers: false });
    expect(withLabels).toContain('>1</text>');
    expect(without).not.toContain('</text>');
  });

  it('renders tokens as labelled circles', () => {
    const tokens: MapToken[] = [
      { id: 'party-0', kind: 'party', name: 'Cleric', label: 'C', x: 3, y: 3, sizeCells: 1 },
    ];
    const svg = sceneToSvgString(buildMapScene(map, tokens), DARK_PALETTE);
    expect(svg).toContain('>C</text>');
  });

  it('escapes markup in token names and labels (injection guard)', () => {
    const tokens: MapToken[] = [{
      id: 'm#0', kind: 'monster', x: 4, y: 4, sizeCells: 1,
      name: '<script>alert(1)</script> & "Bandit"',
      label: '<b>',
    }];
    const svg = sceneToSvgString(buildMapScene(map, tokens), DARK_PALETTE);
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&lt;b&gt;');
  });
});
