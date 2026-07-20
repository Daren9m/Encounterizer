import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS } from '@/data';
import { generateEncounter } from '@/lib/encounter-generator';
import { filterMonsters } from '@/lib/monster-filter';
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

const SEEDS = [1, 42, 123456, 987654, 0x7ffffffe];

describe('generateEncounter flavorVersion', () => {
  it('defaults to flavorVersion 1 (omitting it matches an explicit 1)', () => {
    for (const seed of SEEDS) {
      const base = {
        party: party(4, 5),
        difficulty: 'Moderate' as Difficulty,
        environment: 'Forest' as const,
        seed,
      };
      const implicit = generateEncounter(ALL_MONSTERS, base, filterMonsters);
      const explicit = generateEncounter(
        ALL_MONSTERS, { ...base, flavorVersion: 1 as const }, filterMonsters,
      );
      expect(implicit).toEqual(explicit);
    }
  });

  it('v2 output equals v1 output FOR NOW (pin deleted by issue #93)', () => {
    // TEMPORARY PIN: flavorVersion 2 currently resolves to the frozen v1
    // pools, so same seed ⇒ identical output across versions. When issue
    // #93 lands generated v2 content, this test is DELETED (not updated) —
    // v2 diverging from v1 is the whole point of that issue.
    for (const seed of SEEDS) {
      const base = {
        party: party(5, 9),
        difficulty: 'High' as Difficulty,
        environment: 'Mountain' as const,
        seed,
      };
      const v1 = generateEncounter(
        ALL_MONSTERS, { ...base, flavorVersion: 1 as const }, filterMonsters,
      );
      const v2 = generateEncounter(
        ALL_MONSTERS, { ...base, flavorVersion: 2 as const }, filterMonsters,
      );
      expect(v2).toEqual(v1);
    }
  });
});
