import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import { successesNeeded, phaseSplit, groupCheckThreshold, dcFor } from '../noncombat/levers';
import type { Difficulty, ResolvedLevers, TimeBudget } from '../noncombat/types';
import { skillChallenge, buildChallengeStructure } from '../challenge-frameworks/skill-challenge';
import { social, buildAttitudeTrack } from '../challenge-frameworks/social';
import { exploration, TIER_GUIDANCE } from '../challenge-frameworks/exploration';
import { LEVERAGE } from '../../data/noncombat-cast';

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

describe('social framework (spec §8.2)', () => {
  it('attitude track: three ordered stages with locked DC offsets (100 seeds)', () => {
    for (let s = 0; s < 100; s++) {
      const levers = mkLevers('Medium', s);
      const track = buildAttitudeTrack(levers, LEVERAGE[s % LEVERAGE.length], seededRandom(s));
      expect(track.stages.map(t => t.attitude)).toEqual(['Hostile', 'Indifferent', 'Friendly']);
      const dc = dcFor(levers.partyLevel, levers.difficulty);
      expect(track.stages.map(t => t.influenceDc)).toEqual([dc + 2, dc, dc - 2]);
      expect(['Hostile', 'Indifferent', 'Friendly']).toContain(track.start);
      for (const st of track.stages) {
        expect(st.unlocks.length).toBeGreaterThan(0);
        expect(st.shiftUp.length).toBeGreaterThan(0);
        expect(st.shiftDown.length).toBeGreaterThan(0);
      }
    }
  });
  it('side NPCs scale with party size (capped at 3) and appear in the situation', () => {
    const solo = social.generate({ levers: mkLevers('Medium', 9, { partySize: 1 }), rng: seededRandom(9) });
    const six = social.generate({ levers: mkLevers('Medium', 9, { partySize: 6 }), rng: seededRandom(9) });
    expect(solo.situation.match(/Side NPC/g)).toBeNull();
    expect(six.situation.match(/Side NPC/g)?.length).toBe(3);
    expect(six.attitudeTrack).toBeDefined();
  });
  it('deterministic and carries persona texture into the read-aloud', () => {
    const a = social.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    const b = social.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.readAloud).toMatch(/Their speech: /);
    expect(a.readAloud).toMatch(/Their tell: /);
    expect(a.readAloud).not.toMatch(/\bThey [a-z]+s\b/); // no third-person-singular after "They"
  });
});

describe('exploration framework (spec §8.3)', () => {
  it('chain length follows time budget; chains render as stages', () => {
    const quick = exploration.generate({ levers: mkLevers('Medium', 4, { timeBudget: 'quick' }), rng: seededRandom(4) });
    expect(quick.stages).toBeUndefined();
    const std = exploration.generate({ levers: mkLevers('Medium', 4), rng: seededRandom(4) });
    expect(std.stages).toHaveLength(2);
    const set = exploration.generate({ levers: mkLevers('Medium', 4, { timeBudget: 'set-piece' }), rng: seededRandom(4) });
    expect(set.stages).toHaveLength(3);
    const names = set.stages!.map(s => s.title);
    expect(new Set(names).size).toBe(3); // distinct obstacles
  });
  it('tier guidance tracks party level', () => {
    expect(TIER_GUIDANCE).toHaveLength(4);
    const low = exploration.generate({ levers: mkLevers('Medium', 8, { partyLevel: 3 }), rng: seededRandom(8) });
    expect(low.situation).toContain(TIER_GUIDANCE[0]);
    const high = exploration.generate({ levers: mkLevers('Medium', 8, { partyLevel: 18 }), rng: seededRandom(8) });
    expect(high.situation).toContain(TIER_GUIDANCE[3]);
  });
  it('emits exactly one group check naming the party-size threshold', () => {
    const out = exploration.generate({ levers: mkLevers('Hard', 6, { partySize: 6 }), rng: seededRandom(6) });
    // groupCheckThreshold(6) = ceil(6/2) = 3
    const groups = out.skillChecks.filter(c => c.onSuccess.includes('3 of 6') || c.onFailure.includes('3 of 6'));
    expect(groups).toHaveLength(1);
  });
  it('weaves a weather condition into the situation', () => {
    const out = exploration.generate({ levers: mkLevers('Medium', 12), rng: seededRandom(12) });
    expect(out.situation).toMatch(/Weather:/);
  });
});
