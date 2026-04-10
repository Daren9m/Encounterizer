import { Monster } from '../lib/types';
import { MONSTERS_CR_0_QUARTER } from './monsters-cr0-quarter';
import { MONSTERS_CR_HALF_1 } from './monsters-cr-half-1';
import { MONSTERS_CR_2_4 } from './monsters-cr2-4';
import { MONSTERS_CR_5_8 } from './monsters-cr5-8';
import { MONSTERS_CR_9_13 } from './monsters-cr9-13';
import { MONSTERS_CR_14_20 } from './monsters-cr14-20';
import { MONSTERS_CR_21_30 } from './monsters-cr21-30';

// Re-export individual CR ranges for selective loading
export {
  MONSTERS_CR_0_QUARTER,
  MONSTERS_CR_HALF_1,
  MONSTERS_CR_2_4,
  MONSTERS_CR_5_8,
  MONSTERS_CR_9_13,
  MONSTERS_CR_14_20,
  MONSTERS_CR_21_30,
};

// Combined monster database — all CR ranges
export const ALL_MONSTERS: Monster[] = [
  ...MONSTERS_CR_0_QUARTER,
  ...MONSTERS_CR_HALF_1,
  ...MONSTERS_CR_2_4,
  ...MONSTERS_CR_5_8,
  ...MONSTERS_CR_9_13,
  ...MONSTERS_CR_14_20,
  ...MONSTERS_CR_21_30,
];

// Quick lookup by ID
const monsterIndex = new Map<string, Monster>();
ALL_MONSTERS.forEach((m) => monsterIndex.set(m.id, m));

export function getMonsterById(id: string): Monster | undefined {
  return monsterIndex.get(id);
}

// Quick lookup by name (case-insensitive)
export function getMonsterByName(name: string): Monster | undefined {
  const lower = name.toLowerCase();
  return ALL_MONSTERS.find((m) => m.name.toLowerCase() === lower);
}
