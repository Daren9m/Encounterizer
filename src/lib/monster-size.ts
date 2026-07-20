import type { Monster, Size } from './types';

/** Every legal size for a monster, falling back to its primary size. */
export function getMonsterSizes(monster: Pick<Monster, 'size' | 'sizeOptions'>): Size[] {
  return monster.sizeOptions?.length ? monster.sizeOptions : [monster.size];
}

/** SRD-style display text such as "Medium or Small". */
export function formatMonsterSize(monster: Pick<Monster, 'size' | 'sizeOptions'>): string {
  return getMonsterSizes(monster).join(' or ');
}
