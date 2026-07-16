// src/lib/puzzle-engines/tile-path.ts
// ─── Tile Path (the Deadly Floor, evolved) ───────────────────────
// A safe path across a symbol grid, matching a "constellation" clue.
// DFS-verified: exactly one clue-consistent path exists (spec §7.1).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { damageDice, dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface TilePathInstance {
  size: number;
  symbols: string[];     // tile symbol per cell, row-major; row 0 = north (far) edge
  clue: string[];        // symbol sequence along the safe path, south → north
  path: number[];        // cell indices, south → north
}

/** All self-avoiding south-edge→north-edge paths of exactly clue.length cells matching the clue. */
export function cluePaths(inst: TilePathInstance): number[][] {
  const { size, symbols, clue } = inst;
  const found: number[][] = [];
  const visited = new Set<number>();
  const step = (cell: number, depth: number, acc: number[]) => {
    if (symbols[cell] !== clue[depth]) return;
    acc.push(cell); visited.add(cell);
    if (depth === clue.length - 1) {
      if (cell < size) found.push([...acc]); // reached north row
    } else {
      const r = Math.floor(cell / size);
      const c = cell % size;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const nxt = rr * size + cc;
        if (!visited.has(nxt)) step(nxt, depth + 1, acc);
      }
    }
    acc.pop(); visited.delete(cell);
  };
  for (let c = 0; c < size; c++) step((size - 1) * size + c, 0, []); // south row starts
  return found;
}

/** Random self-avoiding path of exact length from south row to north row, or null. */
function drawPath(size: number, len: number, rng: Rng): number[] | null {
  const starts = shuffleArray(Array.from({ length: size }, (_, c) => (size - 1) * size + c), rng);
  const visited = new Set<number>();
  let result: number[] | null = null;
  const walk = (cell: number, acc: number[]): boolean => {
    acc.push(cell); visited.add(cell);
    if (acc.length === len) {
      if (cell < size) { result = [...acc]; return true; }
    } else {
      const r = Math.floor(cell / size);
      const c = cell % size;
      const dirs = shuffleArray([[-1, 0], [1, 0], [0, -1], [0, 1]], rng);
      for (const [dr, dc] of dirs) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const nxt = rr * size + cc;
        if (!visited.has(nxt) && walk(nxt, acc)) return true;
      }
    }
    acc.pop(); visited.delete(cell);
    return false;
  };
  for (const s of starts) {
    if (walk(s, [])) return result;
    visited.clear();
  }
  return null;
}

export function buildTilePathInstance(size: number, pathLen: number, symbolPool: string[], rng: Rng): TilePathInstance {
  const mkWithFill = (fill: (pathSet: Set<number>, clueSet: Set<string>) => (cell: number) => string): TilePathInstance | null => {
    const path = drawPath(size, pathLen, rng);
    if (!path) return null;
    const clue = path.map(() => pick(symbolPool.slice(0, 4), rng)); // clue uses ≤4 of 5 symbols
    const symbols: string[] = Array(size * size).fill('');
    const pathSet = new Set(path);
    path.forEach((cell, i) => { symbols[cell] = clue[i]; });
    const filler = fill(pathSet, new Set(clue));
    for (let cell = 0; cell < size * size; cell++) {
      if (!pathSet.has(cell)) symbols[cell] = filler(cell);
    }
    return { size, symbols, clue, path };
  };
  return verified(
    100,
    () => mkWithFill(() => () => pick(symbolPool, rng))
      ?? { size, symbols: [], clue: [], path: [] },
    inst => inst.path.length === pathLen && cluePaths(inst).length === 1,
    // Canonical: off-path tiles all get a symbol the clue never uses.
    () => {
      const inst = mkWithFill((_pathSet, clueSet) => () => symbolPool.find(s => !clueSet.has(s)) ?? symbolPool[4])!;
      return inst;
    },
  );
}

const PARAMS = { Easy: [4, 4], Medium: [5, 5], Hard: [6, 7] } as const;

export const tilePath: PuzzleFamily = {
  key: 'tile-path',
  label: 'The Constellation Floor',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [size, len] = PARAMS[levers.difficulty];
    const pack = levers.theme;
    const pool = pack.symbolSets[0].slice(0, 5);
    const inst = buildTilePathInstance(size, len, pool, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const coord = (i: number) => `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`;
    const pathText = inst.path.map(coord).join(' → ');
    const allHints = [
      `The ceiling pattern is a MAP: its symbols, in order, are the safe tiles from the near edge to the far edge.`,
      `DC ${dc} Perception: the safe tiles' engravings are minutely deeper-cut than the others.`,
      `A tossed coin triggers a wrong tile harmlessly from a distance.`,
      `The path never doubles back onto itself.`,
    ];
    return {
      name: 'The Constellation Floor',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A ${size}×${size} tiled floor; only one ${len}-tile path (matching the ceiling sequence ${inst.clue.join(' → ')}) is safe. Safe path from the near edge: ${pathText}. Wrong tiles: ${damageDice(levers.partyLevel, levers.difficulty, 'recurring')} piercing (DC ${dc} DEX save for half). Row 1 on the handout is the FAR edge.`,
      readAloud: `The chamber floor is a grid of engraved tiles — ${pack.sensory[0]}. High above, inlaid in the ceiling of ${pick(pack.materials, rng)}, a sequence of symbols glimmers faintly: ${inst.clue.join(', ')}.`,
      handout: {
        kind: 'grid-diagram', rows: size, cols: size,
        cells: inst.symbols.map(s => ({ label: s.slice(0, 2) })),
        legend: [
          `Ceiling sequence: ${inst.clue.join(' → ')}`,
          `Symbols: ${pool.map(s => `${s.slice(0, 2)}=${s}`).join(', ')}`,
          `Enter from the bottom row; reach the top row`,
        ],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The only safe path: ${pathText}. Each tile matches the ceiling sequence in order.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong tile fires darts from the walls.', save: 'DEX' }),
      reward: rewardText(levers, rng),
    };
  },
};
