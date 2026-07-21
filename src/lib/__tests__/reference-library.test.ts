import { describe, expect, it } from 'vitest';
import {
  filterReferenceLibrary,
  REFERENCE_CATEGORIES,
  REFERENCE_LIBRARY_ENTRIES,
} from '@/lib/reference-library';

describe('reference library', () => {
  it('indexes every built-in non-monster reference exactly once', () => {
    expect(REFERENCE_LIBRARY_ENTRIES).toHaveLength(659);
    expect(new Set(REFERENCE_LIBRARY_ENTRIES.map((entry) => entry.key)).size).toBe(659);
    expect(Object.fromEntries(REFERENCE_CATEGORIES.map((category) => [category.id, category.count])))
      .toEqual({
        rules: 33,
        spells: 339,
        'magic-items': 257,
        feats: 17,
        backgrounds: 4,
        species: 9,
      });
  });

  it('searches naturally across different resource types', () => {
    expect(filterReferenceLibrary({ query: 'death saving throws', category: 'all' })[0]?.name)
      .toBe('Death Saving Throws');
    expect(filterReferenceLibrary({ query: 'fireball', category: 'all' }).map((entry) => entry.name))
      .toContain('Fireball');
    expect(filterReferenceLibrary({ query: 'bag holding', category: 'all' })[0]?.name)
      .toBe('Bag of Holding');
    expect(filterReferenceLibrary({ query: 'darkvision 120', category: 'species' }).map((entry) => entry.name))
      .toEqual(expect.arrayContaining(['Dwarf', 'Orc']));
  });

  it('applies rule, spell, item, and feat filters', () => {
    expect(filterReferenceLibrary({ query: '', category: 'rules', ruleCategory: 'conditions' }))
      .toHaveLength(15);
    const wizardRituals = filterReferenceLibrary({
      query: '',
      category: 'spells',
      spellClass: 'Wizard',
      ritual: 'yes',
    });
    expect(wizardRituals.length).toBeGreaterThan(0);
    expect(wizardRituals.every((entry) => (
      entry.category === 'spells' && entry.resource.classes.includes('Wizard') && entry.resource.ritual
    ))).toBe(true);

    const legendaryRings = filterReferenceLibrary({
      query: '',
      category: 'magic-items',
      magicItemRarity: 'Legendary',
      magicItemCategory: 'Ring',
    });
    expect(legendaryRings).toHaveLength(5);
    expect(filterReferenceLibrary({ query: '', category: 'feats', featCategory: 'Origin' }))
      .toHaveLength(4);
  });

  it('can narrow any category to bookmarks', () => {
    const keys = new Set(['rules:cover', 'spells:fireball', 'species:dwarf']);
    const saved = filterReferenceLibrary(
      { query: '', category: 'all', bookmarkedOnly: true },
      REFERENCE_LIBRARY_ENTRIES,
      keys,
    );
    expect(saved.map((entry) => entry.key)).toEqual(['rules:cover', 'species:dwarf', 'spells:fireball']);
    expect(filterReferenceLibrary(
      { query: '', category: 'rules', bookmarkedOnly: true },
      REFERENCE_LIBRARY_ENTRIES,
      keys,
    ).map((entry) => entry.key)).toEqual(['rules:cover']);
  });
});
