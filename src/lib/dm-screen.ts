import { battleToMarkdown, type BattleState } from './battle-organizer';
import { monsterToMarkdown } from './monster-export';
import type { Monster } from './types';
import type { Spell } from '../data/spells';
import { rulesReferenceToMarkdown } from '../data/rules-reference';

export type DmScreenItemKind = 'note' | 'monster' | 'spell' | 'tool' | 'rules' | 'initiative' | 'battle';

export interface DmScreenItem {
  id: string;
  kind: DmScreenItemKind;
  title: string;
  body?: string;
  resourceId?: string;
  href?: string;
  collapsed: boolean;
  hidden: boolean;
  origin?: 'manual' | 'auto-pin';
}

export interface DmScreenSection {
  id: string;
  title: string;
  collapsed: boolean;
  items: DmScreenItem[];
  children: DmScreenSection[];
}

export interface DmScreenState {
  version: 1;
  title: string;
  autoAddPinnedMonsters: boolean;
  autoAddPinnedSpells: boolean;
  sections: DmScreenSection[];
}

export const EMPTY_DM_SCREEN: DmScreenState = {
  version: 1,
  title: 'Tonight’s DM Screen',
  autoAddPinnedMonsters: true,
  autoAddPinnedSpells: true,
  sections: [{
    id: 'quick-reference',
    title: 'Quick Reference',
    collapsed: false,
    items: [{
      id: 'core-rules-reference',
      kind: 'rules',
      title: 'Table Rules Reference',
      collapsed: false,
      hidden: false,
      origin: 'manual',
    }],
    children: [],
  }],
};

export function updateSectionTree(
  sections: DmScreenSection[],
  sectionId: string,
  update: (section: DmScreenSection) => DmScreenSection,
): DmScreenSection[] {
  return sections.map((section) => section.id === sectionId
    ? update(section)
    : { ...section, children: updateSectionTree(section.children, sectionId, update) });
}

export function removeSectionTree(sections: DmScreenSection[], sectionId: string): DmScreenSection[] {
  return sections
    .filter((section) => section.id !== sectionId)
    .map((section) => ({ ...section, children: removeSectionTree(section.children, sectionId) }));
}

export function syncPinnedItems(
  state: DmScreenState,
  pinnedMonsterIds: readonly string[],
  pinnedSpellIds: readonly string[],
  monsterName: (id: string) => string | undefined,
  spellName: (id: string) => string | undefined,
): DmScreenState {
  const pinnedSection = state.sections.find((section) => section.id === 'auto-pinned');
  const existingAutoItems = new Map(
    (pinnedSection?.items ?? [])
      .filter((item) => item.origin === 'auto-pin' && item.resourceId)
      .map((item) => [`${item.kind}:${item.resourceId}`, item]),
  );
  const wanted = new Map<string, DmScreenItem>();
  if (state.autoAddPinnedMonsters) {
    for (const id of pinnedMonsterIds) {
      const title = monsterName(id);
      if (title) wanted.set(`monster:${id}`, {
        ...existingAutoItems.get(`monster:${id}`),
        id: `auto-monster-${id}`,
        kind: 'monster', title, resourceId: id, collapsed: true, hidden: false, origin: 'auto-pin',
        ...(existingAutoItems.has(`monster:${id}`) ? {
          collapsed: existingAutoItems.get(`monster:${id}`)!.collapsed,
          hidden: existingAutoItems.get(`monster:${id}`)!.hidden,
        } : {}),
      });
    }
  }
  if (state.autoAddPinnedSpells) {
    for (const id of pinnedSpellIds) {
      const title = spellName(id);
      if (title) wanted.set(`spell:${id}`, {
        ...existingAutoItems.get(`spell:${id}`),
        id: `auto-spell-${id}`,
        kind: 'spell', title, resourceId: id, collapsed: true, hidden: false, origin: 'auto-pin',
        ...(existingAutoItems.has(`spell:${id}`) ? {
          collapsed: existingAutoItems.get(`spell:${id}`)!.collapsed,
          hidden: existingAutoItems.get(`spell:${id}`)!.hidden,
        } : {}),
      });
    }
  }
  const manualItems = (pinnedSection?.items ?? []).filter((item) => item.origin !== 'auto-pin');
  const autoItems = [...wanted.values()];
  if (!pinnedSection && autoItems.length === 0) return state;
  if (!pinnedSection) {
    return { ...state, sections: [{
      id: 'auto-pinned', title: 'Pinned references', collapsed: false,
      items: autoItems, children: [],
    }, ...state.sections] };
  }
  return {
    ...state,
    sections: updateSectionTree(state.sections, 'auto-pinned', (section) => ({
      ...section,
      items: [...manualItems, ...autoItems],
    })),
  };
}

