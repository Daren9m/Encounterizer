import { describe, expect, it } from 'vitest';
import {
  convertAdventuringGear,
  convertChapterArticles,
  convertClassFile,
  convertEquipmentTables,
  convertTool,
} from './convert-reference';

describe('extended SRD reference conversion', () => {
  it('splits each class file into a base class and its subclass', () => {
    const entries = convertClassFile(`# Fighter

**Core Fighter Traits**

| Primary Ability | Strength or Dexterity |
| --- | --- |

## Fighter Class Features

### Level 1: Second Wind

Regain Hit Points.

## Fighter Subclass: Champion

### Level 3: Improved Critical

Your attacks score a Critical Hit on a roll of 19 or 20.
`);

    expect(entries.map((entry) => [entry.name, entry.kind, entry.className])).toEqual([
      ['Fighter', 'Class', 'Fighter'],
      ['Champion', 'Subclass', 'Fighter'],
    ]);
    expect(entries[0].sections.some((section) => section.heading === 'Level 1: Second Wind')).toBe(true);
    expect(entries[1].sections[0].heading).toBe('Level 3: Improved Critical');
  });

  it('stops before entry compendiums when converting chapter rules', () => {
    const articles = convertChapterArticles(`# Spells

## Gaining Spells

Classes prepare spells in different ways.

## Casting Spells

Each spell has a casting time.

## Spell Descriptions

### Fireball

Boom.

## Teleportation Outcome

This heading belongs to a spell entry.
`, 'Spellcasting Rules', ['Spell Descriptions']);

    expect(articles.map((article) => article.name)).toEqual(['Gaining Spells', 'Casting Spells']);
  });

  it('structures table equipment, gear, and tools with searchable facts', () => {
    const chapter = `# Equipment

**Weapons**

| Name | Damage | Properties | Mastery | Weight | Cost |
| --- | --- | --- | --- | --- | --- |
| *Simple Melee Weapons* | | | | | |
| Club | 1d4 Bludgeoning | Light | Slow | 2 lb. | 1 SP |

##### Armor

| Armor | Armor Class (AC) | Strength | Stealth | Weight | Cost |
| --- | --- | --- | --- | --- | --- |
| **Light Armor** | | | | | |
| Leather Armor | 11 + Dex modifier | - | - | 10 lb. | 10 GP |

**Adventuring Gear**

| Item | Weight | Cost |
| --- | --- | --- |
| Acid | 1 lb. | 25 GP |

**Mounts and Other Animals**

| Item | Carrying Capacity | Cost |
| --- | --- | --- |
| Camel | 450 lb. | 50 GP |

**Tack, Harness, and Drawn Vehicles**

| Item | Weight | Cost |
| --- | --- | --- |
| Cart | 200 lb. | 15 GP |

**Airborne and Waterborne Vehicles**

| Ship | Speed | Crew | Passengers | Cargo (Tons) | AC | HP | Damage Threshold | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Airship | 8 mph | 10 | 20 | 1 | 13 | 300 | - | 40,000 GP |
`;

    const tableEntries = convertEquipmentTables(chapter);
    expect(tableEntries.map((entry) => entry.name)).toEqual([
      'Club', 'Leather Armor', 'Camel', 'Cart', 'Airship',
    ]);
    expect(tableEntries[0].facts).toContainEqual({ label: 'Mastery', value: 'Slow' });
    expect(tableEntries[4].facts).toContainEqual({ label: 'Cargo', value: '1 ton' });
    expect(convertAdventuringGear('# Acid (25 GP)\n\nDeals acid damage.', chapter)).toMatchObject({
      name: 'Acid',
      cost: '25 GP',
      weight: '1 lb.',
      category: 'Adventuring Gear',
    });
    expect(convertTool(`# Smith's Tools (20 GP)

**Ability:** Strength

**Weight:** 8 lb.

**Utilize:** Pry open a door (DC 20)
`)).toMatchObject({
      name: "Smith's Tools",
      cost: '20 GP',
      weight: '8 lb.',
      facts: expect.arrayContaining([{ label: 'Ability', value: 'Strength' }]),
    });
  });
});
