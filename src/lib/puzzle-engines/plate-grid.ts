// ─── Plate Grid (Lights-Out) ─────────────────────────────────────
// Built backward from the all-lit goal with k distinct presses, so
// the construction IS one valid solution (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { estimatedMinutes, hintCount, operatorCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

export interface PlateInstance { size: number; initial: boolean[]; presses: number[] }

export function applyPress(cells: boolean[], size: number, idx: number): void {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const flip = (rr: number, cc: number) => {
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) return;
    cells[rr * size + cc] = !cells[rr * size + cc];
  };
  flip(r, c); flip(r - 1, c); flip(r + 1, c); flip(r, c - 1); flip(r, c + 1);
}

export function buildPlateInstance(size: number, k: number, rng: Rng): PlateInstance {
  // Work backward from all-lit. Presses are involutions, so re-applying
  // the same k distinct presses restores all-lit. The initial state can
  // never be all-lit for the locked (size, k) params: a k-press set nets
  // to zero only if it equals a "quiet pattern" (kernel element of the
  // toggle matrix), and no 4x4/5x5 quiet pattern has weight 4 or 5 —
  // verify anew if these params ever change.
  const cells = Array(size * size).fill(true);
  const presses = shuffleArray(Array.from({ length: size * size }, (_, i) => i), rng).slice(0, k);
  for (const p of presses) applyPress(cells, size, p);
  return { size, initial: cells, presses };
}

const PARAMS = { Easy: [3, 3], Medium: [4, 4], Hard: [5, 5] } as const;

export const plateGrid: PuzzleFamily = {
  key: 'plate-grid',
  label: 'The Waking Floor',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [size, k] = PARAMS[levers.difficulty];
    const inst = buildPlateInstance(size, k, rng);
    const pack = levers.theme;
    const ops = operatorCount(levers.difficulty, rng);
    const coord = (i: number) => `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`;
    const pressList = inst.presses.map(coord).join('; ');
    const allHints = [
      `Stepping on a plate flips it AND its four neighbors — corners touch three plates, edges four, the middle five.`,
      `Work on one row at a time: clear the darkness downward like sweeping dust.`,
      `It can be done in ${k} steps.`,
      `Pressing the same plate twice undoes it — never repeat a plate.`,
    ];
    return {
      name: 'The Waking Floor',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A ${size}×${size} grid of glowing floor plates. Stepping on a plate toggles it and its orthogonal neighbors. All plates lit ⇒ the way opens. One valid solution (${k} presses): ${pressList}. The mechanism wants ${Math.min(levers.partySize, ops)} bodies standing on activated corner sigils to stay open afterward.`,
      readAloud: `The floor ahead is a grid of ${size} by ${size} plates of ${pack.materials[1] ?? pack.materials[0]}, some glowing softly, some dark — ${pack.sensory[0]}. A carved footprint marks the first plate invitingly.`,
      handout: {
        kind: 'grid-diagram', rows: size, cols: size,
        cells: inst.initial.map(on => ({ state: on ? 'on' as const : 'off' as const })),
        legend: ['* lit plate', '. dark plate', 'stepping flips a plate and its four neighbors'],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `One valid solution — press, in any order: ${pressList}. (Other press sets may also work; all-lit is what matters.)`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'Each fully-dark row pulses a warning through the chamber.', save: 'DEX' }),
      reward: rewardText(levers, rng),
    };
  },
};
