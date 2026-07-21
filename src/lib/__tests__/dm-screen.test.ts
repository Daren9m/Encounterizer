import { describe, expect, it } from 'vitest';
import { EMPTY_BATTLE } from '@/lib/battle-organizer';
import { DM_SCREEN_TOOL_ROUTES } from '@/lib/site';
import {
  DM_SCREEN_MAX_ITEMS,
  EMPTY_DM_SCREEN,
  appendItemToSectionTree,
  cloneDmScreenDocument,
  createEmptyDmScreen,
  dmScreenToMarkdown,
  duplicateDmScreenItem,
  isDmScreenState,
  mergeDmScreenDocuments,
  parseDmScreenDocument,
  reduceDmScreenGrid,
  reduceDmScreenPanelDisplay,
  removeSectionTree,
  syncDmPartySnapshot,
  syncPinnedItems,
  updateSectionTree,
  type DmScreenIdFactory,
  type DmScreenItem,
  type DmScreenItemLayout,
  type DmScreenSection,
  type DmScreenState,
} from '@/lib/dm-screen';

function ids(...values: string[]): DmScreenIdFactory {
  let index = 0;
  return (kind) => values[index++] ?? `${kind}-${index}`;
}

function layout(
  overrides: Partial<DmScreenItemLayout> = {},
): DmScreenItemLayout {
  return {
    width: 'standard',
    stashed: false,
    excludedFromPrint: false,
    ...overrides,
  };
}

function note(id: string, overrides: Partial<DmScreenItem> = {}): DmScreenItem {
  return {
    id,
    kind: 'note',
    title: id,
    collapsed: false,
    ...overrides,
    layout: layout(overrides.layout),
  };
}

function screen(sections: DmScreenSection[], id = 'screen-test'): DmScreenState {
  return {
    ...cloneDmScreenDocument(EMPTY_DM_SCREEN),
    id,
    sections,
  };
}

const nested: DmScreenSection[] = [{
  id: 'parent', title: 'Parent', collapsed: false, items: [],
  children: [{ id: 'child', title: 'Child', collapsed: false, items: [], children: [] }],
}];

