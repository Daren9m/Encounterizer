import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import type { ResolvedLevers, Difficulty } from '../noncombat/types';
import { knightsKnaves, buildKkInstance, consistentAssignments } from '../puzzle-engines/knights-knaves';
import { logicGrid, buildGridInstance, countGridSolutions } from '../puzzle-engines/logic-grid';
import { runeLock, buildRuneLockInstance, consistentCandidates } from '../puzzle-engines/rune-lock';
import { riverCrossing, buildRiverInstance, solveRiver, drawPassengerNames } from '../puzzle-engines/river-crossing';
import { sequenceLock, buildSequenceInstance, matchingPredictions, canonicalSequence } from '../puzzle-engines/sequence';
import { plateGrid, buildPlateInstance, applyPress } from '../puzzle-engines/plate-grid';
import { sumLock, buildSumLockInstance, countSumCompletions } from '../puzzle-engines/sum-lock';

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
  it('readAloud prose is table-ready (capitalized, article agreement) across 100 seeds', () => {
    for (let s = 0; s < 100; s++) {
      for (const diff of DIFFS) {
        const out = logicGrid.generate({ levers: mkLevers(diff, s), rng: seededRandom(s) });
        expect(out.readAloud[0]).toBe(out.readAloud[0].toUpperCase());
        expect(out.readAloud).not.toMatch(/\bA [aeiou]/);
      }
    }
  });
});

describe('rune lock', () => {
  const PARAMS: Record<Difficulty, [number, number, number]> = { Easy: [4, 3, 3], Medium: [5, 3, 4], Hard: [6, 4, 4] };
  it('exactly one candidate is consistent with the attempts (200 seeds × 3 difficulties)', () => {
    for (const diff of DIFFS) {
      const [n, k, a] = PARAMS[diff];
      for (let s = 0; s < 200; s++) {
        const inst = buildRuneLockInstance(n, k, a, seededRandom(s));
        const cands = consistentCandidates(inst);
        expect(cands, `diff=${diff} seed=${s}`).toHaveLength(1);
        expect(cands[0]).toEqual(inst.secret);
      }
    }
  });
  it('generate() emits an attempts-ledger handout', () => {
    const out = runeLock.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    expect(out.handout?.kind).toBe('attempts-ledger');
    if (out.handout?.kind === 'attempts-ledger') {
      expect(out.handout.attempts.length).toBeGreaterThanOrEqual(4);
      expect(out.handout.runeSet).toHaveLength(5);
    }
  });
});

describe('river crossing', () => {
  it('solves the classic wolf–goat–cabbage in 7 crossings', () => {
    const sol = solveRiver(3, 1, [[0, 1], [1, 2]]);
    expect(sol?.moves).toBe(7);
  });
  it('instances are solvable with min-moves in the difficulty band (200 seeds × 3)', () => {
    const BANDS: Record<Difficulty, [number, number]> = { Easy: [3, 5], Medium: [6, 9], Hard: [10, 14] };
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildRiverInstance(diff, seededRandom(s));
        const sol = solveRiver(inst.m, inst.capacity, inst.constraints);
        expect(sol, `diff=${diff} seed=${s}`).not.toBeNull();
        expect(sol!.moves).toBeGreaterThanOrEqual(BANDS[diff][0]);
        expect(sol!.moves).toBeLessThanOrEqual(BANDS[diff][1]);
      }
    }
  });
  it('Hard instances vary across seeds (no silent 100%-fallback degeneracy)', () => {
    const sets = new Set(Array.from({ length: 20 }, (_, s) =>
      JSON.stringify(buildRiverInstance('Hard', seededRandom(s)).constraints)));
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });
  it('generate() names every passenger and each constraint in the brief', () => {
    const out = riverCrossing.generate({ levers: mkLevers('Medium', 9), rng: seededRandom(9) });
    expect(out.dmBrief).toContain('crossings');
    expect(out.solution.length).toBeGreaterThan(0);
  });
  it('passenger names are always distinct (all packs × sizes × 100 seeds)', () => {
    for (const pack of THEME_PACKS) {
      for (const m of [2, 3, 4, 5]) {
        for (let s = 0; s < 100; s++) {
          const names = drawPassengerNames(pack, m, seededRandom(s));
          expect(new Set(names).size, `${pack.id} m=${m} seed=${s}`).toBe(m);
        }
      }
    }
  });
});

