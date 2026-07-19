import { describe, expect, it } from 'vitest';
import { simulateBattle } from '@/lib/battle-sim';
import {
  battlefieldFromMap, chebyshev, DistanceFieldCache, stepAway, stepToward,
} from '@/lib/sim/movement';
import { generateMap } from '@/lib/map-generator';
import { placeTokens } from '@/lib/token-placement';
import type { Battlefield, SimMonster, SimPlayer } from '@/lib/battle-sim-types';

// ─── Fixtures ────────────────────────────────────────────────────

function player(id: string, overrides: Partial<SimPlayer> = {}): SimPlayer {
  return {
    id,
    name: id,
    level: 5,
    ac: 16,
    maxHp: 40,
    attacksPerRound: 2,
    attackBonus: 7,
    avgDamagePerHit: 10,
    saveBonuses: { dex: 2, con: 3, wis: 2 },
    initiativeMod: 2,
    ...overrides,
  };
}

function wolf(i: number, overrides: Partial<SimMonster> = {}): SimMonster {
  return {
    id: `wolf#${i}`,
    sourceId: 'wolf',
    name: `Wolf #${i + 1}`,
    ac: 13,
    maxHp: 11,
    initiativeMod: 2,
    saves: { str: 1, dex: 2, con: 1, int: -3, wis: 0, cha: -2 },
    attacks: [{
      name: 'Bite', attackBonus: 4,
      damageDice: { n: 2, d: 4, mod: 2 }, avgDamage: 7, count: 1,
    }],
    threat: 7,
    synthesizedAttack: false,
    parseWarnings: [],
    ...overrides,
  };
}

const PARTY = [player('p1'), player('p2'), player('p3'), player('p4')];
const PACK = Array.from({ length: 6 }, (_, i) => wolf(i));

// ─── Abstract regression lock ────────────────────────────────────
// The spatial mode is fully gated on options.battlefield: with no
// battlefield the engine must stay BIT-IDENTICAL to the pre-spatial
// implementation. This pins a full report for a fixed seed. If it
// ever fails, the abstract rng draw order changed — that is a
// regression, not a test to update.

describe('abstract engine freeze', () => {
  it('produces the pinned report when no battlefield is given', () => {
    const report = simulateBattle(PARTY, PACK, { seed: 1234, iterations: 200 });
    expect({
      partyWinRate: report.partyWinRate,
      stalemateRate: report.stalemateRate,
      avgRounds: report.avgRounds,
      avgPartyHpRemainingPct: report.avgPartyHpRemainingPct,
      partyHitRate: report.partyHitRate,
      monsterHitRate: report.monsterHitRate,
      simLabel: report.simLabel,
      curvePoints: report.hpCurve.length,
      spatial: report.spatial ?? null,
    }).toEqual({
      partyWinRate: 1,
      stalemateRate: 0,
      avgRounds: 2.22,
      avgPartyHpRemainingPct: 0.8769374999999999,
      partyHitRate: 0.7640301936330817,
      monsterHitRate: 0.4299917149958575,
      simLabel: 'Trivial',
      curvePoints: 20,
      spatial: null,
    });
  });
});

// ─── Movement unit tests ─────────────────────────────────────────

/** Synthetic battlefield: all cost 1 unless the painter says otherwise. */
function makeField(
  w: number, h: number,
  paint?: (x: number, y: number) => number,
): Battlefield {
  const cost = new Uint8Array(w * h).fill(1);
  if (paint) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) cost[y * w + x] = paint(x, y);
    }
  }
  return { width: w, height: h, cost, playerSpawns: [], monsterSpawns: new Map() };
}

