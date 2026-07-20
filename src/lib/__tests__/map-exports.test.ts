import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import { mapToMarkdown } from '@/lib/map-export-text';
import { wallBoundaries } from '@/lib/map-render/wall-geometry';
import { buildUvtt } from '@/lib/uvtt-export';
import type { EncounterMap } from '@/lib/types';

const DUNGEON = generateMap({ environment: 'Urban', layout: 'dungeon', seed: 42, width: 32, height: 24 });
const CAVE = generateMap({ environment: 'Underdark', seed: 7 });

describe('mapToMarkdown', () => {
  it('renders title, dimensions, seed, and a grid block of the right height', () => {
    const md = mapToMarkdown(DUNGEON);
    expect(md).toContain(`# ${DUNGEON.name}`);
    expect(md).toContain(`Seed ${DUNGEON.seed}`);
    const fence = md.split('```');
    expect(fence.length).toBeGreaterThanOrEqual(3);
    const gridLines = fence[1].trim().split('\n');
    expect(gridLines).toHaveLength(DUNGEON.height);
    expect(gridLines[0]).toHaveLength(DUNGEON.width);
  });

  it('includes a room key entry for every room', () => {
    const md = mapToMarkdown(DUNGEON);
    expect(md).toContain('## Room Key');
    for (const room of DUNGEON.rooms!) {
      expect(md).toContain(`**${room.id}. ${room.name}**`);
      expect(md).toContain(room.readAloud);
    }
  });

  it('omits seed and room key for pre-overhaul map objects', () => {
    const legacy: EncounterMap = {
      id: CAVE.id, name: CAVE.name, width: CAVE.width, height: CAVE.height,
      environment: CAVE.environment, grid: CAVE.grid,
    };
    const md = mapToMarkdown(legacy);
    expect(md).not.toContain('Seed');
    expect(md).not.toContain('## Room Key');
  });
});

describe('buildUvtt', () => {
  const IMAGE = 'aGVsbG8=';
  const doc = buildUvtt(DUNGEON, IMAGE, 70);

  it('carries the resolution block and image through', () => {
    expect(doc.format).toBe(0.3);
    expect(doc.resolution.map_size).toEqual({ x: DUNGEON.width, y: DUNGEON.height });
    expect(doc.resolution.pixels_per_grid).toBe(70);
    expect(doc.image).toBe(IMAGE);
  });

  it('keeps every line-of-sight point inside the grid corner space', () => {
    expect(doc.line_of_sight.length).toBeGreaterThan(0);
    for (const wall of doc.line_of_sight) {
      expect(wall.length).toBeGreaterThanOrEqual(2);
      for (const point of wall) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(DUNGEON.width);
        expect(point.y).toBeLessThanOrEqual(DUNGEON.height);
      }
    }
  });

  it('emits one portal per door cell, spanning the doorway', () => {
    const doorCells: Array<{ x: number; y: number }> = [];
    DUNGEON.grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.terrain === 'door') doorCells.push({ x, y });
    }));
    expect(doc.portals).toHaveLength(doorCells.length);
    for (const portal of doc.portals) {
      expect(portal.bounds).toHaveLength(2);
      expect(portal.closed).toBe(true);
      const [a, b] = portal.bounds;
      const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      expect(length).toBe(1);
      // Position sits at the crossed cell's center.
      const cx = portal.position.x - 0.5;
      const cy = portal.position.y - 0.5;
      expect(doorCells.some(d => d.x === cx && d.y === cy)).toBe(true);
    }
  });

  it('emits pillars as closed wall loops in line_of_sight', () => {
    // Foundry's Universal Battlemap Importer (moo-man/FVTT-DD-Import)
    // never reads objects_line_of_sight, so pillars placed there would
    // silently vanish on import. Our pillars are solid columns — they
    // belong with the walls.
    const pillars: Array<{ x: number; y: number }> = [];
    DUNGEON.grid.forEach((row, y) => row.forEach((cell, x) => {
      if (cell.terrain === 'pillar') pillars.push({ x, y });
    }));
    expect(pillars.length, 'fixture must contain pillars').toBeGreaterThan(0);
    expect(doc.objects_line_of_sight).toEqual([]);
    expect(doc.line_of_sight).toHaveLength(wallBoundaries(DUNGEON).length + pillars.length);
    for (const p of pillars) {
      expect(doc.line_of_sight).toContainEqual([
        { x: p.x, y: p.y }, { x: p.x + 1, y: p.y },
        { x: p.x + 1, y: p.y + 1 }, { x: p.x, y: p.y + 1 }, { x: p.x, y: p.y },
      ]);
    }
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});