describe('DM screen', () => {
  it('never offers the DM Screen as a tool inside itself', () => {
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).not.toContain('/dm-screen');
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).toContain('/battle');
  });

  it('creates and deeply clones a valid v2 layout document', () => {
    const created = createEmptyDmScreen({
      createId: ids('screen-1', 'section-1', 'item-1'),
    });
    expect(created).toMatchObject({
      version: 2,
      id: 'screen-1',
      revision: 0,
      layout: { columns: 'auto', density: 'comfortable' },
      sections: [{
        id: 'section-1',
        items: [{
          id: 'item-1',
          layout: { width: 'full', stashed: false, excludedFromPrint: false },
        }],
      }],
    });
    expect(isDmScreenState(created)).toBe(true);

    const cloned = cloneDmScreenDocument(created);
    expect(cloned).toEqual(created);
    expect(cloned).not.toBe(created);
    expect(cloned.layout).not.toBe(created.layout);
    expect(cloned.sections[0]).not.toBe(created.sections[0]);
    expect(cloned.sections[0].items[0].layout).not.toBe(created.sections[0].items[0].layout);
  });

  it('updates and removes deeply nested sections', () => {
    const updated = updateSectionTree(nested, 'child', (section) => ({ ...section, title: 'Updated' }));
    expect(updated[0].children[0].title).toBe('Updated');
    expect(removeSectionTree(updated, 'child')[0].children).toEqual([]);
  });

  it('adds a panel to a nested section and reveals its collapsed ancestor path', () => {
    const sections: DmScreenSection[] = [{
      id: 'outer', title: 'Outer', collapsed: true, items: [],
      children: [{ id: 'inner', title: 'Inner', collapsed: true, items: [], children: [] }],
    }];
    const added = note('new-panel');
    const updated = appendItemToSectionTree(sections, 'inner', added);

    expect(updated[0].collapsed).toBe(false);
    expect(updated[0].children[0].collapsed).toBe(false);
    expect(updated[0].children[0].items).toEqual([added]);
    expect(appendItemToSectionTree(sections, 'missing', added)).toBe(sections);
    expect(sections[0].collapsed).toBe(true);
  });

  it('persists grid choices without changing panel state', () => {
    const document = screen([{
      id: 'section', title: 'Section', collapsed: false,
      items: [note('panel', { layout: layout({ width: 'wide', stashed: true }) })],
      children: [],
    }]);

    const fourColumns = reduceDmScreenGrid(document, { type: 'set-columns', columns: 4 });
    const compact = reduceDmScreenGrid(fourColumns, { type: 'set-density', density: 'compact' });

    expect(compact.layout).toEqual({ columns: 4, density: 'compact' });
    expect(compact.sections).toBe(document.sections);
    expect(compact.sections[0].items[0].layout).toEqual({
      width: 'wide', stashed: true, excludedFromPrint: false,
    });
    expect(reduceDmScreenGrid(compact, { type: 'set-density', density: 'compact' })).toBe(compact);
  });

  it('updates nested panel display state without changing its order or unrelated flags', () => {
    const before = note('before');
    const target = note('target', {
      collapsed: true,
      layout: layout({ width: 'compact', excludedFromPrint: true }),
    });
    const after = note('after');
    const document = screen([{
      id: 'outer', title: 'Outer', collapsed: true, items: [],
      children: [{
        id: 'inner', title: 'Inner', collapsed: true,
        items: [before, target, after], children: [],
      }],
    }]);

    const resized = reduceDmScreenPanelDisplay(document, target.id, {
      type: 'set-width', width: 'full',
    });
    const stashed = reduceDmScreenPanelDisplay(resized, target.id, {
      type: 'set-stashed', stashed: true,
    });
    const restored = reduceDmScreenPanelDisplay(stashed, target.id, {
      type: 'set-stashed', stashed: false,
    });
    const expanded = reduceDmScreenPanelDisplay(restored, target.id, {
      type: 'set-collapsed', collapsed: false,
    });
    const printable = reduceDmScreenPanelDisplay(expanded, target.id, {
      type: 'set-print-excluded', excludedFromPrint: false,
    });
    const panels = printable.sections[0].children[0].items;

    expect(panels.map((item) => item.id)).toEqual(['before', 'target', 'after']);
    expect(panels[1]).toMatchObject({
      collapsed: false,
      layout: { width: 'full', stashed: false, excludedFromPrint: false },
    });
    expect(printable.sections[0].collapsed).toBe(false);
    expect(printable.sections[0].children[0].collapsed).toBe(false);
    expect(printable.sections[0].items).toBe(document.sections[0].items);
    expect(reduceDmScreenPanelDisplay(printable, 'missing', {
      type: 'set-collapsed', collapsed: false,
    })).toBe(printable);
  });

  it('duplicates a nested manual panel beside its source with a fresh global ID', () => {
    const source = note('source-item', {
      kind: 'tool',
      title: 'Encounter notes',
      body: 'Keep every field.',
      resourceId: 'resource-1',
      href: '/battle',
      collapsed: true,
      layout: layout({ width: 'wide', stashed: true, excludedFromPrint: true }),
    });
    const document = screen([{
      id: 'parent', title: 'Parent', collapsed: false, items: [note('parent-item')],
      children: [{
        id: 'nested', title: 'Nested', collapsed: false,
        items: [note('before'), source, note('after')], children: [],
      }],
    }]);
    const original = cloneDmScreenDocument(document);

    const duplicated = duplicateDmScreenItem(document, source.id, {
      createId: ids(document.id, 'parent', 'copied-item'),
    });
    const nestedItems = duplicated.sections[0].children[0].items;

    expect(nestedItems.map((item) => item.id)).toEqual([
      'before', 'source-item', 'copied-item', 'after',
    ]);
    expect(nestedItems[2]).toEqual({
      ...source,
      id: 'copied-item',
      layout: { ...source.layout },
      origin: 'manual',
    });
    expect(nestedItems[2]).not.toBe(source);
    expect(nestedItems[2].layout).not.toBe(source.layout);
    expect(duplicated).not.toBe(document);
    expect(duplicated.sections[0]).not.toBe(document.sections[0]);
    expect(duplicated.sections[0].children[0]).not.toBe(document.sections[0].children[0]);
    expect(document).toEqual(original);
    expect(isDmScreenState(duplicated)).toBe(true);
  });

  it('does not duplicate missing or auto-pinned panels', () => {
    const autoPinned = note('auto-item', { origin: 'auto-pin' });
    const document = screen([{
      id: 'section', title: 'Section', collapsed: false,
      items: [autoPinned], children: [],
    }]);
    let idCalls = 0;
    const createId: DmScreenIdFactory = () => {
      idCalls += 1;
      return `unexpected-${idCalls}`;
    };

    expect(duplicateDmScreenItem(document, 'missing', { createId })).toBe(document);
    expect(duplicateDmScreenItem(document, autoPinned.id, { createId })).toBe(document);
    expect(idCalls).toBe(0);
  });

  it('does not duplicate a panel when the document is at the item limit', () => {
    const items = Array.from(
      { length: DM_SCREEN_MAX_ITEMS },
      (_, index) => note(`item-${index}`),
    );
    const document = screen([{
      id: 'full-section', title: 'Full section', collapsed: false,
      items, children: [],
    }]);
    let idCalls = 0;

    const duplicated = duplicateDmScreenItem(document, items[0].id, {
      createId: () => {
        idCalls += 1;
        return 'should-not-be-used';
      },
    });

    expect(duplicated).toBe(document);
    expect(idCalls).toBe(0);
  });

  it('syncs auto-pins without duplicating global IDs and preserves their view state', () => {
    const initial = screen([{
      id: 'setup',
      title: 'Setup',
      collapsed: false,
      items: [note('auto-pinned')],
      children: [{
        id: 'auto-monster-goblin',
        title: 'Unrelated section',
        collapsed: false,
        items: [],
        children: [],
      }],
    }], 'screen-pins');

    let synced = syncPinnedItems(
      initial,
      ['goblin'],
      ['shield'],
      () => 'Goblin',
      () => 'Shield',
    );
    expect(synced.sections[0].id).toBe('auto-pinned-2');
    expect(synced.sections[0].items.map((item) => item.id)).toEqual([
      'auto-monster-goblin-2',
      'auto-spell-shield',
    ]);
    expect(isDmScreenState(synced)).toBe(true);

    const pinnedSection = synced.sections[0];
    const goblinId = pinnedSection.items[0].id;
    synced = {
      ...synced,
      sections: [{
        ...pinnedSection,
        items: pinnedSection.items.map((item) => item.id === goblinId
          ? {
              ...item,
              collapsed: false,
              layout: layout({ width: 'wide', stashed: true, excludedFromPrint: true }),
            }
          : item),
      }, ...synced.sections.slice(1)],
    };
    synced = syncPinnedItems(
      synced,
      ['goblin'],
      ['shield', 'light'],
      () => 'Goblin',
      (id) => id === 'shield' ? 'Shield' : 'Light',
    );

    expect(synced.sections[0].id).toBe('auto-pinned-2');
    expect(synced.sections[0].items.map((item) => item.title)).toEqual(['Goblin', 'Shield', 'Light']);
    expect(synced.sections[0].items[0]).toMatchObject({
      id: goblinId,
      collapsed: false,
      layout: { width: 'wide', stashed: true, excludedFromPrint: true },
    });
    expect(isDmScreenState(synced)).toBe(true);
  });

  it('does not duplicate a restored manual resource panel from the auto-pinned section', () => {
    const restored = screen([{
      id: 'auto-pinned',
      title: 'Pinned references',
      collapsed: false,
      items: [{
        id: 'restored-goblin',
        kind: 'monster',
        title: 'Goblin',
        resourceId: 'goblin',
        collapsed: true,
        layout: layout({ stashed: true }),
        origin: 'manual',
      }],
      children: [],
    }]);

    const synced = syncPinnedItems(restored, ['goblin'], [], () => 'Goblin', () => undefined);

    expect(synced.sections[0].items).toHaveLength(1);
    expect(synced.sections[0].items[0]).toMatchObject({
      id: 'restored-goblin',
      origin: 'manual',
      layout: { stashed: true },
    });
  });

  it('includes stashed content but omits print-excluded content from Markdown', () => {
    const document = screen([{
      id: 'run', title: 'Run', collapsed: true, children: [], items: [
        note('note', {
          title: 'Reminder',
          body: 'Use cover.',
          collapsed: true,
          layout: layout({ stashed: true }),
        }),
        note('private-note', {
          title: 'Do not export this',
          body: 'Secret outcome.',
          layout: layout({ excludedFromPrint: true }),
        }),
        {
          id: 'battle',
          kind: 'battle',
          title: 'Fight',
          collapsed: true,
          layout: layout({ width: 'full' }),
        },
      ],
    }]);
    const markdown = dmScreenToMarkdown(document, new Map(), new Map(), EMPTY_BATTLE);
    expect(markdown).toContain('Reminder _(stashed)_');
    expect(markdown).toContain('Use cover.');
    expect(markdown).not.toContain('Do not export this');
    expect(markdown).not.toContain('Secret outcome.');
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

  it('retains one isolated party snapshot for party panels and Markdown export', () => {
    const document = screen([{
      id: 'party-section', title: 'Party', collapsed: false, children: [],
      items: [{
        id: 'party-overview', kind: 'party', title: 'Party overview',
        collapsed: false, layout: layout({ width: 'wide' }),
      }],
    }]);
    const summary = {
      id: 'party-lanterns',
      name: 'The Lanterns',
      memberCount: 1,
      levelRange: { min: 5, max: 5 },
      members: [{
        id: 'member-aria', name: 'Aria', playerName: 'Dana',
        classLabel: 'Champion | Fighter', level: 5, armorClass: 19,
        initiativeBonus: 7, passivePerception: 16,
        notes: 'Carries the moon key.\nKeep private.',
      }],
    };

    const snapshotted = syncDmPartySnapshot(document, summary);
    expect(isDmScreenState(snapshotted)).toBe(true);
    expect(snapshotted.partySnapshot).toEqual(summary);
    expect(snapshotted.partySnapshot).not.toBe(summary);
    expect(snapshotted.partySnapshot?.members).not.toBe(summary.members);

    summary.members[0].name = 'Changed later';
    expect(snapshotted.partySnapshot?.members[0].name).toBe('Aria');

    const markdown = dmScreenToMarkdown(snapshotted, new Map(), new Map(), EMPTY_BATTLE);
    expect(markdown).toContain('### Party overview');
    expect(markdown).toContain('**The Lanterns** — 1 hero');
    expect(markdown).toContain('Champion \\| Fighter');
    expect(markdown).toContain('Carries the moon key.<br>Keep private.');

    expect(syncDmPartySnapshot(snapshotted, null).partySnapshot).toBeUndefined();

    const removedPartyItem = {
      ...snapshotted,
      sections: [{ ...snapshotted.sections[0], items: [] }],
    };
    expect(syncDmPartySnapshot(removedPartyItem, null).partySnapshot).toBeUndefined();
  });

  it('migrates nested v1 content exactly and repairs blank or duplicate IDs', () => {
    const legacy = {
      version: 1,
      title: 'Night at the Silver Keep',
      autoAddPinnedMonsters: false,
      autoAddPinnedSpells: true,
      sections: [{
        id: 'shared-id',
        title: 'Outer section',
        collapsed: true,
        items: [{
          id: 'shared-id',
          kind: 'monster',
          title: 'Pinned Goblin',
          body: 'Preserve this exact body.',
          resourceId: 'goblin',
          href: 'mailto:dm@example.test',
          collapsed: true,
          hidden: true,
          origin: 'auto-pin',
        }],
        children: [{
          id: 'shared-id',
          title: 'Nested section',
          collapsed: false,
          items: [{
            id: '',
            kind: 'spell',
            title: 'Shield',
            resourceId: 'shield',
            collapsed: false,
            hidden: false,
            origin: 'manual',
          }],
          children: [],
        }],
      }],
    };

    const parsed = parseDmScreenDocument(legacy, {
      createId: ids('screen-migrated', 'item-remapped', 'section-remapped', 'blank-item-remapped'),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.migrated).toBe(true);
    expect(parsed.document).toMatchObject({
      version: 2,
      id: 'screen-migrated',
      revision: 0,
      title: legacy.title,
      autoAddPinnedMonsters: false,
      autoAddPinnedSpells: true,
      layout: { columns: 'auto', density: 'comfortable' },
      sections: [{
        id: 'shared-id',
        title: 'Outer section',
        collapsed: true,
        items: [{
          id: 'item-remapped',
          title: 'Pinned Goblin',
          body: 'Preserve this exact body.',
          resourceId: 'goblin',
          href: 'mailto:dm@example.test',
          collapsed: true,
          origin: 'auto-pin',
          layout: { width: 'full', stashed: true, excludedFromPrint: false },
        }],
        children: [{
          id: 'section-remapped',
          title: 'Nested section',
          collapsed: false,
          items: [{
            id: 'blank-item-remapped',
            resourceId: 'shield',
            origin: 'manual',
            layout: { width: 'full', stashed: false, excludedFromPrint: false },
          }],
        }],
      }],
    });
    expect(parsed.warnings.join(' ')).toContain('Reassigned 3');
    expect(isDmScreenState(parsed.document)).toBe(true);
  });

  it('rejects invalid and future documents with field paths', () => {
    const invalid = cloneDmScreenDocument(EMPTY_DM_SCREEN);
    invalid.sections[0].items[0].id = invalid.sections[0].id;
    invalid.sections[0].items[0].href = 'javascript:alert(1)';
    invalid.layout.columns = 1 as 2;
    const parsedInvalid = parseDmScreenDocument(invalid);
    expect(parsedInvalid).toMatchObject({ ok: false, reason: 'invalid' });
    if (!parsedInvalid.ok) {
      expect(parsedInvalid.issues.map((entry) => entry.path)).toEqual(expect.arrayContaining([
        '$.layout.columns',
        '$.sections[0].items[0].id',
        '$.sections[0].items[0].href',
      ]));
    }

    const parsedFuture = parseDmScreenDocument({ version: 99 });
    expect(parsedFuture).toMatchObject({
      ok: false,
      reason: 'future-version',
      issues: [{ path: '$.version' }],
    });

    const unsafeLegacy = parseDmScreenDocument({
      version: 1,
      title: 'Unsafe legacy link',
      autoAddPinnedMonsters: false,
      autoAddPinnedSpells: false,
      sections: [{
        id: 'section', title: 'Links', collapsed: false, children: [],
        items: [{
          id: 'tool', kind: 'tool', title: 'Bad link', href: 'javascript:alert(1)',
          collapsed: false, hidden: false,
        }],
      }],
    });
    expect(unsafeLegacy).toMatchObject({ ok: false, reason: 'invalid' });
    if (!unsafeLegacy.ok) {
      expect(unsafeLegacy.issues).toContainEqual({
        path: '$.sections[0].items[0].href',
        message: 'must use an internal, http(s), mailto, or tel link',
      });
    }
  });

  it('strips unknown transient workspace properties from parsed v2 documents', () => {
    const source = cloneDmScreenDocument(EMPTY_DM_SCREEN) as DmScreenState & {
      focusedItemId?: string;
      fullscreen?: boolean;
    };
    source.focusedItemId = source.sections[0].items[0].id;
    source.fullscreen = true;
    const item = source.sections[0].items[0] as DmScreenItem & { spotlighted?: boolean };
    item.spotlighted = true;
    const screenLayout = source.layout as DmScreenState['layout'] & { fullscreen?: boolean };
    screenLayout.fullscreen = true;
    const itemLayout = item.layout as DmScreenItem['layout'] & { spotlighted?: boolean };
    itemLayout.spotlighted = true;
    const section = source.sections[0] as DmScreenSection & { trayOpen?: boolean };
    section.trayOpen = true;

    const parsed = parseDmScreenDocument(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.document).not.toHaveProperty('focusedItemId');
    expect(parsed.document).not.toHaveProperty('fullscreen');
    expect(parsed.document.layout).not.toHaveProperty('fullscreen');
    expect(parsed.document.sections[0]).not.toHaveProperty('trayOpen');
    expect(parsed.document.sections[0].items[0]).not.toHaveProperty('spotlighted');
    expect(parsed.document.sections[0].items[0].layout).not.toHaveProperty('spotlighted');
  });

  it('merges content collision-safely while preserving current screen identity and order', () => {
    const current = screen([{
      id: 'section-a', title: 'Current A', collapsed: false,
      items: [note('item-a')], children: [],
    }, {
      id: 'section-b', title: 'Current B', collapsed: false,
      items: [note('item-b')], children: [],
    }], 'screen-current');
    const incoming = screen([{
      id: 'section-a', title: 'Imported A', collapsed: true,
      items: [note('item-a', { body: 'Imported body A' })], children: [],
    }, {
      id: 'section-b', title: 'Imported B', collapsed: false,
      items: [note('item-b', { resourceId: 'copied-resource' })], children: [],
    }], 'screen-incoming');

    const merged = mergeDmScreenDocuments(current, incoming, {
      createId: ids('merge-1', 'merge-2', 'merge-3', 'merge-4'),
    });
    expect(merged.sectionIdRemaps).toEqual([
      { from: 'section-a', to: 'merge-1' },
      { from: 'section-b', to: 'merge-2' },
    ]);
    expect(merged.itemIdRemaps).toEqual([
      { from: 'item-a', to: 'merge-3' },
      { from: 'item-b', to: 'merge-4' },
    ]);
    expect(merged.document.id).toBe('screen-current');
    expect(merged.document.sections.map((section) => section.title)).toEqual([
      'Current A', 'Current B', 'Imported A', 'Imported B',
    ]);
    expect(merged.document.sections[2]).toMatchObject({
      id: 'merge-1',
      collapsed: true,
      items: [{ id: 'merge-3', body: 'Imported body A' }],
    });
    expect(merged.document.sections[3].items[0]).toMatchObject({
      id: 'merge-4',
      resourceId: 'copied-resource',
    });
    expect(isDmScreenState(merged.document)).toBe(true);
  });
});
