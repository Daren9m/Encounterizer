import { describe, expect, it } from 'vitest';
import {
  filterRulesReference,
  RULES_REFERENCE_CATEGORIES,
  RULES_REFERENCE_ENTRIES,
  rulesReferenceToMarkdown,
  SRD_5_2_1_URL,
} from '@/data/rules-reference';

function entryText(id: string): string {
  const entry = RULES_REFERENCE_ENTRIES.find((candidate) => candidate.id === id);
  expect(entry, `Missing rules reference entry: ${id}`).toBeDefined();
  return [entry!.summary, ...entry!.details].join(' ');
}

describe('rules reference', () => {
  it('includes all SRD conditions', () => {
    const conditionTitles = RULES_REFERENCE_ENTRIES
      .filter((entry) => entry.category === 'conditions')
      .map((entry) => entry.title);
    expect(conditionTitles).toEqual([
      'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled',
      'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
      'Restrained', 'Stunned', 'Unconscious',
    ]);
  });

  it('keeps categories scan-first and every entry uniquely categorized', () => {
    expect(RULES_REFERENCE_CATEGORIES.map((category) => category.id)).toEqual([
      'conditions',
      'checks-saves',
      'combat',
      'damage-recovery',
      'movement-visibility',
    ]);
    expect(RULES_REFERENCE_ENTRIES).toHaveLength(33);
    expect(new Set(RULES_REFERENCE_ENTRIES.map((entry) => entry.id)).size).toBe(33);

    for (const category of RULES_REFERENCE_CATEGORIES) {
      expect(
        RULES_REFERENCE_ENTRIES.some((entry) => entry.category === category.id),
        `Category ${category.id} should contain at least one entry`,
      ).toBe(true);
    }
    const categoryIds = new Set(RULES_REFERENCE_CATEGORIES.map((category) => category.id));
    for (const entry of RULES_REFERENCE_ENTRIES) {
      expect(categoryIds.has(entry.category), `${entry.id} has an unknown category`).toBe(true);
    }
  });

  it('provides valid SRD 5.2.1 source metadata for every entry', () => {
    expect(SRD_5_2_1_URL).toBe(
      'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf',
    );
    for (const entry of RULES_REFERENCE_ENTRIES) {
      expect(entry.sources.length, `${entry.id} should cite at least one source`).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(source.document).toBe('SRD 5.2.1');
        expect(source.section.trim(), `${entry.id} has an empty source section`).not.toBe('');
        expect(Number.isInteger(source.page), `${entry.id} has a non-integer page`).toBe(true);
        expect(source.page, `${entry.id} has an invalid printed page`).toBeGreaterThan(0);
        expect(source.page, `${entry.id} has an invalid printed page`).toBeLessThanOrEqual(364);
      }
    }
  });

  it('preserves verified SRD rules that are easy to misstate', () => {
    const actions = entryText('common-actions');
    expect(actions).toContain('if you can see the attacker');
    expect(actions).toContain('action or movement up to your Speed');

    expect(entryText('unarmed-strike')).toContain('only Damage uses an attack roll');

    const rests = entryText('rests');
    expect(rests).toContain('minimum 1 HP regained');
    expect(rests).not.toContain('minimum 0');

    const climbing = entryText('climb-swim-crawl');
    expect(climbing).toContain('DC 15 Strength (Athletics)');
    expect(climbing).not.toContain('Athletics or Acrobatics');

    const damage = entryText('damage-resistance-vulnerability');
    expect(damage).toContain('Resistance second');
    expect(damage).toContain('Vulnerability third');
  });

  it('searches titles, details, and tags within a category', () => {
    expect(filterRulesReference('medicine').map((entry) => entry.id)).toContain('death-saves');
    expect(filterRulesReference('dexterity', 'conditions').map((entry) => entry.id)).toContain('restrained');
    expect(filterRulesReference('dexterity', 'combat').map((entry) => entry.id)).not.toContain('restrained');
  });

  it('produces a complete printable Markdown reference', () => {
    const markdown = rulesReferenceToMarkdown();
    expect(markdown).toContain('## Checks & saves');
    expect(markdown).toContain('### Concentration');
    expect(markdown).toContain('### Hiding');
    expect(markdown).toContain(`[SRD 5.2.1 p. 191](${SRD_5_2_1_URL})`);
    expect(markdown).toContain('Rules Glossary: Unconscious [Condition]');
  });
});
