import { describe, expect, it } from 'vitest';
import { filterMonsters, getFilterOptions, getMonsterSummaryStats } from '@/lib/monster-filter';
import { makeMonster } from './test-helpers';

const goblin = makeMonster({
  id: 'goblin',
  name: 'Goblin Warrior',
  type: 'Fey',
  size: 'Small',
  challengeRating: 0.25,
  environments: ['Forest', 'Grassland'],
  tags: ['ambusher'],
});

const dragon = makeMonster({
  id: 'red-dragon',
  name: 'Adult Red Dragon',
  type: 'Dragon',
  size: 'Huge',
  armor: { ac: 19 },
  hitPoints: 256,
  challengeRating: 17,
  environments: ['Mountain'],
  isLegendary: true,
  hasLair: true,
  movementModes: ['Walk', 'Fly'],
  attackDamageTypes: ['Piercing', 'Fire'],
  damageImmunities: ['Fire'],
});

const ghost = makeMonster({
  id: 'ghost',
  name: 'Ghost',
  type: 'Undead',
  challengeRating: 4,
  hitPoints: 45,
  armor: { ac: 11 },
  environments: ['Urban'],
  conditionImmunities: ['Charmed', 'Exhaustion'],
  movementModes: ['Fly', 'Hover'],
});

const ALL = [goblin, dragon, ghost];

const flexibleHumanoid = makeMonster({
  id: 'priest',
  name: 'Priest',
  type: 'Humanoid',
  size: 'Medium',
  sizeOptions: ['Medium', 'Small'],
});

describe('filterMonsters', () => {
  it('passes everything through an empty filter, sorted by name', () => {
    const result = filterMonsters(ALL, {});
    expect(result.map((m) => m.id)).toEqual(['red-dragon', 'ghost', 'goblin']);
  });

  it('matches free-text search case-insensitively against name', () => {
    expect(filterMonsters(ALL, { search: 'gObLiN' })).toHaveLength(1);
    expect(filterMonsters(ALL, { search: 'dragon' })[0].id).toBe('red-dragon');
  });

  it('matches free-text search against tags', () => {
    expect(filterMonsters(ALL, { search: 'ambusher' })[0].id).toBe('goblin');
  });

  it('applies CR bounds inclusively', () => {
    expect(filterMonsters(ALL, { crMin: 4, crMax: 17 }).map((m) => m.id)).toEqual([
      'red-dragon',
      'ghost',
    ]);
    expect(filterMonsters(ALL, { crMax: 0.25 })[0].id).toBe('goblin');
  });

  it('filters by creature type and size', () => {
    expect(filterMonsters(ALL, { types: ['Undead'] })[0].id).toBe('ghost');
    expect(filterMonsters(ALL, { sizes: ['Huge'] })[0].id).toBe('red-dragon');
  });

  it('matches every allowed size on a flexible-size stat block', () => {
    expect(filterMonsters([flexibleHumanoid], { sizes: ['Medium'] })).toHaveLength(1);
    expect(filterMonsters([flexibleHumanoid], { sizes: ['Small'] })).toHaveLength(1);
    expect(getFilterOptions([flexibleHumanoid]).sizes).toEqual(['Medium', 'Small']);
  });

  it('uses ANY-overlap semantics for environments and movement', () => {
    expect(filterMonsters(ALL, { environments: ['Grassland', 'Urban'] }).map((m) => m.id)).toEqual([
      'ghost',
      'goblin',
    ]);
    expect(filterMonsters(ALL, { movementModes: ['Hover'] })[0].id).toBe('ghost');
  });

  it('honors boolean flags only when defined', () => {
    expect(filterMonsters(ALL, { isLegendary: true })[0].id).toBe('red-dragon');
    expect(filterMonsters(ALL, { isLegendary: false })).toHaveLength(2);
    expect(filterMonsters(ALL, {})).toHaveLength(3);
  });

  it('sorts by CR descending with stable name tiebreak', () => {
    const result = filterMonsters(ALL, { sortBy: 'cr', sortDir: 'desc' });
    expect(result.map((m) => m.id)).toEqual(['red-dragon', 'ghost', 'goblin']);
  });

  it('sorts by HP and AC', () => {
    expect(filterMonsters(ALL, { sortBy: 'hp', sortDir: 'asc' })[0].id).toBe('goblin');
    expect(filterMonsters(ALL, { sortBy: 'ac', sortDir: 'desc' })[0].id).toBe('red-dragon');
  });

  it('keeps base, giant, and swarm variants together in family order', () => {
    const variants = [
      makeMonster({ id: 'zombie', name: 'Zombie' }),
      makeMonster({ id: 'swarm-rats', name: 'Swarm of Rats' }),
      makeMonster({ id: 'giant-rat', name: 'Giant Rat' }),
      makeMonster({ id: 'rat', name: 'Rat' }),
      makeMonster({ id: 'raven', name: 'Raven' }),
    ];

    expect(filterMonsters(variants, { sortBy: 'family' }).map((m) => m.id)).toEqual([
      'rat',
      'giant-rat',
      'swarm-rats',
      'raven',
      'zombie',
    ]);
  });
});

describe('getFilterOptions', () => {
  it('collects distinct values and the CR range', () => {
    const options = getFilterOptions(ALL);
    expect(options.types).toEqual(['Dragon', 'Fey', 'Undead']);
    expect(options.crMin).toBe(0.25);
    expect(options.crMax).toBe(17);
    expect(options.movementModes).toContain('Hover');
    expect(options.tags).toEqual(['ambusher']);
  });

  it('falls back to a 0-30 CR range for an empty list', () => {
    const options = getFilterOptions([]);
    expect(options.crMin).toBe(0);
    expect(options.crMax).toBe(30);
  });
});

describe('getMonsterSummaryStats', () => {
  it('counts totals and distributions', () => {
    const stats = getMonsterSummaryStats(ALL);
    expect(stats.totalCount).toBe(3);
    expect(stats.crDistribution[17]).toBe(1);
    expect(stats.typeDistribution.Undead).toBe(1);
  });
});
