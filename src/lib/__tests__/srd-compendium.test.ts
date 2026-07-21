import { describe, expect, it } from 'vitest';
import {
  filterSrdCompendium,
  SRD_COMPENDIUM_CATEGORIES,
  SRD_COMPENDIUM_ENTRIES,
} from '@/lib/srd-compendium';

describe('SRD compendium', () => {
  it('indexes every structured Wave 1 resource exactly once', () => {
    expect(SRD_COMPENDIUM_ENTRIES).toHaveLength(287);
    expect(new Set(SRD_COMPENDIUM_ENTRIES.map((entry) => entry.key)).size).toBe(287);
    expect(Object.fromEntries(
      SRD_COMPENDIUM_CATEGORIES.map((category) => [category.id, category.count]),
    )).toEqual({
      'magic-items': 257,
      feats: 17,
      backgrounds: 4,
      species: 9,
    });
  });

  it('searches names and full resource mechanics', () => {
    expect(filterSrdCompendium({ query: 'bag holding', category: 'all' })[0]?.name)
      .toBe('Bag of Holding');
    expect(filterSrdCompendium({ query: 'initiative swap', category: 'all' }).map((entry) => entry.name))
      .toContain('Alert');
    expect(filterSrdCompendium({ query: 'darkvision 120', category: 'species' }).map((entry) => entry.name))
      .toEqual(expect.arrayContaining(['Dwarf', 'Orc']));
    expect(filterSrdCompendium({ query: 'calligrapher supplies', category: 'backgrounds' }))
      .toHaveLength(2);
  });

  it('applies resource-specific filters without leaking other categories', () => {
    const legendaryRings = filterSrdCompendium({
      query: '',
      category: 'magic-items',
      magicItemRarity: 'Legendary',
      magicItemCategory: 'Ring',
    });
    expect(legendaryRings.length).toBeGreaterThan(0);
    expect(legendaryRings.every((entry) => (
      entry.category === 'magic-items'
      && entry.resource.rarities.includes('Legendary')
      && entry.resource.category === 'Ring'
    ))).toBe(true);

    const originFeats = filterSrdCompendium({
      query: '',
      category: 'feats',
      featCategory: 'Origin',
    });
    expect(originFeats).toHaveLength(4);
    expect(originFeats.every((entry) => entry.category === 'feats' && entry.resource.category === 'Origin'))
      .toBe(true);
  });

  it('uses stable alphabetical ordering across the combined library', () => {
    const names = SRD_COMPENDIUM_ENTRIES.map((entry) => entry.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
