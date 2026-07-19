import { describe, expect, it } from 'vitest';
import { prioritizePinnedMonsters } from '@/lib/pinned-monsters';

const MONSTERS = [
  { id: 'goblin', name: 'Goblin' },
  { id: 'owlbear', name: 'Owlbear' },
  { id: 'dragon', name: 'Dragon' },
  { id: 'zombie', name: 'Zombie' },
];

describe('prioritizePinnedMonsters', () => {
  it('moves pinned monsters ahead of the current sort order', () => {
    expect(prioritizePinnedMonsters(MONSTERS, ['dragon']).map((monster) => monster.id))
      .toEqual(['dragon', 'goblin', 'owlbear', 'zombie']);
  });

  it('uses pin order while preserving the order of unpinned results', () => {
    expect(prioritizePinnedMonsters(MONSTERS, ['zombie', 'owlbear']).map((monster) => monster.id))
      .toEqual(['zombie', 'owlbear', 'goblin', 'dragon']);
  });

  it('ignores stale and duplicate pinned ids', () => {
    expect(prioritizePinnedMonsters(MONSTERS, ['missing', 'dragon', 'dragon']).map((monster) => monster.id))
      .toEqual(['dragon', 'goblin', 'owlbear', 'zombie']);
  });
});
