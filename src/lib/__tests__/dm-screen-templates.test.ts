import { describe, expect, it } from 'vitest';
import {
  cloneDmScreenDocument,
  EMPTY_DM_SCREEN,
  isDmScreenState,
  type DmScreenIdFactory,
  type DmScreenSection,
  type DmScreenState,
} from '@/lib/dm-screen';
import {
  BUILT_IN_DM_SCREEN_TEMPLATE_IDS,
  DM_SCREEN_TEMPLATES,
  addDmScreenTemplate,
  createDmScreenFromTemplate,
  getDmScreenTemplate,
  type DmScreenTemplateDefinition,
} from '@/lib/dm-screen-templates';

function sequentialIds(prefix: string): DmScreenIdFactory {
  let index = 0;
  return (kind) => `${prefix}-${kind}-${++index}`;
}

function collectIds(document: DmScreenState): string[] {
  const ids = [document.id];
  const walk = (sections: readonly DmScreenSection[]) => {
    for (const section of sections) {
      ids.push(section.id, ...section.items.map((item) => item.id));
      walk(section.children);
    }
  };
  walk(document.sections);
  return ids;
}

describe('DM Screen templates', () => {
  it('publishes the four built-ins in a stable chooser order', () => {
    expect(BUILT_IN_DM_SCREEN_TEMPLATE_IDS).toEqual([
      'quick-start',
      'combat-night',
      'story-exploration',
      'blank',
    ]);
    expect(DM_SCREEN_TEMPLATES.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'quick-start', name: 'Quick Start' },
      { id: 'combat-night', name: 'Combat Night' },
      { id: 'story-exploration', name: 'Story & Exploration' },
      { id: 'blank', name: 'Blank Screen' },
    ]);
  });

  it.each(BUILT_IN_DM_SCREEN_TEMPLATE_IDS)('creates a valid v2 %s document', (templateId) => {
    const document = createDmScreenFromTemplate(templateId, {
      createId: sequentialIds(templateId),
    });

    expect(document.version).toBe(2);
    expect(document.revision).toBe(0);
    expect(isDmScreenState(document)).toBe(true);
    expect(new Set(collectIds(document)).size).toBe(collectIds(document).length);
  });

  it('includes the promised panels and deliberate layout hints', () => {
    const quickStart = createDmScreenFromTemplate('quick-start', {
      createId: sequentialIds('quick'),
    });
    expect(quickStart.sections.flatMap((section) => section.items.map((item) => item.kind))).toEqual([
      'party', 'initiative', 'note', 'rules',
    ]);

    const combat = createDmScreenFromTemplate('combat-night', {
      createId: sequentialIds('combat'),
    });
    const combatItems = combat.sections.flatMap((section) => section.items);
    expect(combat.layout.density).toBe('compact');
    expect(combatItems.map((item) => item.title)).toEqual([
      'Initiative & Rounds',
      'Party Status',
      'Monsters',
      'Conditions & Combat Rules',
      'Combat Notes',
    ]);
    expect(combatItems[0]).toMatchObject({ kind: 'initiative', layout: { width: 'wide' } });

    const story = createDmScreenFromTemplate('story-exploration', {
      createId: sequentialIds('story'),
    });
    expect(story.sections.flatMap((section) => section.items.map((item) => item.title))).toEqual([
      'Scene Notes', 'Clues & Discoveries', 'NPC Reminders', 'Party Overview', 'Common Checks',
    ]);

    const blank = createDmScreenFromTemplate('blank', {
      createId: sequentialIds('blank'),
    });
    expect(blank).toMatchObject({
      sections: [],
      autoAddPinnedMonsters: false,
      autoAddPinnedSpells: false,
    });
  });

  it('returns fresh documents, objects, and IDs for every invocation', () => {
    const first = createDmScreenFromTemplate('quick-start');
    const second = createDmScreenFromTemplate('quick-start');
    const firstIds = new Set(collectIds(first));
    const secondIds = collectIds(second);

    expect(secondIds.every((id) => !firstIds.has(id))).toBe(true);
    expect(second).not.toBe(first);
    expect(second.sections[0]).not.toBe(first.sections[0]);
    expect(second.sections[0].items[0]).not.toBe(first.sections[0].items[0]);

    first.sections[0].title = 'Changed locally';
    first.sections[0].items[0].title = 'Also changed';
    expect(second.sections[0].title).toBe('Session Control');
    expect(second.sections[0].items[0].title).toBe('Party Overview');
  });

  it('appends template sections in stable order and deterministically remaps collisions', () => {
    const current = cloneDmScreenDocument(EMPTY_DM_SCREEN);
    current.id = 'current-screen';
    current.sections = [{
      id: 'shared-section',
      title: 'Existing notes',
      collapsed: false,
      items: [],
      children: [],
    }];

    const allocated = [
      'incoming-screen',
      'shared-section',
      'scene-note',
      'clue-note',
      'npc-note',
      'glance-section',
      'party-item',
      'checks-item',
      'remapped-scene-section',
    ];
    let index = 0;
    const result = addDmScreenTemplate(current, 'story-exploration', {
      createId: () => allocated[index++],
    });

    expect(result.document.sections.map((section) => section.title)).toEqual([
      'Existing notes',
      'Current Scene',
      'At a Glance',
    ]);
    expect(result.document.sections[0]).toEqual(current.sections[0]);
    expect(result.document.sections[0]).not.toBe(current.sections[0]);
    expect(result.document.sections[1].items.map((item) => item.title)).toEqual([
      'Scene Notes', 'Clues & Discoveries', 'NPC Reminders',
    ]);
    expect(result.sectionIdRemaps).toEqual([
      { from: 'shared-section', to: 'remapped-scene-section' },
    ]);
    expect(result.itemIdRemaps).toEqual([]);
    expect(isDmScreenState(result.document)).toBe(true);
  });

  it('accepts an external template definition and rejects invalid or unknown templates', () => {
    const external: DmScreenTemplateDefinition = {
      id: 'campaign-custom',
      name: 'Campaign Custom',
      description: 'A future user-saved template.',
      contents: [],
      create: ({ createId = sequentialIds('external') } = {}) => ({
        ...cloneDmScreenDocument(EMPTY_DM_SCREEN),
        id: createId('screen'),
        sections: [],
      }),
    };

    expect(createDmScreenFromTemplate(external).title).toBe('Tonight’s DM Screen');
    expect(getDmScreenTemplate('missing')).toBeUndefined();
    expect(() => createDmScreenFromTemplate('missing')).toThrow(/Unknown DM Screen template/);

    const invalid: DmScreenTemplateDefinition = {
      ...external,
      id: 'invalid',
      create: () => ({ ...cloneDmScreenDocument(EMPTY_DM_SCREEN), id: '' }),
    };
    expect(() => createDmScreenFromTemplate(invalid)).toThrow(/produced an invalid document/);
  });
});
