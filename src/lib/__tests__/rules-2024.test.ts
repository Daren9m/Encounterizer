import { describe, expect, it } from 'vitest';
import { XP_BUDGET_PER_CHARACTER } from '@/lib/types';
import type { Difficulty, Party } from '@/lib/types';
import { assessEncounterDifficulty, getPartyXpBudget } from '@/lib/encounter-generator';

// Independent re-transcription of the 2024 DMG "XP Budget per Character"
// table (chapter 4). Typed as tuples so a transcription typo in types.ts
// can't silently agree with itself.
const DMG_2024_BUDGETS: Array<[level: number, low: number, moderate: number, high: number]> = [
  [1, 50, 75, 100],
  [2, 100, 150, 200],
  [3, 150, 225, 400],
  [4, 250, 375, 500],
  [5, 500, 750, 1100],
  [6, 600, 1000, 1400],
  [7, 750, 1300, 1700],
  [8, 1000, 1700, 2100],
  [9, 1300, 2000, 2600],
  [10, 1600, 2300, 3100],
  [11, 1900, 2900, 4100],
  [12, 2200, 3700, 4700],
  [13, 2600, 4200, 5400],
  [14, 2900, 4900, 6200],
  [15, 3300, 5400, 7800],
  [16, 3800, 6100, 9800],
  [17, 4500, 7200, 11700],
  [18, 5000, 8700, 14200],
  [19, 5500, 10700, 17200],
  [20, 6400, 13200, 22000],
];

function party(size: number, level: number): Party {
  return {
    id: 'p',
    name: 'Test Party',
    members: Array.from({ length: size }, (_, i) => ({
      name: `P${i}`,
      level,
      className: 'Adventurer',
    })),
  };
}

describe('XP_BUDGET_PER_CHARACTER', () => {
  it('matches the 2024 DMG table exactly, all 20 levels', () => {
    expect(Object.keys(XP_BUDGET_PER_CHARACTER)).toHaveLength(20);
    for (const [level, low, moderate, high] of DMG_2024_BUDGETS) {
      expect(XP_BUDGET_PER_CHARACTER[level]).toEqual({
        Low: low,
        Moderate: moderate,
        High: high,
      });
    }
  });

  it('is strictly increasing across tiers at every level', () => {
    for (let level = 1; level <= 20; level++) {
      const row = XP_BUDGET_PER_CHARACTER[level];
      expect(row.Low).toBeLessThan(row.Moderate);
      expect(row.Moderate).toBeLessThan(row.High);
    }
  });

  it('is monotonically non-decreasing across levels within each tier', () => {
    const tiers: Difficulty[] = ['Low', 'Moderate', 'High'];
    for (const tier of tiers) {
      for (let level = 2; level <= 20; level++) {
        expect(XP_BUDGET_PER_CHARACTER[level][tier]).toBeGreaterThan(
          XP_BUDGET_PER_CHARACTER[level - 1][tier],
        );
      }
    }
  });
});

describe('getPartyXpBudget', () => {
  it('sums per-member budgets', () => {
    expect(getPartyXpBudget(party(4, 3), 'Moderate')).toBe(4 * 225);
    expect(getPartyXpBudget(party(5, 8), 'High')).toBe(5 * 2100);
  });

  it('handles mixed-level parties', () => {
    const mixed: Party = {
      id: 'p',
      name: 'Mixed',
      members: [
        { name: 'A', level: 3, className: 'Fighter' },
        { name: 'B', level: 5, className: 'Wizard' },
      ],
    };
    expect(getPartyXpBudget(mixed, 'Low')).toBe(150 + 500);
  });

  it('clamps out-of-range levels into 1-20', () => {
    expect(getPartyXpBudget(party(1, 0), 'Low')).toBe(50);
    expect(getPartyXpBudget(party(1, 25), 'Low')).toBe(6400);
  });
});

describe('assessEncounterDifficulty', () => {
  // 4 × level 3: Low 600, Moderate 900, High 1600
  const p = party(4, 3);

  it('treats budgets as inclusive caps', () => {
    expect(assessEncounterDifficulty(0, p)).toBe('Low');
    expect(assessEncounterDifficulty(600, p)).toBe('Low');
    expect(assessEncounterDifficulty(601, p)).toBe('Moderate');
    expect(assessEncounterDifficulty(900, p)).toBe('Moderate');
    expect(assessEncounterDifficulty(901, p)).toBe('High');
    expect(assessEncounterDifficulty(1600, p)).toBe('High');
  });

  it('labels anything past the High budget as Extreme', () => {
    expect(assessEncounterDifficulty(1601, p)).toBe('Extreme');
    expect(assessEncounterDifficulty(999999, p)).toBe('Extreme');
  });
});
