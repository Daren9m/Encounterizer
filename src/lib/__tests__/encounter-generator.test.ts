import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS } from '@/data';
import {
  generateEncounter,
  generateQuickEncounter,
  getPartyXpBudget,
  summarizeEncounter,
} from '@/lib/encounter-generator';
import { fillRecipeSlots, ENCOUNTER_RECIPES } from '@/lib/encounter-recipes';
import { filterMonsters } from '@/lib/monster-filter';
import { seededRandom } from '@/lib/random';
import type { Difficulty, Party } from '@/lib/types';

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

describe('generateEncounter', () => {
  it('reproduces the identical encounter for the same seed', () => {
    const options = {
      party: party(4, 5),
      difficulty: 'Moderate' as Difficulty,
      environment: 'Forest' as const,
      seed: 123456,
    };
    const a = generateEncounter(ALL_MONSTERS, options, filterMonsters);
    const b = generateEncounter(ALL_MONSTERS, options, filterMonsters);
    expect(a).toEqual(b);
    expect(a.seed).toBe(123456);
    expect(a.id).toBe('enc-123456');
  });

  it('diverges across different seeds', () => {
    const base = {
      party: party(4, 5),
      difficulty: 'Moderate' as Difficulty,
      environment: 'Forest' as const,
    };
    const a = generateEncounter(ALL_MONSTERS, { ...base, seed: 1 }, filterMonsters);
    const b = generateEncounter(ALL_MONSTERS, { ...base, seed: 2 }, filterMonsters);
    expect({ name: a.name, hook: a.scenarioHook, monsters: a.monsters }).not.toEqual({
      name: b.name, hook: b.scenarioHook, monsters: b.monsters,
    });
  });

  it('never exceeds the requested XP budget (2024 budgets are caps)', () => {
    const levels = [1, 5, 11, 20];
    const difficulties: Difficulty[] = ['Low', 'Moderate', 'High'];
    for (const level of levels) {
      for (const difficulty of difficulties) {
        for (let seed = 1; seed <= 10; seed++) {
          const p = party(4, level);
          const enc = generateEncounter(
            ALL_MONSTERS, { party: p, difficulty, seed }, filterMonsters,
          );
          const budget = getPartyXpBudget(p, difficulty);
          expect(enc.totalXp, `level ${level} ${difficulty} seed ${seed}`).toBeLessThanOrEqual(budget);
          expect(enc.totalXp).toBeGreaterThan(0);
        }
      }
    }
  });

  it('assessed difficulty never exceeds the requested tier', () => {
    // With budgets as caps, filling ≤ the Moderate budget can read as Low or
    // Moderate — but never High or Extreme.
    const order: Record<string, number> = { Low: 0, Moderate: 1, High: 2, Extreme: 3 };
    for (let seed = 1; seed <= 10; seed++) {
      const enc = generateEncounter(
        ALL_MONSTERS,
        { party: party(4, 7), difficulty: 'Moderate', seed },
        filterMonsters,
      );
      expect(order[enc.difficulty]).toBeLessThanOrEqual(order.Moderate);
    }
  });

  it('returns an empty encounter when no monsters qualify', () => {
    const enc = generateEncounter([], {
      party: party(4, 3),
      difficulty: 'Moderate',
      seed: 42,
    });
    expect(enc.monsters).toEqual([]);
    expect(enc.totalXp).toBe(0);
  });
});

describe('generateQuickEncounter', () => {
  it('passes the seed through for reproducibility', () => {
    const a = generateQuickEncounter(ALL_MONSTERS, 5, 4, 'High', 'Mountain', filterMonsters, 777);
    const b = generateQuickEncounter(ALL_MONSTERS, 5, 4, 'High', 'Mountain', filterMonsters, 777);
    expect(a).toEqual(b);
  });
});

describe('summarizeEncounter', () => {
  it('reports totals, budgets, and a null assessment for empty encounters', () => {
    const p = party(4, 3);
    const empty = summarizeEncounter([], p);
    expect(empty.totalXp).toBe(0);
    expect(empty.monsterCount).toBe(0);
    expect(empty.assessment).toBeNull();
    expect(empty.budgets).toEqual({ Low: 600, Moderate: 900, High: 1600 });

    const goblinish = ALL_MONSTERS.find((m) => m.xp === 100) ?? ALL_MONSTERS[0];
    const summary = summarizeEncounter([{ monster: goblinish, count: 3 }], p);
    expect(summary.totalXp).toBe(goblinish.xp * 3);
    expect(summary.monsterCount).toBe(3);
    expect(summary.assessment).not.toBeNull();
  });
});

describe('fillRecipeSlots', () => {
  it('is deterministic with an injected rng', () => {
    const recipe = ENCOUNTER_RECIPES.find((r) => r.category === 'combat')!;
    const a = fillRecipeSlots(recipe, ALL_MONSTERS, 5, 'Forest', seededRandom(9));
    const b = fillRecipeSlots(recipe, ALL_MONSTERS, 5, 'Forest', seededRandom(9));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});
