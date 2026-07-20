import { describe, expect, it } from 'vitest';
import { EMPTY_BATTLE } from '@/lib/battle-organizer';
import { DM_SCREEN_TOOL_ROUTES } from '@/lib/site';
import {
  EMPTY_DM_SCREEN,
  dmScreenToMarkdown,
  removeSectionTree,
  syncPinnedItems,
  updateSectionTree,
  type DmScreenSection,
} from '@/lib/dm-screen';

const nested: DmScreenSection[] = [{
  id: 'parent', title: 'Parent', collapsed: false, items: [],
  children: [{ id: 'child', title: 'Child', collapsed: false, items: [], children: [] }],
}];

describe('DM screen', () => {
  it('never offers the DM Screen as a tool inside itself', () => {
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).not.toContain('/dm-screen');
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).toContain('/battle');
  });

  it('updates and removes deeply nested sections', () => {
    const updated = updateSectionTree(nested, 'child', (section) => ({ ...section, title: 'Updated' }));
    expect(updated[0].children[0].title).toBe('Updated');
    expect(removeSectionTree(updated, 'child')[0].children).toEqual([]);
  });

  it('syncs auto-pinned items without disturbing their view state', () => {
    let screen = syncPinnedItems(EMPTY_DM_SCREEN, ['goblin'], ['shield'], () => 'Goblin', () => 'Shield');
    screen.sections[0].items[0].hidden = true;
    screen = syncPinnedItems(screen, ['goblin'], ['shield', 'light'], () => 'Goblin', (id) => id === 'shield' ? 'Shield' : 'Light');
    expect(screen.sections[0].items.map((item) => item.title)).toEqual(['Goblin', 'Shield', 'Light']);
    expect(screen.sections[0].items[0].hidden).toBe(true);
  });

  it('exports notes and a complete battle table to Markdown', () => {
    const screen = {
      ...EMPTY_DM_SCREEN,
      sections: [{ id: 'run', title: 'Run', collapsed: true, children: [], items: [
        { id: 'note', kind: 'note' as const, title: 'Reminder', body: 'Use cover.', collapsed: true, hidden: true },
        { id: 'battle', kind: 'battle' as const, title: 'Fight', collapsed: true, hidden: false },
      ] }],
    };
    const markdown = dmScreenToMarkdown(screen, new Map(), new Map(), EMPTY_BATTLE);
    expect(markdown).toContain('Reminder _(hidden)_');
    expect(markdown).toContain('Use cover.');
    expect(markdown).toContain('| Init | Combatant | Side | HP | AC | Conditions | Notes |');
  });

  it('starts with a removable rules reference and exports its complete contents', () => {
    expect(EMPTY_DM_SCREEN.sections[0].items[0].kind).toBe('rules');
    const markdown = dmScreenToMarkdown(EMPTY_DM_SCREEN, new Map(), new Map(), EMPTY_BATTLE);
    expect(markdown).toContain('## Quick Reference');
    expect(markdown).toContain('Saving Throws');
    expect(markdown).toContain('Death Saving Throws');
    expect(markdown).toContain('Unconscious');
  });
});
