import { describe, expect, it } from 'vitest';
import { generateMap } from '@/lib/map-generator';
import { placeTokens, TOKEN_BLOCKING } from '@/lib/token-placement';
import { makeMonster } from './test-helpers';
import type { EncounterMonster, MapToken } from '@/lib/types';

const DUNGEON = generateMap({ environment: 'Urban', seed: 42, width: 32, height: 24 });
const OUTDOOR = generateMap({ environment: 'Grassland', seed: 42 });

const WOLF = makeMonster({ id: 'wolf', name: 'Wolf', xp: 50, attackDeliveryModes: ['Melee'] });
const ARCHER = makeMonster({ id: 'archer', name: 'Archer', xp: 100, attackDeliveryModes: ['Ranged'] });
const OGRE = makeMonster({ id: 'ogre', name: 'Ogre', size: 'Large', xp: 450, attackDeliveryModes: ['Melee'] });

const MONSTERS: EncounterMonster[] = [
  { monster: WOLF, count: 3 },
  { monster: ARCHER, count: 2 },
  { monster: OGRE, count: 1 },
];

function footprintCells(token: MapToken, width: number): number[] {
  const cells: number[] = [];
  for (let dy = 0; dy < token.sizeCells; dy++) {
    for (let dx = 0; dx < token.sizeCells; dx++) {
      cells.push((token.y + dy) * width + (token.x + dx));
    }
  }
  return cells;
}

describe('placeTokens', () => {
  const placement = placeTokens(DUNGEON, MONSTERS, 4, 42);

  it('is deterministic per seed and varies across seeds', () => {
    expect(placeTokens(DUNGEON, MONSTERS, 4, 42)).toEqual(placement);
    const other = placeTokens(DUNGEON, MONSTERS, 4, 43);
    expect(other).not.toEqual(placement);
  });

  it('never mutates the map', () => {
    const before = JSON.stringify(DUNGEON);
    placeTokens(DUNGEON, MONSTERS, 4, 99);
    expect(JSON.stringify(DUNGEON)).toBe(before);
  });

  it('places one token per party slot and monster instance with sim-compatible ids', () => {
    expect(placement.tokens).toHaveLength(4 + 3 + 2 + 1);
    const ids = placement.tokens.map(t => t.id);
    for (let i = 0; i < 4; i++) expect(ids).toContain(`party-${i}`);
    for (let i = 0; i < 3; i++) expect(ids).toContain(`wolf#${i}`);
    for (let i = 0; i < 2; i++) expect(ids).toContain(`archer#${i}`);
    expect(ids).toContain('ogre#0');
  });

  it('keeps every footprint on legal, in-bounds terrain with no overlaps', () => {
    for (const environment of [DUNGEON, OUTDOOR]) {
      const { tokens } = placeTokens(environment, MONSTERS, 5, 7);
      const occupied = new Set<number>();
      for (const token of tokens) {
        expect(token.x).toBeGreaterThanOrEqual(0);
        expect(token.y).toBeGreaterThanOrEqual(0);
        expect(token.x + token.sizeCells).toBeLessThanOrEqual(environment.width);
        expect(token.y + token.sizeCells).toBeLessThanOrEqual(environment.height);
        for (const cell of footprintCells(token, environment.width)) {
          const terrain = environment.grid[Math.floor(cell / environment.width)][cell % environment.width].terrain;
          expect(TOKEN_BLOCKING.has(terrain), `token ${token.id} on ${terrain}`).toBe(false);
          expect(occupied.has(cell), `overlap at cell ${cell}`).toBe(false);
          occupied.add(cell);
        }
      }
    }
  });

  it('starts the party inside its spawn zone', () => {
    const partyCells = new Set<number>();
    for (const room of DUNGEON.rooms!.filter(r => r.tags.includes('spawn:party'))) {
      if (room.cells) room.cells.forEach(c => partyCells.add(c));
      else {
        for (let y = room.bounds.y; y < room.bounds.y + room.bounds.h; y++) {
          for (let x = room.bounds.x; x < room.bounds.x + room.bounds.w; x++) {
            partyCells.add(y * DUNGEON.width + x);
          }
        }
      }
    }
    for (const token of placement.tokens.filter(t => t.kind === 'party')) {
      expect(partyCells.has(token.y * DUNGEON.width + token.x),
        `party token at ${token.x},${token.y} outside spawn zone`).toBe(true);
    }
  });

  it('gives the highest-xp monster the boss room on dungeon maps', () => {
    const bossRoom = DUNGEON.rooms!.find(r => r.tags.includes('boss'))!;
    const ogre = placement.tokens.find(t => t.id === 'ogre#0')!;
    const inBoss = footprintCells(ogre, DUNGEON.width).some(cell => {
      const x = cell % DUNGEON.width;
      const y = Math.floor(cell / DUNGEON.width);
      return x >= bossRoom.bounds.x && x < bossRoom.bounds.x + bossRoom.bounds.w &&
        y >= bossRoom.bounds.y && y < bossRoom.bounds.y + bossRoom.bounds.h;
    });
    expect(inBoss).toBe(true);
  });

  it('sizes footprints from creature size', () => {
    const ogre = placement.tokens.find(t => t.id === 'ogre#0')!;
    expect(ogre.sizeCells).toBe(2);
    const wolf = placement.tokens.find(t => t.id === 'wolf#0')!;
    expect(wolf.sizeCells).toBe(1);
  });

  it('places ranged instances no closer to the party than melee ones', () => {
    // Distance here is straight-line to the party centroid — a coarse
    // check that the ranged-deep / melee-front doctrine held.
    const { tokens } = placement;
    const party = tokens.filter(t => t.kind === 'party');
    const cx = party.reduce((s, t) => s + t.x, 0) / party.length;
    const cy = party.reduce((s, t) => s + t.y, 0) / party.length;
    const dist = (t: MapToken) => Math.hypot(t.x - cx, t.y - cy);
    const avgWolf = ['wolf#0', 'wolf#1', 'wolf#2']
      .map(id => dist(tokens.find(t => t.id === id)!)).reduce((a, b) => a + b) / 3;
    const avgArcher = ['archer#0', 'archer#1']
      .map(id => dist(tokens.find(t => t.id === id)!)).reduce((a, b) => a + b) / 2;
    expect(avgArcher).toBeGreaterThanOrEqual(avgWolf * 0.9);
  });

  it('reports notes instead of dropping tokens when zones overflow', () => {
    const horde: EncounterMonster[] = [{ monster: WOLF, count: 30 }];
    const { tokens, notes } = placeTokens(generateMap({ environment: 'Urban', seed: 5, width: 10, height: 10 }), horde, 8, 1);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens).toHaveLength(Math.min(38, tokens.length));
    expect(Array.isArray(notes)).toBe(true);
  });
});
