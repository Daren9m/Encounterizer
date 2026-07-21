import { battleToMarkdown, type BattleState } from './battle-organizer';
import { monsterToMarkdown } from './monster-export';
import type { Monster } from './types';
import type { Spell } from '../data/spells';
import { rulesReferenceToMarkdown } from '../data/rules-reference';
import type { DmPartySummary } from './party-adapters';

export type DmScreenItemKind = 'note' | 'monster' | 'spell' | 'tool' | 'rules' | 'party' | 'initiative' | 'battle';

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
  /** Last rendered party summary, retained for print/export and storage outages. */
  partySnapshot?: DmPartySummary;
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

function clonePartySummary(summary: DmPartySummary): DmPartySummary {
  return {
    ...summary,
    levelRange: summary.levelRange ? { ...summary.levelRange } : null,
    members: summary.members.map((member) => ({ ...member })),
  };
}

export function hasDmPartyItem(sections: readonly DmScreenSection[]): boolean {
  return sections.some((section) => (
    section.items.some((item) => item.kind === 'party')
    || hasDmPartyItem(section.children)
  ));
}

/** Keep one screen-level snapshot rather than duplicating private notes per item. */
export function syncDmPartySnapshot(
  state: DmScreenState,
  summary: DmPartySummary | null,
): DmScreenState {
  if (!hasDmPartyItem(state.sections)) {
    if (state.partySnapshot === undefined) return state;
    const withoutSnapshot = { ...state };
    delete withoutSnapshot.partySnapshot;
    return withoutSnapshot;
  }
  if (!summary) {
    if (state.partySnapshot === undefined) return state;
    const withoutSnapshot = { ...state };
    delete withoutSnapshot.partySnapshot;
    return withoutSnapshot;
  }
  const snapshot = clonePartySummary(summary);
  return JSON.stringify(state.partySnapshot) === JSON.stringify(snapshot)
    ? state
    : { ...state, partySnapshot: snapshot };
}

function markdownCell(value: string | number | undefined): string {
  if (value === undefined || value === '') return '—';
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function partyMarkdown(summary: DmPartySummary | undefined): string[] {
  if (!summary) return ['_Party snapshot unavailable_', ''];
  return [
    `**${summary.name}** — ${summary.memberCount} ${summary.memberCount === 1 ? 'hero' : 'heroes'}`,
    '',
    '| Hero | Level / class | AC | Initiative | Passive Perception | Notes |',
    '| --- | --- | ---: | ---: | ---: | --- |',
    ...summary.members.map((member) => (
      `| ${markdownCell(member.name)} | ${markdownCell(`Level ${member.level} · ${member.classLabel}`)} | ${member.armorClass} | ${markdownCell(member.initiativeBonus === undefined ? undefined : member.initiativeBonus >= 0 ? `+${member.initiativeBonus}` : member.initiativeBonus)} | ${markdownCell(member.passivePerception)} | ${markdownCell(member.notes)} |`
    )),
    '',
  ];
}

function itemMarkdown(
  item: DmScreenItem,
  monsters: ReadonlyMap<string, Monster>,
  spells: ReadonlyMap<string, Spell>,
  battle: BattleState,
  party: DmPartySummary | undefined,
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
  if (item.kind === 'party') {
    return [`### ${item.title}${visibility}`, '', ...partyMarkdown(party)];
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
      for (const item of section.items) {
        lines.push(...itemMarkdown(item, monsters, spells, battle, state.partySnapshot));
      }
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
    && (state.partySnapshot === undefined || isDmPartySummary(state.partySnapshot))
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
    && ['note', 'monster', 'spell', 'tool', 'rules', 'party', 'initiative', 'battle'].includes(item.kind ?? '')
    && typeof item.collapsed === 'boolean'
    && typeof item.hidden === 'boolean';
}

function optionalText(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isDmPartySummary(value: unknown): value is DmPartySummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as Partial<DmPartySummary>;
  if (typeof summary.id !== 'string'
    || typeof summary.name !== 'string'
    || !Number.isInteger(summary.memberCount)
    || !Array.isArray(summary.members)
    || summary.memberCount !== summary.members.length
    || !(summary.levelRange === null
      || (typeof summary.levelRange === 'object'
        && summary.levelRange !== null
        && Number.isInteger(summary.levelRange.min)
        && Number.isInteger(summary.levelRange.max)))
  ) return false;
  return summary.members.every((member) => (
    typeof member.id === 'string'
    && typeof member.name === 'string'
    && typeof member.classLabel === 'string'
    && Number.isInteger(member.level)
    && Number.isInteger(member.armorClass)
    && (member.initiativeBonus === undefined || Number.isInteger(member.initiativeBonus))
    && (member.passivePerception === undefined || Number.isInteger(member.passivePerception))
    && optionalText(member.playerName)
    && optionalText(member.notes)
  ));
}