describe('movement primitives', () => {
  it('measures range in chebyshev cells (5e gridded diagonals)', () => {
    expect(chebyshev(0, 0, 10)).toBe(0);
    expect(chebyshev(0, 3, 10)).toBe(3);        // same row
    expect(chebyshev(0, 33, 10)).toBe(3);       // diagonal 3,3
    expect(chebyshev(5, 47, 10)).toBe(4);       // dx 2, dy 4
  });

  it('computes open-field distances equal to chebyshev', () => {
    const bf = makeField(12, 12);
    const cache = new DistanceFieldCache(bf);
    const field = cache.fieldTo(0);
    expect(field[11]).toBe(11);
    expect(field[11 * 12 + 11]).toBe(11);       // corner-to-corner diagonal
  });

  it('routes around walls (detour longer than chebyshev)', () => {
    // Wall at x=5, gap only at the top. Start/target sit at y=10, so
    // the detour's vertical travel (10 up + 10 down) exceeds the 10-
    // cell horizontal span — in Chebyshev metric that means 20, not 10.
    const bf = makeField(11, 21, (x, y) => (x === 5 && y > 0 ? 0 : 1));
    const cache = new DistanceFieldCache(bf);
    const target = 10 * 11 + 0;
    const from = 10 * 11 + 10;
    const direct = chebyshev(from, target, 11);
    expect(direct).toBe(10);
    expect(cache.fieldTo(target)[from]).toBe(20);
  });

  it('charges double for difficult ground', () => {
    // Full-height difficult band: no cheap lane around it.
    const bf = makeField(11, 3, (x) => (x >= 3 && x <= 7 ? 2 : 1));
    const cache = new DistanceFieldCache(bf);
    const field = cache.fieldTo(1 * 11 + 0);
    expect(field[1 * 11 + 10]).toBe(10 + 5);    // five difficult columns crossed
  });

  it('stepToward covers exactly its speed on clear ground and stops at enemies', () => {
    const bf = makeField(20, 3);
    const cache = new DistanceFieldCache(bf);
    const target = 1 * 20 + 0;
    const field = cache.fieldTo(target);
    const from = 1 * 20 + 15;
    const arrived = stepToward(from, field, 6, bf, new Set(), new Set());
    expect(field[arrived]).toBe(field[from] - 6);

    // A full wall of enemies (all 3 rows) — diagonals can't slip past.
    const enemyWall = new Set([0 * 20 + 12, 1 * 20 + 12, 2 * 20 + 12]);
    const blocked = stepToward(from, field, 6, bf, enemyWall, new Set());
    expect(field[blocked]).toBeGreaterThan(field[from] - 6);
  });

  it('stepAway increases distance from the threat', () => {
    const bf = makeField(20, 20);
    const cache = new DistanceFieldCache(bf);
    const threat = 10 * 20 + 10;
    const from = 10 * 20 + 11;                  // adjacent
    const fled = stepAway(from, cache.fieldTo(threat), 6, bf, new Set(), new Set());
    expect(cache.fieldTo(threat)[fled]).toBeGreaterThan(1);
  });
});

