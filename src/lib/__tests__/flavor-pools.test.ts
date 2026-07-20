import { describe, expect, it } from 'vitest';
import { getFlavorPools } from '@/lib/flavor-pools';

// These pins freeze the v1 flavor pools VERBATIM. The strings below were
// copied character-for-character from the inline pools that lived in
// src/lib/encounter-generator.ts before extraction. If any of these
// assertions fail, seeded replay links (?seed=...) would produce different
// prose — that is a contract break, not a test to update.

describe('getFlavorPools(1) — frozen v1 content', () => {
  const pools = getFlavorPools(1);

  it('pins the scenario hook pool (length + first + last)', () => {
    expect(pools.scenarioHooks).toHaveLength(20);
    expect(pools.scenarioHooks[0]).toBe(
      'The party stumbles upon {monsters} while traveling through the {environment}.',
    );
    expect(pools.scenarioHooks[19]).toBe(
      'The ruins in the {environment} are not as abandoned as they appear — {monsters} lurk within.',
    );
  });

  it('pins the tactics-by-type pool (type list + sampled lines)', () => {
    expect(Object.keys(pools.tacticsByType)).toEqual([
      'Beast', 'Undead', 'Humanoid', 'Dragon', 'Fiend', 'Aberration',
      'Elemental', 'Monstrosity', 'Giant', 'Construct', 'Ooze',
      'Celestial', 'Fey', 'Plant',
    ]);
    for (const lines of Object.values(pools.tacticsByType)) {
      expect(lines).toHaveLength(3);
    }
    expect(pools.tacticsByType['Beast'][0]).toBe(
      'These creatures fight on instinct — they flee when reduced below half HP.',
    );
    expect(pools.tacticsByType['Plant'][2]).toBe(
      'Focuses on grappling and restraining rather than direct damage.',
    );
    // The generator's fallback bucket for unknown types must stay present.
    expect(pools.tacticsByType['Monstrosity'][0]).toBe(
      'Ambushes from hiding, using surprise to devastating effect.',
    );
  });

  it('pins the treasure-by-tier pool (tiers + first + last of each)', () => {
    expect(Object.keys(pools.treasureByTier)).toEqual(['low', 'mid', 'high', 'legendary']);
    for (const entries of Object.values(pools.treasureByTier)) {
      expect(entries).toHaveLength(4);
    }
    expect(pools.treasureByTier.low[0]).toBe('2d6 GP in loose coin');
    expect(pools.treasureByTier.low[3]).toBe(
      'A crude map leading to a nearby point of interest',
    );
    expect(pools.treasureByTier.mid[0]).toBe('4d6 × 10 GP, 1d6 gems worth 50 GP each');
    expect(pools.treasureByTier.mid[3]).toBe(
      'An uncommon magic item from the DMG random tables',
    );
    expect(pools.treasureByTier.high[0]).toBe(
      '2d6 × 100 GP, 2d6 gems worth 100 GP each',
    );
    expect(pools.treasureByTier.high[3]).toBe(
      'An art object worth 750 GP and a rare magic item',
    );
    expect(pools.treasureByTier.legendary[0]).toBe(
      'A very rare or legendary magic item',
    );
    expect(pools.treasureByTier.legendary[3]).toBe(
      'An immense hoard: 5,000+ GP in mixed treasure and 2 rare magic items',
    );
  });

  it('pins the encounter-name prefix pool (length + first + last)', () => {
    expect(pools.namePrefixes).toHaveLength(10);
    expect(pools.namePrefixes[0]).toBe('Ambush');
    expect(pools.namePrefixes[9]).toBe('Battle');
  });
});

describe('getFlavorPools(2)', () => {
  it('currently resolves to the same frozen v1 content (until issue #93)', () => {
    // Issue #93 points version 2 at generated src/data/encounter-flavor.ts.
    // Until then v2 is intentionally identical to v1.
    expect(getFlavorPools(2)).toEqual(getFlavorPools(1));
  });
});
