import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertBackground, convertFeat, convertMagicItem, convertSpecies } from './convert';
import { markdownToPlainText, parseSrdEntry, repairOcrSpacing } from './parse-entry';

const FIXTURES = join(__dirname, '__fixtures__');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseSrdEntry', () => {
  it('parses the shared heading, subtitle, field, and prose format', () => {
    const feat = parseSrdEntry(fixture('Alert.md'));
    expect(feat.name).toBe('Alert');
    expect(feat.subtitle).toBe('Origin Feat');
    expect(feat.description).toContain('Initiative Proficiency. When you roll Initiative');

    const background = parseSrdEntry(fixture('Acolyte.md'));
    expect(background.fields['Ability Scores']).toBe('Intelligence, Wisdom, Charisma');
    expect(background.fields['Tool Proficiency']).toBe("Calligrapher's Supplies");
  });

  it('flattens inline formatting, headings, lists, and tables without Markdown residue', () => {
    const plain = markdownToPlainText(`## Choices\n\n- *First*\n- **Second**\n\n| Die | Result |\n| --- | --- |\n| 1 | Bright |`);
    expect(plain).toBe('Choices\n\n• First\n• Second\n\nDie — Result\n1 — Bright');
    expect(plain).not.toMatch(/[*#|`]/);
  });

  it('repairs split OCR ability labels without changing ordinary words', () => {
    expect(repairOcrSpacing('S tr 19, D ex +2, Con 14, a strange result')).toBe(
      'Str 19, Dex +2, Con 14, a strange result',
    );
  });

  it('rejects empty or headerless entries', () => {
    expect(() => parseSrdEntry('')).toThrow('empty');
    expect(() => parseSrdEntry('Alert')).toThrow('level-one');
  });
});

describe('Wave 1 converters with real SRD-reForged entries', () => {
  it('converts a magic item', () => {
    const item = convertMagicItem('Bag_of_Holding.md', fixture('Bag_of_Holding.md'));
    expect(item).toMatchObject({
      id: 'bag-of-holding',
      category: 'Wondrous Item',
      rarities: ['Uncommon'],
      requiresAttunement: false,
    });
    expect(item.description).toContain('Handy Haversack');
    expect(item.description).not.toContain('*');
  });

  it('keeps commas inside an item category detail out of the rarity label', () => {
    const item = convertMagicItem('Adamantine_Armor.md', `# Adamantine Armor

*Armor (Any Medium or Heavy, Except Hide Armor), Uncommon*

Critical Hits become normal hits.`);
    expect(item).toMatchObject({
      category: 'Armor',
      categoryDetail: 'Any Medium or Heavy, Except Hide Armor',
      rarityText: 'Uncommon',
      rarities: ['Uncommon'],
    });
  });

  it('converts a feat', () => {
    expect(convertFeat('Alert.md', fixture('Alert.md'))).toMatchObject({
      id: 'alert',
      category: 'Origin',
      source: 'SRD 5.2.1',
    });
  });

  it('converts a background', () => {
    expect(convertBackground('Acolyte.md', fixture('Acolyte.md'))).toMatchObject({
      id: 'acolyte',
      abilityScores: ['Intelligence', 'Wisdom', 'Charisma'],
      feat: 'Magic Initiate (Cleric)',
      skillProficiencies: ['Insight', 'Religion'],
    });
  });

  it('converts a species and keeps continuation paragraphs with their trait', () => {
    const species = convertSpecies('Dwarf.md', fixture('Dwarf.md'));
    expect(species).toMatchObject({ id: 'dwarf', creatureType: 'Humanoid', speed: 30 });
    expect(species.traits).toHaveLength(4);
    expect(species.traits.at(-1)?.description).toContain('regain all expended uses');
  });
});
