// ─── Sum Lock (masked magic square) ──────────────────────────────
// A Lo Shu variant with masked cells, brute-force verified to admit
// exactly one completion (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface SumLockInstance {
  grid: number[];        // 9 values, row-major
  masked: number[];      // indices hidden from players
  target: number;        // line sum
}

const LO_SHU = [8, 1, 6, 3, 5, 7, 4, 9, 2];

function transform(base: number[], variant: number): number[] {
  // 8 symmetries of the square: 4 rotations × optional mirror.
  const idx = (r: number, c: number) => r * 3 + c;
  let cells = base.map((_, i) => base[i]);
  const rotate = (g: number[]) => {
    const out = Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[idx(c, 2 - r)] = g[idx(r, c)];
    return out;
  };
  const mirror = (g: number[]) => {
    const out = Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[idx(r, 2 - c)] = g[idx(r, c)];
    return out;
  };
  for (let i = 0; i < variant % 4; i++) cells = rotate(cells);
  if (variant >= 4) cells = mirror(cells);
  return cells;
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

export function countSumCompletions(inst: SumLockInstance, limit: number): number {
  const missing = inst.masked.map(i => inst.grid[i]);
  const perms = permute(missing);
  let count = 0;
  for (const p of perms) {
    const g = [...inst.grid];
    inst.masked.forEach((cell, i) => { g[cell] = p[i]; });
    if (LINES.every(line => line.reduce((sum, i) => sum + g[i], 0) === inst.target)) count++;
    if (count >= limit) break;
  }
  return count;
}

function permute(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  const out: number[][] = [];
  values.forEach((v, i) => {
    for (const rest of permute([...values.slice(0, i), ...values.slice(i + 1)])) out.push([v, ...rest]);
  });
  return out;
}

export function buildSumLockInstance(masked: number, rng: Rng): SumLockInstance {
  return verified(
    100,
    () => {
      const variant = Math.floor(rng() * 8);
      const c = Math.floor(rng() * 5);
      const grid = transform(LO_SHU, variant).map(v => v + c);
      const maskedIdx = shuffleArray(Array.from({ length: 9 }, (_, i) => i), rng).slice(0, masked);
      return { grid, masked: maskedIdx, target: 15 + 3 * c };
    },
    inst => countSumCompletions(inst, 2) === 1,
    // Canonical: masking a prefix of cells 0..4 of plain Lo Shu admits a
    // unique completion for 3, 4, and 5 masks (verified by the same brute
    // force) — and it honors the requested mask count.
    () => ({ grid: [...LO_SHU], masked: [0, 1, 2, 3, 4].slice(0, masked), target: 15 }),
  );
}

const MASKED = { Easy: 3, Medium: 4, Hard: 5 } as const;

export const sumLock: PuzzleFamily = {
  key: 'sum-lock',
  label: 'The Balanced Stones',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const masked = MASKED[levers.difficulty];
    const inst = buildSumLockInstance(masked, rng);
    const pack = levers.theme;
    const loose = inst.masked.map(i => inst.grid[i]).sort((a, b) => a - b);
    const answer = inst.masked.map(i => `${inst.grid[i]} at row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}`).join('; ');
    const allHints = [
      `Every row, column, and diagonal must sum to the same number.`,
      `Add up a complete line to find the target: ${inst.target}.`,
      `The center stone belongs to four different lines — place it first if it is missing.`,
      `Each loose stone is used exactly once.`,
    ];
    return {
      name: 'The Balanced Stones',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A 3×3 grid of numbered stones; ${masked} are missing and lie loose nearby (${loose.join(', ')}). Every line must sum to ${inst.target}. Unique placement: ${answer}.`,
      readAloud: `Set into the ${pack.materials[2] ?? pack.materials[0]} floor is a three-by-three frame of numbered stones — but ${masked} sockets gape empty, their stones scattered ${pack.sensory[4] ?? 'nearby'}.`,
      handout: {
        kind: 'grid-diagram', rows: 3, cols: 3,
        cells: inst.grid.map((v, i) => inst.masked.includes(i) ? { state: 'masked' as const } : { label: String(v) }),
        legend: [`Loose stones: ${loose.join(', ')}`, `Every line must balance`],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Place ${answer}. Every row, column, and diagonal then sums to ${inst.target}.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'An unbalanced line makes the frame shudder and spit its stones.', save: 'STR' }),
      reward: rewardText(levers, rng),
    };
  },
};
