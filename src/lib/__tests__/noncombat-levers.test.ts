import { describe, it, expect } from 'vitest';
import {
  dcFor, severityDice, damageDice, successesNeeded, phaseSplit,
  groupCheckThreshold, contestRounds, contestOpponentBonus, hintCount,
  operatorCount, estimatedMinutes,
} from '../noncombat/levers';
import { seededRandom } from '../random';

describe('dcFor (parity with legacy formula)', () => {
  it('matches 10 + floor(level/2) with -2/+0/+3 offsets', () => {
    expect(dcFor(5, 'Easy')).toBe(10);
    expect(dcFor(5, 'Medium')).toBe(12);
    expect(dcFor(5, 'Hard')).toBe(15);
    expect(dcFor(20, 'Hard')).toBe(23);
    expect(dcFor(1, 'Easy')).toBe(8);
  });
});

describe('severity table (spec §6.2, test-locked)', () => {
  it('pins all 12 cells', () => {
    expect(severityDice(1, 'setback')).toBe('1d10');
    expect(severityDice(4, 'deadly')).toBe('4d10');
    expect(severityDice(5, 'setback')).toBe('2d10');
    expect(severityDice(10, 'dangerous')).toBe('4d10');
    expect(severityDice(11, 'deadly')).toBe('18d10');
    expect(severityDice(16, 'setback')).toBe('4d10');
    expect(severityDice(17, 'dangerous')).toBe('18d10');
    expect(severityDice(20, 'deadly')).toBe('24d10');
  });
  it('recurring damage is always the setback column', () => {
    expect(damageDice(11, 'Hard', 'recurring')).toBe('4d10');
    expect(damageDice(11, 'Hard', 'climactic')).toBe('18d10');
    expect(damageDice(11, 'Easy', 'climactic')).toBe('4d10');
    expect(damageDice(11, 'Medium', 'climactic')).toBe('10d10');
  });
});

describe('party-size math (spec §6.3, test-locked)', () => {
  it('successesNeeded = clamp(base(budget) + diffOffset, 3, 12)', () => {
    expect(successesNeeded(4, 'standard', 'Medium')).toBe(4);
    expect(successesNeeded(4, 'quick', 'Easy')).toBe(3);      // ceil(3)=3, -1 → clamp 3
    expect(successesNeeded(4, 'set-piece', 'Hard')).toBe(7);  // 6+1
    expect(successesNeeded(8, 'set-piece', 'Hard')).toBe(11);
    expect(successesNeeded(1, 'quick', 'Easy')).toBe(3);      // clamp floor
    expect(successesNeeded(8, 'set-piece', 'Medium')).toBe(10);
  });
  it('phaseSplit: 2 phases ≤7, else 3; larger share last', () => {
    expect(phaseSplit(7)).toEqual([3, 4]);
    expect(phaseSplit(6)).toEqual([3, 3]);
    expect(phaseSplit(8)).toEqual([2, 3, 3]);
    expect(phaseSplit(11)).toEqual([3, 4, 4]);
  });
  it('groupCheckThreshold = ceil(size/2)', () => {
    expect(groupCheckThreshold(4)).toBe(2);
    expect(groupCheckThreshold(5)).toBe(3);
    expect(groupCheckThreshold(1)).toBe(1);
  });
  it('contest rounds 3/5/7 and bonus 2+floor(level/2) at Medium', () => {
    expect(contestRounds('quick')).toBe(3);
    expect(contestRounds('standard')).toBe(5);
    expect(contestRounds('set-piece')).toBe(7);
    expect(contestOpponentBonus(20, 'Medium')).toBe(12);
    expect(contestOpponentBonus(5, 'Easy')).toBe(2);
    expect(contestOpponentBonus(5, 'Hard')).toBe(6);
  });
  it('hintCount 2/3/4 by budget; operatorCount bands by difficulty', () => {
    expect(hintCount('quick')).toBe(2);
    expect(hintCount('standard')).toBe(3);
    expect(hintCount('set-piece')).toBe(4);
    const rng = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      expect(operatorCount('Easy', rng)).toBe(2);
      const m = operatorCount('Medium', rng);
      expect(m === 2 || m === 3).toBe(true);
      const h = operatorCount('Hard', rng);
      expect(h === 3 || h === 4).toBe(true);
    }
    expect(estimatedMinutes('quick')).toBe(8);
    expect(estimatedMinutes('standard')).toBe(15);
    expect(estimatedMinutes('set-piece')).toBe(30);
  });
});