function itemMarkdown(
  item: DmScreenItem,
  monsters: ReadonlyMap<string, Monster>,
  spells: ReadonlyMap<string, Spell>,
  battle: BattleState,
): string[] {
  const visibility = item.hidden ? ' _(hidden)_' : '';
  if (item.kind === 'monster') {
    const monster = item.resourceId ? monsters.get(item.resourceId) : undefined;
    return [`### ${item.title}${visibility}`, '', monster
      ? nestedMarkdown(monsterToMarkdown(monster))
      : '_Resource unavailable_', ''];
  }
  if (item.kind === 'spell') {
    const spell = item.resourceId ? spells.get(item.resourceId) : undefined;
    return [`### ${item.title}${visibility}`, '', spell
      ? `**Level ${spell.level} ${spell.school}**  \n${spell.castingTime} · ${spell.range} · ${spell.duration}\n\n${spell.effectSummary}\n\n${spell.description}`
      : '_Resource unavailable_', ''];
  }
  if (item.kind === 'initiative' || item.kind === 'battle') {
    return [`### ${item.title}${visibility}`, '', nestedMarkdown(battleToMarkdown(battle)), ''];
  }
  if (item.kind === 'rules') {
    return [`### ${item.title}${visibility}`, '', nestedMarkdown(rulesReferenceToMarkdown()), ''];
  }
  if (item.kind === 'tool') return [`### ${item.title}${visibility}`, '', item.href ?? '', ''];
  return [`### ${item.title}${visibility}`, '', item.body ?? '', ''];
}

function nestedMarkdown(markdown: string): string {
  return markdown.trim().replace(/^(#{1,6}) /gm, (_match, hashes: string) =>
    `${'#'.repeat(Math.min(6, hashes.length + 3))} `);
}

export function dmScreenToMarkdown(
  state: DmScreenState,
  monsters: ReadonlyMap<string, Monster>,
  spells: ReadonlyMap<string, Spell>,
  battle: BattleState,
): string {
  const lines = [`# ${state.title}`, ''];
  const walk = (sections: DmScreenSection[], depth: number) => {
    for (const section of sections) {
      lines.push(`${'#'.repeat(Math.min(depth + 1, 6))} ${section.title}`, '');
      for (const item of section.items) lines.push(...itemMarkdown(item, monsters, spells, battle));
      walk(section.children, depth + 1);
    }
  };
  walk(state.sections, 1);
  return lines.join('\n').trimEnd();
}

export function isDmScreenState(value: unknown): value is DmScreenState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<DmScreenState>;
  return state.version === 1
    && typeof state.title === 'string'
    && typeof state.autoAddPinnedMonsters === 'boolean'
    && typeof state.autoAddPinnedSpells === 'boolean'
    && Array.isArray(state.sections)
    && state.sections.every(isSection);
}

function isSection(value: unknown): value is DmScreenSection {
  if (!value || typeof value !== 'object') return false;
  const section = value as Partial<DmScreenSection>;
  return typeof section.id === 'string'
    && typeof section.title === 'string'
    && typeof section.collapsed === 'boolean'
    && Array.isArray(section.items)
    && section.items.every(isItem)
    && Array.isArray(section.children)
    && section.children.every(isSection);
}

function isItem(value: unknown): value is DmScreenItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<DmScreenItem>;
  return typeof item.id === 'string'
    && typeof item.title === 'string'
    && ['note', 'monster', 'spell', 'tool', 'rules', 'initiative', 'battle'].includes(item.kind ?? '')
    && typeof item.collapsed === 'boolean'
    && typeof item.hidden === 'boolean';
}
