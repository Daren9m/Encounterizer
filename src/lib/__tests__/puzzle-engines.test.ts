import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import type { ResolvedLevers, Difficulty } from '../noncombat/types';
import { knightsKnaves, buildKkInstance, consistentAssignments } from '../puzzle-engines/knights-knaves';
import { logicGrid, buildGridInstance, countGridSolutions } from '../puzzle-engines/logic-grid';

export function mkLevers(diff: Difficulty, seed: number, over: Partial<ResolvedLevers> = {}): ResolvedLevers {
  return {
    partyLevel: 5, partySize: 4, difficulty: diff,
    theme: THEME_PACKS[seed % THEME_PACKS.length],
    tone: 'standard', timeBudget: 'standard', seed, ...over,
  };
}

const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const KK_SPEAKERS: Record<Difficulty, number> = { Easy: 2, Medium: 3, Hard: 4 };

describe('knights & knaves', () => {
  it('every instance has exactly one consistent assignment (200 seeds × 3 difficulties)', () => {
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildKkInstance(KK_SPEAKERS[diff], seededRandom(s));
        expect(inst.n, `fallback shrank n: diff=${diff} seed=${s}`).toBe(KK_SPEAKERS[diff]);
        const consistent = consistentAssignments(inst.n, inst.statements);
        expect(consistent, `diff=${diff} seed=${s}`).toHaveLength(1);
        expect(consistent[0]).toEqual(inst.solution);
      }
    }
  });
  it('generate() produces complete prose and respects speaker count', () => {
    for (const diff of DIFFS) {
      const out = knightsKnaves.generate({ levers: mkLevers(diff, 11), rng: seededRandom(11) });
      expect(out.dmBrief.startsWith(`${KK_SPEAKERS[diff]} guardians`)).toBe(true);
      expect(out.name.length).toBeGreaterThan(0);
      expect(out.readAloud.length).toBeGreaterThan(0);
      expect(out.solution.length).toBeGreaterThan(0);
      expect(out.hints).toHaveLength(3); // standard budget
      expect(out.failureConsequence.length).toBeGreaterThan(0);
    }
  });
});

describe('logic grid', () => {
  const POOLS = [
    ['Ox', 'Ram', 'Crane', 'Wolf'],
    ['Sun', 'Moon', 'Star', 'Comet'],
    ['Iron', 'Ash', 'Salt', 'Jade'],
    ['North', 'South', 'East', 'West'],
  ];
  it('every instance has a unique solution (200 seeds × 3 sizes)', () => {
    const sizes: [number, number][] = [[3, 3], [3, 4], [4, 4]];
    for (const [cats, items] of sizes) {
      for (let s = 0; s < 200; s++) {
        const inst = buildGridInstance(cats, items, POOLS, seededRandom(s));
        expect(countGridSolutions(inst, 2), `cats=${cats} items=${items} seed=${s}`).toBe(1);
      }
    }
  });
  it('generate() emits a logic-grid handout with clues and locked sizes', () => {
    const out = logicGrid.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    expect(out.handout?.kind).toBe('logic-grid');
    if (out.handout?.kind === 'logic-grid') {
      expect(out.handout.categories).toHaveLength(4);
      expect(out.handout.items[0]).toHaveLength(4);
      expect(out.handout.clues.length).toBeGreaterThan(0);
    }
  });
});
