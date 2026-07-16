// ─── Logic Grid (zebra-style) ────────────────────────────────────
// Solution generated first; a covering clue set is pruned greedily
// while a brute-force count over category permutations proves the
// solution stays unique (spec §7.1). Search space ≤ 4!^3 = 13,824.

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface GridClue { kind: 'is' | 'not'; a: [number, number]; b: [number, number] }
export interface GridInstance {
  nCats: number;
  nItems: number;
  items: string[][];           // items[cat][idx]
  solution: number[][];        // solution[cat][entity] = item idx; solution[0] = identity
  clues: GridClue[];
}

function allPermutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const rest of allPermutations(n - 1)) {
    for (let i = 0; i <= rest.length; i++) {
      out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
    }
  }
  return out;
}

function cluesHold(assign: number[][], clues: GridClue[]): boolean {
  return clues.every(c => {
    const entity = assign[c.a[0]].indexOf(c.a[1]);
    const match = assign[c.b[0]][entity] === c.b[1];
    return c.kind === 'is' ? match : !match;
  });
}

/** Counts assignments satisfying all clues, early-exits at `limit`. */
export function countGridSolutions(inst: GridInstance, limit: number): number {
  const perms = allPermutations(inst.nItems);
  const identity = Array.from({ length: inst.nItems }, (_, i) => i);
  let count = 0;
  const recurse = (cat: number, acc: number[][]): void => {
    if (count >= limit) return;
    if (cat === inst.nCats) {
      if (cluesHold(acc, inst.clues)) count++;
      return;
    }
    for (const p of perms) recurse(cat + 1, [...acc, p]);
  };
  recurse(1, [identity]);
  return count;
}

export function buildGridInstance(nCats: number, nItems: number, pools: string[][], rng: Rng): GridInstance {
  const construct = (): GridInstance => {
    const items = pools.slice(0, nCats).map(pool => shuffleArray(pool, rng).slice(0, nItems));
    const identity = Array.from({ length: nItems }, (_, i) => i);
    const solution = [identity, ...Array.from({ length: nCats - 1 }, () => shuffleArray(identity, rng))];
    // Full positive clue set: every entity × category pair (anchored on cat 0).
    const all: GridClue[] = [];
    for (let e = 0; e < nItems; e++) {
      for (let c1 = 0; c1 < nCats; c1++) {
        for (let c2 = c1 + 1; c2 < nCats; c2++) {
          all.push({ kind: 'is', a: [c1, solution[c1][e]], b: [c2, solution[c2][e]] });
        }
      }
    }
    // A few negative clues for texture (false pairs by construction).
    for (let i = 0; i < nItems; i++) {
      const c2 = 1 + Math.floor(rng() * (nCats - 1));
      const e = Math.floor(rng() * nItems);
      const wrong = (solution[c2][e] + 1 + Math.floor(rng() * (nItems - 1))) % nItems;
      all.push({ kind: 'not', a: [0, e], b: [c2, wrong] });
    }
    // Greedy prune, preserving uniqueness at every step.
    const inst: GridInstance = { nCats, nItems, items, solution, clues: shuffleArray(all, rng) };
    for (let i = inst.clues.length - 1; i >= 0; i--) {
      const removed = inst.clues.splice(i, 1)[0];
      if (countGridSolutions(inst, 2) !== 1) inst.clues.splice(i, 0, removed);
    }
    return inst;
  };
  return verified(
    10, // pruning preserves uniqueness by construction; retries are a safety net
    construct,
    inst => countGridSolutions(inst, 2) === 1,
    construct, // construction is self-correcting; reuse it as canonical
  );
}

function clueText(inst: GridInstance, c: GridClue, catNames: string[]): string {
  const a = inst.items[c.a[0]][c.a[1]];
  const b = inst.items[c.b[0]][c.b[1]];
  const bCat = catNames[c.b[0]].toLowerCase();
  return c.kind === 'is'
    ? `${a} is bound to the ${bCat} ${b}.`
    : `${a} is NOT bound to the ${bCat} ${b}.`;
}

const SIZES = { Easy: [3, 3], Medium: [3, 4], Hard: [4, 4] } as const;
const CAT_NAMES = ['Figure', 'Sigil', 'Relic', 'Quarter'];

export const logicGrid: PuzzleFamily = {
  key: 'logic-grid',
  label: 'The Grid of Correspondences',
  categories: ['logic'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [nCats, nItems] = SIZES[levers.difficulty];
    const pack = levers.theme;
    const pools = [
      pack.symbolSets[0],
      pack.symbolSets[1] ?? pack.symbolSets[0],
      pack.materials.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
      ['North', 'South', 'East', 'West'],
    ];
    const inst = buildGridInstance(nCats, nItems, pools, rng);
    const catNames = CAT_NAMES.slice(0, nCats);
    const clues = inst.clues.map(c => clueText(inst, c, catNames));
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const answerLines = Array.from({ length: nItems }, (_, e) =>
      catNames.map((cn, c) => `${cn}: ${inst.items[c][inst.solution[c][e]]}`).join(' · '),
    );
    const allHints = [
      `Chart it: one row per ${catNames[0].toLowerCase()}, one column per category. Strike out what the clues forbid.`,
      `Start with the clue that names the same ${catNames[0].toLowerCase()} twice — it anchors a full row.`,
      `DC ${dc} Investigation: faint wear marks confirm one pairing outright (give the players one row of the answer).`,
      `Every clue matters — if a pairing seems undetermined, a clue has gone unused.`,
    ];
    return {
      name: 'The Grid of Correspondences',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A matching puzzle: ${nItems} ${catNames[0].toLowerCase()}s each bind one item per category (${catNames.join(', ')}). The clue set admits exactly one arrangement. Full answer:\n${answerLines.join('\n')}`,
      readAloud: `${pack.sensory[1] ?? pack.sensory[0]}. A ${pick(pack.descriptors, rng)} wall of ${pick(pack.materials, rng)} bears ${nItems * nCats} inlaid sockets in a grid, and beneath them, an inscription lists what goes with what — almost.`,
      handout: { kind: 'logic-grid', categories: catNames, items: inst.items, clues },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The unique arrangement:\n${answerLines.join('\n')}\nSetting every socket correctly unseals the way.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong arrangement snaps a jolt through the sockets.', save: 'CON' }),
      reward: rewardText(levers, rng),
    };
  },
};
