import { describe, expect, it } from 'vitest';
import {
  filterRulesReference,
  RULES_REFERENCE_ENTRIES,
  rulesReferenceToMarkdown,
} from '@/data/rules-reference';

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
  });
});
