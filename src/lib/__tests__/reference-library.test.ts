import { describe, expect, it } from 'vitest';
import {
  filterReferenceLibrary,
  REFERENCE_CATEGORIES,
  REFERENCE_LIBRARY_ENTRIES,
} from '@/lib/reference-library';

describe('reference library', () => {
  it('indexes every built-in non-monster reference exactly once', () => {
    expect(REFERENCE_LIBRARY_ENTRIES).toHaveLength(1032);
    expect(new Set(REFERENCE_LIBRARY_ENTRIES.map((entry) => entry.key)).size).toBe(1032);
    expect(Object.fromEntries(REFERENCE_CATEGORIES.map((category) => [category.id, category.count])))
      .toEqual({
        rules: 200,
        classes: 24,
        spells: 339,
        equipment: 182,
        'magic-items': 257,
        feats: 17,
        backgrounds: 4,
        species: 9,
      });
  });

  it('searches naturally across different resource types', () => {
    expect(filterReferenceLibrary({ query: 'death saving throw', category: 'all' }).map((entry) => entry.name))
      .toContain('Death Saving Throw');
    expect(filterReferenceLibrary({ query: 'path berserker frenzy', category: 'classes' })[0]?.name)
      .toBe('Path of the Berserker');
    expect(filterReferenceLibrary({ query: '1d12 piercing musket', category: 'equipment' })[0]?.name)
      .toBe('Musket');
    expect(filterReferenceLibrary({ query: 'mental stress effects', category: 'rules' })[0]?.name)
      .toBe('Fear and Mental Stress');
    expect(filterReferenceLibrary({ query: 'fireball', category: 'all' }).map((entry) => entry.name))
      .toContain('Fireball');
    expect(filterReferenceLibrary({ query: 'bag holding', category: 'all' })[0]?.name)
      .toBe('Bag of Holding');
    expect(filterReferenceLibrary({ query: 'darkvision 120', category: 'species' }).map((entry) => entry.name))
      .toEqual(expect.arrayContaining(['Dwarf', 'Orc']));
  });

  it('applies rule, class, equipment, spell, item, and feat filters', () => {
    expect(filterReferenceLibrary({ query: '', category: 'rules', ruleGroup: 'Gameplay Toolbox' }))
      .toHaveLength(8);
    expect(filterReferenceLibrary({ query: '', category: 'classes', classKind: 'Subclass' }))
      .toHaveLength(12);
    expect(filterReferenceLibrary({ query: '', category: 'classes', className: 'Bard' }))
      .toHaveLength(2);
    expect(filterReferenceLibrary({ query: '', category: 'equipment', equipmentCategory: 'Weapon' }))
      .toHaveLength(38);
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
    const keys = new Set(['rules:rules-glossary-cover', 'spells:fireball', 'species:dwarf']);
    const saved = filterReferenceLibrary(
      { query: '', category: 'all', bookmarkedOnly: true },
      REFERENCE_LIBRARY_ENTRIES,
      keys,
    );
    expect(saved.map((entry) => entry.key)).toEqual(['rules:rules-glossary-cover', 'species:dwarf', 'spells:fireball']);
    expect(filterReferenceLibrary(
      { query: '', category: 'rules', bookmarkedOnly: true },
      REFERENCE_LIBRARY_ENTRIES,
      keys,
    ).map((entry) => entry.key)).toEqual(['rules:rules-glossary-cover']);
  });
});