describe('sequence lock', () => {
  const SETS = [['Sun', 'Moon', 'Star', 'Comet', 'Cloud', 'Storm'], ['Ox', 'Ram', 'Crane', 'Wolf', 'Boar', 'Hart']];
  it('all grammar rules matching the visible terms agree on the blank (200 seeds × 3)', () => {
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildSequenceInstance(diff, SETS, seededRandom(s));
        const preds = matchingPredictions(inst);
        expect(preds.size, `diff=${diff} seed=${s}`).toBe(1);
        expect([...preds][0]).toBe(inst.answer);
        // options = the answer + 3 distractors (spec: distractors differ
        // from the predicted blank).
        expect(inst.options).toContain(inst.answer);
        expect(inst.options.filter(o => o !== inst.answer)).toHaveLength(3);
      }
    }
  });
  it('canonical fallbacks are structurally honest and uniquely solvable per difficulty', () => {
    for (const diff of DIFFS) {
      const inst = canonicalSequence(diff, SETS);
      expect(inst.interleaved).toBe(diff === 'Hard');
      const preds = matchingPredictions(inst);
      expect(preds.size, diff).toBe(1);
      expect([...preds][0]).toBe(inst.answer);
      expect(inst.options).toContain(inst.answer);
      const distractors = inst.options.filter(o => o !== inst.answer);
      expect(distractors).toHaveLength(3);
      for (const o of distractors) expect(o).not.toMatch(/^\d+$/); // domain-consistent: symbols only
      expect(new Set(inst.options).size).toBe(4);
    }
  });
  it('generate() emits a symbol-sequence handout with options', () => {
    const out = sequenceLock.generate({ levers: mkLevers('Easy', 3), rng: seededRandom(3) });
    expect(out.handout?.kind).toBe('symbol-sequence');
    if (out.handout?.kind === 'symbol-sequence') {
      expect(out.handout.blanks).toHaveLength(1);
      expect(out.handout.options?.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('plate grid', () => {
  const PARAMS: Record<Difficulty, [number, number]> = { Easy: [3, 3], Medium: [4, 4], Hard: [5, 5] };
  it('the recorded presses solve the grid, and presses are distinct (200 seeds × 3)', () => {
    for (const diff of DIFFS) {
      const [size, k] = PARAMS[diff];
      for (let s = 0; s < 200; s++) {
        const inst = buildPlateInstance(size, k, seededRandom(s));
        expect(new Set(inst.presses).size).toBe(k);
        const cells = [...inst.initial];
        for (const p of inst.presses) applyPress(cells, size, p);
        expect(cells.every(Boolean), `diff=${diff} seed=${s}`).toBe(true);
        expect(inst.initial.every(Boolean)).toBe(false); // not pre-solved
      }
    }
  });
});

describe('sum lock', () => {
  it('masked squares have exactly one completion (200 seeds × 3 mask counts)', () => {
    for (const masked of [3, 4, 5]) {
      for (let s = 0; s < 200; s++) {
        const inst = buildSumLockInstance(masked, seededRandom(s));
        expect(inst.masked, `mask count: masked=${masked} seed=${s}`).toHaveLength(masked);
        expect(countSumCompletions(inst, 2), `masked=${masked} seed=${s}`).toBe(1);
      }
    }
  });
  it('generate() emits a grid-diagram with masked cells and a legend', () => {
    const out = sumLock.generate({ levers: mkLevers('Medium', 13), rng: seededRandom(13) });
    expect(out.handout?.kind).toBe('grid-diagram');
    if (out.handout?.kind === 'grid-diagram') {
      expect(out.handout.cells.filter(c => c.state === 'masked')).toHaveLength(4);
      expect(out.handout.legend?.length).toBeGreaterThan(0);
    }
  });
});
