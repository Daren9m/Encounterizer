import { describe, expect, it } from 'vitest';
import { encounterPlayerHandoutMarkdown, encounterToFoundry, encounterToMarkdown } from '@/lib/encounter-export';
import { makeMonster } from './test-helpers';
import type { Encounter } from '@/lib/types';

const ENCOUNTER: Encounter = {
  id: 'export-test', name: 'The Hidden Knife', description: 'A shadow crosses the ruined gate.',
  environment: 'Urban', difficulty: 'Moderate', totalXp: 200, seed: 42,
  monsters: [{ monster: makeMonster({ name: 'Secret Assassin', hitPoints: 99 }), count: 2 }],
  tactics: 'Focus the wounded wizard.', treasure: 'A trapped ruby.',
};

describe('encounter exports', () => {
  it('writes a table-ready Markdown packet', () => {
    const markdown = encounterToMarkdown(ENCOUNTER);
    expect(markdown).toContain('# The Hidden Knife');
    expect(markdown).toContain('2× Secret Assassin');
    expect(markdown).toContain('Focus the wounded wizard.');
  });

  it('keeps player handouts free of DM-only mechanics and spoilers', () => {
    const handout = encounterPlayerHandoutMarkdown(ENCOUNTER);
    expect(handout).toContain('A shadow crosses the ruined gate.');
    expect(handout).not.toMatch(/Secret Assassin|99|Focus the wounded|trapped ruby|XP/i);
  });

  it('emits actors and journal data for Foundry import tooling', () => {
    const foundry = encounterToFoundry(ENCOUNTER);
    expect(foundry.format).toBe('encounterizer-foundry-v1');
    expect(foundry.actors[0].count).toBe(2);
    expect(foundry.journal.text).toContain('The Hidden Knife');
  });
});
