// Shared test fixtures. Not a test file — Vitest only picks up *.test.ts.

import type { Monster } from '@/lib/types';

/** Build a valid Monster with sensible defaults; override any field. */
export function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    id: 'test-monster',
    name: 'Test Monster',
    source: 'Custom',
    size: 'Medium',
    type: 'Humanoid',
    alignment: 'True Neutral',
    armor: { ac: 12 },
    hitPoints: 11,
    hitDice: '2d8+2',
    speed: { walk: 30 },
    abilities: { str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10 },
    senses: ['passive Perception 10'],
    languages: ['Common'],
    challengeRating: 0.25,
    proficiencyBonus: 2,
    xp: 50,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    actions: [
      {
        name: 'Club',
        description: 'Melee Attack Roll: +2, reach 5 ft. Hit: 2 (1d4) Bludgeoning damage.',
        attackDelivery: 'Melee',
        attackBonus: 2,
        reach: 5,
        damageTypes: ['Bludgeoning'],
        damageDice: '1d4',
      },
    ],
    environments: ['Forest'],
    isLegendary: false,
    isMythic: false,
    hasLair: false,
    hasSpellcasting: false,
    movementModes: ['Walk'],
    attackDamageTypes: ['Bludgeoning'],
    attackDeliveryModes: ['Melee'],
    tags: [],
    ...overrides,
  };
}
