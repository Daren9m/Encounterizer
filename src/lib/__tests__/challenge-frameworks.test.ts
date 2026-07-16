import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import { successesNeeded, phaseSplit, groupCheckThreshold, dcFor } from '../noncombat/levers';
import type { Difficulty, ResolvedLevers, TimeBudget } from '../noncombat/types';
import { skillChallenge, buildChallengeStructure } from '../challenge-frameworks/skill-challenge';

export function mkLevers(diff: Difficulty, seed: number, over: Partial<ResolvedLevers> = {}): ResolvedLevers {
  return {
    partyLevel: 5, partySize: 4, difficulty: diff,
    theme: THEME_PACKS[seed % THEME_PACKS.length],
    tone: 'standard', timeBudget: 'standard', seed, ...over,
  };
}
export const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const BUDGETS: TimeBudget[] = ['quick', 'standard', 'set-piece'];

describe('skill challenge structure (spec §6.3/§8.1)', () => {
  it('locks successes/phases to the lever math across sizes, budgets, difficulties', () => {
    for (const diff of DIFFS) {
      for (const budget of BUDGETS) {
        for (const size of [1, 2, 4, 6, 8]) {
          const levers = mkLevers(diff, 7, { partySize: size, timeBudget: budget });
          const s = buildChallengeStructure(levers);
          const expectTotal = successesNeeded(size, budget, diff);
          expect(s.successesNeeded).toBe(expectTotal);
          expect(s.failuresAllowed).toBe(3);
          if (budget === 'set-piece') {
            expect(s.phases.map(p => p.successes)).toEqual(phaseSplit(expectTotal));
          } else {
            expect(s.phases).toHaveLength(1);
            expect(s.phases[0].successes).toBe(expectTotal);
          }
          for (const p of s.phases) expect(p.primarySkills.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
  it('generate() emits the group check, the two-step complication ladder, and threshold outcomes', () => {
    const levers = mkLevers('Medium', 11, { partySize: 5 });
    const out = skillChallenge.generate({ levers, rng: seededRandom(11) });
    expect(out.structure).toBeDefined();
    const group = out.skillChecks.find(c => c.onSuccess.includes(`${groupCheckThreshold(5)} of 5`) || c.onFailure.includes(`${groupCheckThreshold(5)} of 5`));
    expect(group, 'group check names ceil(size/2) of size').toBeDefined();
    expect(out.complication).toMatch(/1st failure/i);
    expect(out.complication).toMatch(/2nd failure/i);
    expect(out.outcomes).toHaveLength(3);
    const primaries = out.skillChecks.filter(c => c.dc === dcFor(5, 'Medium'));
    expect(primaries.length).toBeGreaterThanOrEqual(4);
  });
  it('set piece emits stages mirroring the phases', () => {
    const out = skillChallenge.generate({ levers: mkLevers('Hard', 3, { timeBudget: 'set-piece', partySize: 6 }), rng: seededRandom(3) });
    expect(out.stages?.length).toBe(out.structure?.phases.length);
    expect(out.structure!.phases.length).toBeGreaterThanOrEqual(2);
  });
  it('deterministic: same seed ⇒ identical JSON', () => {
    const a = skillChallenge.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    const b = skillChallenge.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
