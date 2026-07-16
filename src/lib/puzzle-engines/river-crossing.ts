// src/lib/puzzle-engines/river-crossing.ts
// ─── River Crossing ──────────────────────────────────────────────
// Incompatible passengers, a small boat, and a BFS over the state
// graph proving solvability with min-moves inside the difficulty
// band (spec §7.1). State: bitmask of items on the far side + boat.

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import type { Difficulty } from '../noncombat/types';
import { estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, cap, withArticle } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface RiverInstance { m: number; capacity: number; constraints: [number, number][] }

function sideSafe(mask: number, constraints: [number, number][]): boolean {
  // `mask` = items present on the UNATTENDED side.
  return constraints.every(([a, b]) => !((mask & (1 << a)) && (mask & (1 << b))));
}

function subsetsUpTo(mask: number, m: number, cap: number): number[] {
  // All non-empty cargo subsets of `mask` with ≤cap items, plus the empty trip.
  const items: number[] = [];
  for (let i = 0; i < m; i++) if (mask & (1 << i)) items.push(i);
  const out: number[] = [0];
  const recurse = (idx: number, chosen: number, count: number) => {
    if (count > 0) out.push(chosen);
    if (count === cap) return;
    for (let i = idx; i < items.length; i++) recurse(i + 1, chosen | (1 << items[i]), count + 1);
  };
  recurse(0, 0, 0);
  return out;
}

/** BFS; returns min crossings and one optimal plan (cargo mask per crossing), or null. */
export function solveRiver(m: number, capacity: number, constraints: [number, number][]): { moves: number; plan: number[][] } | null {
  const full = (1 << m) - 1;
  const encode = (far: number, boatFar: boolean) => far * 2 + (boatFar ? 1 : 0);
  const start = encode(0, false);
  const goal = encode(full, true);
  const prev = new Map<number, { state: number; cargo: number }>();
  const seen = new Set([start]);
  let frontier = [start];
  while (frontier.length > 0) {
    if (frontier.includes(goal)) break;
    const next: number[] = [];
    for (const state of frontier) {
      const far = state >> 1;
      const boatFar = (state & 1) === 1;
      const boatSideMask = boatFar ? far : (full & ~far);
      for (const cargo of subsetsUpTo(boatSideMask, m, capacity)) {
        const newFar = boatFar ? far & ~cargo : far | cargo;
        const leftBehind = boatFar ? newFar : full & ~newFar;
        if (!sideSafe(leftBehind, constraints)) continue;
        const ns = encode(newFar, !boatFar);
        if (seen.has(ns)) continue;
        seen.add(ns);
        prev.set(ns, { state, cargo });
        next.push(ns);
      }
    }
    frontier = next;
  }
  if (!frontier.includes(goal)) return null;
  const plan: number[][] = [];
  let cur = goal;
  while (cur !== start) {
    const p = prev.get(cur)!;
    const cargoItems: number[] = [];
    for (let i = 0; i < m; i++) if (p.cargo & (1 << i)) cargoItems.push(i);
    plan.unshift(cargoItems);
    cur = p.state;
  }
  return { moves: plan.length, plan };
}

const BANDS: Record<Difficulty, [number, number]> = { Easy: [3, 5], Medium: [6, 9], Hard: [10, 14] };

export function buildRiverInstance(diff: Difficulty, rng: Rng): RiverInstance {
  const draw = (): RiverInstance => {
    if (diff === 'Hard') {
      // m=5, capacity 1, two constraints sharing one passenger — the only
      // capacity-1 shape whose minimum lands in the 10–14 band (see task
      // header). Variety comes from WHICH passengers conflict.
      const m = 5;
      const center = Math.floor(rng() * m);
      const others = shuffleArray(
        Array.from({ length: m }, (_, i) => i).filter(i => i !== center), rng,
      ).slice(0, 2);
      return { m, capacity: 1, constraints: others.map(o => [center, o] as [number, number]) };
    }
    const m = diff === 'Easy' ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
    const nCon = diff === 'Easy' ? Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
    const pairs: [number, number][] = [];
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push([a, b]);
    return { m, capacity: 1, constraints: shuffleArray(pairs, rng).slice(0, Math.min(nCon, pairs.length)) };
  };
  const inBand = (inst: RiverInstance): boolean => {
    const sol = solveRiver(inst.m, inst.capacity, inst.constraints);
    return sol !== null && sol.moves >= BANDS[diff][0] && sol.moves <= BANDS[diff][1];
  };
  return verified(100, draw, inBand,
    // Deterministic canonical: scan a fixed parameter grid until in band.
    () => {
      for (let m = 2; m <= 5; m++) {
        for (const capacity of [1, 2]) {
          const pairs: [number, number][] = [];
          for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push([a, b]);
          for (let nCon = 0; nCon <= pairs.length; nCon++) {
            const inst = { m, capacity, constraints: pairs.slice(0, nCon) };
            if (inBand(inst)) return inst;
          }
        }
      }
      return { m: 3, capacity: 1, constraints: [[0, 1], [1, 2]] as [number, number][] }; // classic (7 moves)
    },
  );
}

export const riverCrossing: PuzzleFamily = {
  key: 'river-crossing',
  label: 'The Ferry Dilemma',
  categories: ['logic', 'environmental'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const inst = buildRiverInstance(levers.difficulty, rng);
    const sol = solveRiver(inst.m, inst.capacity, inst.constraints)!;
    const pack = levers.theme;
    const names = shuffleArray([...pack.creatures, ...pack.symbolSets[0]], rng).slice(0, inst.m).map(n => `the ${n}`);
    const conText = inst.constraints.map(([a, b]) => `${names[a]} cannot be left alone with ${names[b]}`);
    const planText = sol.plan.map((cargo, i) =>
      cargo.length === 0
        ? `${i + 1}. Cross ${i % 2 === 0 ? 'over' : 'back'} with an empty ferry.`
        : `${i + 1}. Ferry ${cargo.map(c => names[c]).join(' and ')} ${i % 2 === 0 ? 'across' : 'back'}.`,
    );
    const allHints = [
      `Sometimes the ferry must carry a passenger BACK — the shortest path is not always forward.`,
      `Count what each bank holds after every trip; the troublesome pair${inst.constraints.length > 1 ? 's' : ''} must never share an unattended bank.`,
      `Start with the passenger involved in the most restrictions.`,
      `It can be done in exactly ${sol.moves} crossings.`,
    ];
    return {
      name: 'The Ferry Dilemma',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A crossing puzzle: ${inst.m} passengers (${names.join(', ')}), a craft that holds ${inst.capacity} beside the operator. Restrictions: ${conText.join('; ')}. Minimum: ${sol.moves} crossings. Full plan below.`,
      readAloud: `${cap(pack.sensory[3] ?? pack.sensory[0])}. The only way across is ${withArticle(pick(pack.materials, rng))} ferry that bears the ferryman and ${inst.capacity} passenger${inst.capacity > 1 ? 's' : ''} at a time. Waiting to cross: ${names.join(', ')}. ${conText.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join('. ')}.`,
      handout: { kind: 'text', title: 'The Ferry Rules', body: [`Capacity: ferryman + ${inst.capacity}`, ...conText].join('\n') },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Minimum ${sol.moves} crossings:\n${planText.join('\n')}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'An unattended clash breaks out on the bank.', save: 'WIS' }),
      reward: rewardText(levers, rng),
    };
  },
};