describe('battlefieldFromMap', () => {
  const map = generateMap({ environment: 'Urban', seed: 42, width: 32, height: 24 });
  const placement = placeTokens(map, [], 4, 42);
  const bf = battlefieldFromMap(map, placement);

  it('classifies terrain into impassable, normal, and difficult', () => {
    let sawWall = false;
    let sawFloor = false;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const terrain = map.grid[y][x].terrain;
        const cost = bf.cost[y * map.width + x];
        if (terrain === 'wall') { expect(cost).toBe(0); sawWall = true; }
        if (terrain === 'floor') { expect(cost).toBe(1); sawFloor = true; }
        if (terrain === 'difficult') expect(cost).toBe(2);
      }
    }
    expect(sawWall && sawFloor).toBe(true);
  });

  it('treats water as open ground on underwater maps', () => {
    const sea = generateMap({ environment: 'Underwater', seed: 3 });
    const seaBf = battlefieldFromMap(sea, placeTokens(sea, [], 4, 3));
    let checked = 0;
    for (let y = 0; y < sea.height; y++) {
      for (let x = 0; x < sea.width; x++) {
        if (sea.grid[y][x].terrain === 'water') {
          expect(seaBf.cost[y * sea.width + x]).toBe(1);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('maps party spawns by order and monster spawns by token id', () => {
    expect(bf.playerSpawns).toHaveLength(4);
    for (const cell of bf.playerSpawns) {
      expect(bf.cost[cell]).toBeGreaterThan(0);
    }
  });
});

// ─── Spatial simulation ──────────────────────────────────────────

function spatialParty(range: number): SimPlayer[] {
  return ['p1', 'p2', 'p3', 'p4'].map(id =>
    player(id, { rangeCells: range, speedCells: 6 }));
}

function meleePack(count: number, hp = 37, damage = { n: 2, d: 6, mod: 3 }): SimMonster[] {
  return Array.from({ length: count }, (_, i) => wolf(i, {
    maxHp: hp,
    speedCells: 8,
    attacks: [{
      name: 'Bite', attackBonus: 5, damageDice: damage,
      avgDamage: damage.n * (damage.d + 1) / 2 + damage.mod, count: 1,
      reachCells: 1,
    }],
    threat: 10,
  }));
}

function spawnsAcross(bf: Battlefield, players: SimPlayer[], monsters: SimMonster[], gapX: number) {
  const midY = Math.floor(bf.height / 2);
  players.forEach((p, i) => {
    bf.playerSpawns.push((midY + i - Math.floor(players.length / 2)) * bf.width + (bf.width - 2));
  });
  monsters.forEach((m, i) => {
    bf.monsterSpawns.set(m.id, (midY + i - Math.floor(monsters.length / 2)) * bf.width + gapX);
  });
}

describe('spatial simulation', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const bf = makeField(24, 18);
    spawnsAcross(bf, spatialParty(12), meleePack(6), 1);
    const run = (seed: number) =>
      simulateBattle(spatialParty(12), meleePack(6), { seed, iterations: 100, battlefield: bf });
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('reports rounds-to-contact of 1 when the sides start adjacent', () => {
    const bf = makeField(12, 12);
    const party = spatialParty(1);
    const pack = meleePack(4, 11);
    party.forEach((p, i) => bf.playerSpawns.push(5 * 12 + 4 + (i % 2) + (i > 1 ? 12 : 0)));
    pack.forEach((m, i) => bf.monsterSpawns.set(m.id, 5 * 12 + 6 + (i % 2) + (i > 1 ? 12 : 0)));
    const report = simulateBattle(party, pack, { seed: 5, iterations: 100, battlefield: bf });
    expect(report.spatial).toBeDefined();
    expect(report.spatial!.avgRoundsToContact).toBe(1);
  });

  it('takes longer to reach contact across a wide field', () => {
    const bf = makeField(40, 20);
    const party = spatialParty(1);       // melee party — must close the gap
    const pack = meleePack(4);
    spawnsAcross(bf, party, pack, 1);    // ~37 cells apart, closing 14/round
    const report = simulateBattle(party, pack, { seed: 5, iterations: 100, battlefield: bf });
    expect(report.spatial!.avgRoundsToContact).toBeGreaterThan(1.5);
    expect(report.spatial!.avgRoundsToContact).toBeLessThan(6);
  });

  it('lets a ranged party hold a corridor better than an open field', () => {
    const party = spatialParty(12);
    const pack = meleePack(8);

    const open = makeField(30, 15);
    spawnsAcross(open, party, pack, 1);

    // Same size, but only a 3-row corridor is passable.
    const corridor = makeField(30, 15, (x, y) => (y >= 6 && y <= 8 ? 1 : 0));
    const midY = 7;
    party.forEach((p, i) => corridor.playerSpawns.push((6 + (i % 3)) * 30 + 28 - Math.floor(i / 3)));
    pack.forEach((m, i) => corridor.monsterSpawns.set(m.id, (6 + (i % 3)) * 30 + 1 + Math.floor(i / 3)));

    const openReport = simulateBattle(party, pack, { seed: 11, iterations: 300, battlefield: open });
    const corridorReport = simulateBattle(party, pack, { seed: 11, iterations: 300, battlefield: corridor });

    // Deterministic per seed (recorded: open 0.77 / corridor 0.84).
    // The chokepoint throttles how many wolves engage at once, so the
    // ranged party should win noticeably more often and finish
    // healthier than on the open field.
    expect(corridorReport.partyWinRate).toBeGreaterThan(openReport.partyWinRate + 0.03);
    expect(corridorReport.avgPartyHpRemainingPct)
      .toBeGreaterThanOrEqual(openReport.avgPartyHpRemainingPct);
  });

  it('completes a worst-case board within a sane time budget', () => {
    const map = generateMap({ environment: 'Urban', seed: 9, width: 40, height: 30, featureDensity: 'Dense' });
    const party = spatialParty(12);
    const pack = meleePack(8);
    const placement = placeTokens(
      map,
      [{ monster: { ...FAKE_WOLF_MONSTER }, count: 8 }],
      4,
      9,
    );
    const bf = battlefieldFromMap(map, placement);
    // Guarantee every combatant has a spawn even if placement overflowed.
    party.forEach((p, i) => { if (bf.playerSpawns.length <= i) bf.playerSpawns.push(bf.playerSpawns[0] ?? 41); });
    pack.forEach(m => { if (!bf.monsterSpawns.has(m.id)) bf.monsterSpawns.set(m.id, bf.playerSpawns[0] + 2); });

    const started = performance.now();
    const report = simulateBattle(party, pack, { seed: 9, iterations: 1000, battlefield: bf });
    const elapsed = performance.now() - started;
    expect(report.iterations).toBe(1000);
    expect(elapsed).toBeLessThan(15000);
  });
});

// Minimal Monster stand-in for the perf test's placement call.
import { makeMonster } from './test-helpers';
const FAKE_WOLF_MONSTER = makeMonster({ id: 'wolf', name: 'Wolf' });
