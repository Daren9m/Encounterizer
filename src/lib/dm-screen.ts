import { battleToMarkdown, type BattleState } from './battle-organizer';
import { monsterToMarkdown } from './monster-export';
import type { Monster } from './types';
import type { Spell } from '../data/spells';
import { rulesReferenceToMarkdown } from '../data/rules-reference';
import type { DmPartySummary } from './party-adapters';

export type DmScreenItemKind = 'note' | 'monster' | 'spell' | 'tool' | 'rules' | 'party' | 'initiative' | 'battle';

export const DM_SCREEN_DOCUMENT_VERSION = 2 as const;
export const DM_SCREEN_MAX_DEPTH = 12;
export const DM_SCREEN_MAX_SECTIONS = 200;
export const DM_SCREEN_MAX_ITEMS = 1_000;

const MAX_ID_LENGTH = 200;
const MAX_TITLE_LENGTH = 240;
const MAX_BODY_LENGTH = 200_000;
const MAX_HREF_LENGTH = 2_048;
export type DmScreenIdKind = 'screen' | 'section' | 'item';
export type DmScreenIdFactory = (kind: DmScreenIdKind) => string;
export type DmScreenPanelWidth = 'compact' | 'standard' | 'wide' | 'full';
export type DmScreenColumns = 'auto' | 2 | 3 | 4;
export type DmScreenDensity = 'comfortable' | 'compact';

export interface DmScreenLayout {
  columns: DmScreenColumns;
  density: DmScreenDensity;
}

export interface DmScreenItemLayout {
  width: DmScreenPanelWidth;
  stashed: boolean;
  excludedFromPrint: boolean;
}

export interface DmScreenItem {
  id: string;
  kind: DmScreenItemKind;
  title: string;
  body?: string;
  resourceId?: string;
  href?: string;
  collapsed: boolean;
  layout: DmScreenItemLayout;
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
  version: 2;
  id: string;
  revision: number;
  title: string;
  autoAddPinnedMonsters: boolean;
  autoAddPinnedSpells: boolean;
  layout: DmScreenLayout;
  /** Last rendered party summary, retained for print/export and storage outages. */
  partySnapshot?: DmPartySummary;
  sections: DmScreenSection[];
}

export interface DmScreenValidationIssue {
  path: string;
  message: string;
}

export type DmScreenDocumentReadResult =
  | {
      ok: true;
      document: DmScreenState;
      migrated: boolean;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'invalid' | 'future-version';
      message: string;
      issues: DmScreenValidationIssue[];
    };

export interface DmScreenIdRemap {
  from: string;
  to: string;
}

export interface DmScreenMergeResult {
  document: DmScreenState;
  sectionIdRemaps: DmScreenIdRemap[];
  itemIdRemaps: DmScreenIdRemap[];
}

function defaultId(kind: DmScreenIdKind): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${suffix}`;
}

export function createEmptyDmScreen(
  options: { createId?: DmScreenIdFactory } = {},
): DmScreenState {
  const createId = options.createId ?? defaultId;
  return {
    version: DM_SCREEN_DOCUMENT_VERSION,
    id: createId('screen'),
    revision: 0,
    title: 'Tonight’s DM Screen',
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: true,
    layout: { columns: 'auto', density: 'comfortable' },
    sections: [{
      id: createId('section'),
      title: 'Quick Reference',
      collapsed: false,
      items: [{
        id: createId('item'),
        kind: 'rules',
        title: 'Table Rules Reference',
        collapsed: false,
        layout: { width: 'full', stashed: false, excludedFromPrint: false },
        origin: 'manual',
      }],
      children: [],
    }],
  };
}

export const EMPTY_DM_SCREEN: DmScreenState = createEmptyDmScreen({
  createId: (kind) => kind === 'screen'
    ? 'default-dm-screen'
    : kind === 'section'
      ? 'quick-reference'
      : 'core-rules-reference',
});

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

function collectScreenNodeIds(
  sections: readonly DmScreenSection[],
  ids: Set<string>,
): void {
  for (const section of sections) {
    ids.add(section.id);
    for (const item of section.items) ids.add(item.id);
    collectScreenNodeIds(section.children, ids);
  }
}

function allocatePinnedId(preferred: string, used: Set<string>): string {
  const base = preferred.slice(0, MAX_ID_LENGTH);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const marker = `-${suffix}`;
    const candidate = `${base.slice(0, MAX_ID_LENGTH - marker.length)}${marker}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return allocateId(undefined, 'item', used, defaultId);
}

export function syncPinnedItems(
  state: DmScreenState,
  pinnedMonsterIds: readonly string[],
  pinnedSpellIds: readonly string[],
  monsterName: (id: string) => string | undefined,
  spellName: (id: string) => string | undefined,
): DmScreenState {
  const pinnedSection = state.sections.find((section) => section.id === 'auto-pinned')
    ?? state.sections.find((section) => (
      /^auto-pinned-\d+$/.test(section.id)
      && section.title === 'Pinned references'
    ));
  const existingAutoItems = new Map(
    (pinnedSection?.items ?? [])
      .filter((item) => item.origin === 'auto-pin' && item.resourceId)
      .map((item) => [`${item.kind}:${item.resourceId}`, item]),
  );
  const manualItems = (pinnedSection?.items ?? []).filter((item) => item.origin !== 'auto-pin');
  const manualResourceKeys = new Set(manualItems
    .filter((item) => item.resourceId && (item.kind === 'monster' || item.kind === 'spell'))
    .map((item) => `${item.kind}:${item.resourceId}`));
  const usedIds = new Set<string>([state.id]);
  collectScreenNodeIds(state.sections, usedIds);
  for (const item of existingAutoItems.values()) usedIds.delete(item.id);

  function autoItemId(key: string, preferred: string): string {
    const existing = existingAutoItems.get(key);
    return allocatePinnedId(existing?.id ?? preferred, usedIds);
  }

  const wanted = new Map<string, DmScreenItem>();
  if (state.autoAddPinnedMonsters) {
    for (const id of pinnedMonsterIds) {
      const title = monsterName(id);
      if (manualResourceKeys.has(`monster:${id}`)) continue;
      if (title) wanted.set(`monster:${id}`, {
        ...existingAutoItems.get(`monster:${id}`),
        id: autoItemId(`monster:${id}`, `auto-monster-${id}`),
        kind: 'monster', title, resourceId: id, collapsed: true,
        layout: { width: 'standard', stashed: false, excludedFromPrint: false },
        origin: 'auto-pin',
        ...(existingAutoItems.has(`monster:${id}`) ? {
          collapsed: existingAutoItems.get(`monster:${id}`)!.collapsed,
          layout: { ...existingAutoItems.get(`monster:${id}`)!.layout },
        } : {}),
      });
    }
  }
  if (state.autoAddPinnedSpells) {
    for (const id of pinnedSpellIds) {
      const title = spellName(id);
      if (manualResourceKeys.has(`spell:${id}`)) continue;
      if (title) wanted.set(`spell:${id}`, {
        ...existingAutoItems.get(`spell:${id}`),
        id: autoItemId(`spell:${id}`, `auto-spell-${id}`),
        kind: 'spell', title, resourceId: id, collapsed: true,
        layout: { width: 'standard', stashed: false, excludedFromPrint: false },
        origin: 'auto-pin',
        ...(existingAutoItems.has(`spell:${id}`) ? {
          collapsed: existingAutoItems.get(`spell:${id}`)!.collapsed,
          layout: { ...existingAutoItems.get(`spell:${id}`)!.layout },
        } : {}),
      });
    }
  }
  const autoItems = [...wanted.values()];
  if (!pinnedSection && autoItems.length === 0) return state;
  if (!pinnedSection) {
    const sectionId = allocatePinnedId('auto-pinned', usedIds);
    return { ...state, sections: [{
      id: sectionId, title: 'Pinned references', collapsed: false,
      items: autoItems, children: [],
    }, ...state.sections] };
  }
  return {
    ...state,
    sections: updateSectionTree(state.sections, pinnedSection.id, (section) => ({
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

function cloneSection(section: DmScreenSection): DmScreenSection {
  return {
    id: section.id,
    title: section.title,
    collapsed: section.collapsed,
    items: section.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      collapsed: item.collapsed,
      layout: { ...item.layout },
      ...(item.body !== undefined ? { body: item.body } : {}),
      ...(item.resourceId !== undefined ? { resourceId: item.resourceId } : {}),
      ...(item.href !== undefined ? { href: item.href } : {}),
      ...(item.origin !== undefined ? { origin: item.origin } : {}),
    })),
    children: section.children.map(cloneSection),
  };
}

export function cloneDmScreenDocument(document: DmScreenState): DmScreenState {
  return {
    version: DM_SCREEN_DOCUMENT_VERSION,
    id: document.id,
    revision: document.revision,
    title: document.title,
    autoAddPinnedMonsters: document.autoAddPinnedMonsters,
    autoAddPinnedSpells: document.autoAddPinnedSpells,
    layout: { ...document.layout },
    ...(document.partySnapshot
      ? { partySnapshot: clonePartySummary(document.partySnapshot) }
      : {}),
    sections: document.sections.map(cloneSection),
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
  const visibility = item.layout.stashed ? ' _(stashed)_' : '';
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
        if (item.layout.excludedFromPrint) continue;
        lines.push(...itemMarkdown(item, monsters, spells, battle, state.partySnapshot));
      }
      walk(section.children, depth + 1);
    }
  };
  walk(state.sections, 1);
  return lines.join('\n').trimEnd();
}

interface LegacyDmScreenItem {
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

interface LegacyDmScreenSection {
  id: string;
  title: string;
  collapsed: boolean;
  items: LegacyDmScreenItem[];
  children: LegacyDmScreenSection[];
}

interface LegacyDmScreenState {
  version: 1;
  title: string;
  autoAddPinnedMonsters: boolean;
  autoAddPinnedSpells: boolean;
  partySnapshot?: DmPartySummary;
  sections: LegacyDmScreenSection[];
}

const ITEM_KINDS = new Set<DmScreenItemKind>([
  'note', 'monster', 'spell', 'tool', 'rules', 'party', 'initiative', 'battle',
]);
const PANEL_WIDTHS = new Set<DmScreenPanelWidth>(['compact', 'standard', 'wide', 'full']);
const SCREEN_COLUMNS = new Set<DmScreenColumns>(['auto', 2, 3, 4]);
const SCREEN_DENSITIES = new Set<DmScreenDensity>(['comfortable', 'compact']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, max: number, allowEmpty = true): value is string {
  return typeof value === 'string'
    && value.length <= max
    && (allowEmpty || value.trim().length > 0);
}

function isSafeHref(value: string): boolean {
  const lower = value.toLowerCase();
  return (value.startsWith('/') && !value.startsWith('//'))
    || value.startsWith('#')
    || lower.startsWith('https://')
    || lower.startsWith('http://')
    || lower.startsWith('mailto:')
    || lower.startsWith('tel:');
}

function validationIssues(value: unknown): DmScreenValidationIssue[] {
  const issues: DmScreenValidationIssue[] = [];
  const usedIds = new Map<string, string>();
  let sectionCount = 0;
  let itemCount = 0;

  function issue(path: string, message: string): void {
    issues.push({ path, message });
  }

  function validateId(value: unknown, path: string): void {
    if (!isBoundedText(value, MAX_ID_LENGTH, false)) {
      issue(path, `must be a non-empty string no longer than ${MAX_ID_LENGTH} characters`);
      return;
    }
    const previous = usedIds.get(value);
    if (previous) issue(path, `duplicates ${previous}`);
    else usedIds.set(value, path);
  }

  function validateItem(value: unknown, path: string): void {
    itemCount += 1;
    if (!isRecord(value)) {
      issue(path, 'must be an object');
      return;
    }
    validateId(value.id, `${path}.id`);
    if (!ITEM_KINDS.has(value.kind as DmScreenItemKind)) issue(`${path}.kind`, 'is not a supported item kind');
    if (!isBoundedText(value.title, MAX_TITLE_LENGTH)) issue(`${path}.title`, `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
    if (value.body !== undefined && !isBoundedText(value.body, MAX_BODY_LENGTH)) issue(`${path}.body`, `must be a string no longer than ${MAX_BODY_LENGTH} characters`);
    if (value.resourceId !== undefined && !isBoundedText(value.resourceId, MAX_ID_LENGTH)) issue(`${path}.resourceId`, 'must be a bounded string when present');
    if (value.href !== undefined && (
      !isBoundedText(value.href, MAX_HREF_LENGTH, false)
      || !isSafeHref(value.href)
    )) issue(`${path}.href`, 'must use an internal, http(s), mailto, or tel link');
    if (typeof value.collapsed !== 'boolean') issue(`${path}.collapsed`, 'must be a boolean');
    if (value.origin !== undefined && value.origin !== 'manual' && value.origin !== 'auto-pin') issue(`${path}.origin`, 'must be manual or auto-pin when present');
    if (!isRecord(value.layout)) {
      issue(`${path}.layout`, 'must be an object');
    } else {
      if (!PANEL_WIDTHS.has(value.layout.width as DmScreenPanelWidth)) issue(`${path}.layout.width`, 'must be compact, standard, wide, or full');
      if (typeof value.layout.stashed !== 'boolean') issue(`${path}.layout.stashed`, 'must be a boolean');
      if (typeof value.layout.excludedFromPrint !== 'boolean') issue(`${path}.layout.excludedFromPrint`, 'must be a boolean');
    }
  }

  function validateSection(value: unknown, path: string, depth: number): void {
    sectionCount += 1;
    if (depth > DM_SCREEN_MAX_DEPTH) {
      issue(path, `exceeds the maximum nesting depth of ${DM_SCREEN_MAX_DEPTH}`);
      return;
    }
    if (!isRecord(value)) {
      issue(path, 'must be an object');
      return;
    }
    validateId(value.id, `${path}.id`);
    if (!isBoundedText(value.title, MAX_TITLE_LENGTH)) issue(`${path}.title`, `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
    if (typeof value.collapsed !== 'boolean') issue(`${path}.collapsed`, 'must be a boolean');
    if (!Array.isArray(value.items)) issue(`${path}.items`, 'must be an array');
    else value.items.forEach((item, index) => validateItem(item, `${path}.items[${index}]`));
    if (!Array.isArray(value.children)) issue(`${path}.children`, 'must be an array');
    else value.children.forEach((child, index) => validateSection(child, `${path}.children[${index}]`, depth + 1));
  }

  if (!isRecord(value)) return [{ path: '$', message: 'must be an object' }];
  if (value.version !== DM_SCREEN_DOCUMENT_VERSION) issue('$.version', `must be ${DM_SCREEN_DOCUMENT_VERSION}`);
  validateId(value.id, '$.id');
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) issue('$.revision', 'must be a non-negative safe integer');
  if (!isBoundedText(value.title, MAX_TITLE_LENGTH)) issue('$.title', `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
  if (typeof value.autoAddPinnedMonsters !== 'boolean') issue('$.autoAddPinnedMonsters', 'must be a boolean');
  if (typeof value.autoAddPinnedSpells !== 'boolean') issue('$.autoAddPinnedSpells', 'must be a boolean');
  if (!isRecord(value.layout)) issue('$.layout', 'must be an object');
  else {
    if (!SCREEN_COLUMNS.has(value.layout.columns as DmScreenColumns)) issue('$.layout.columns', 'must be auto, 2, 3, or 4');
    if (!SCREEN_DENSITIES.has(value.layout.density as DmScreenDensity)) issue('$.layout.density', 'must be comfortable or compact');
  }
  if (value.partySnapshot !== undefined && !isDmPartySummary(value.partySnapshot)) issue('$.partySnapshot', 'contains invalid Party summary fields');
  if (!Array.isArray(value.sections)) issue('$.sections', 'must be an array');
  else value.sections.forEach((section, index) => validateSection(section, `$.sections[${index}]`, 1));
  if (sectionCount > DM_SCREEN_MAX_SECTIONS) issue('$.sections', `contains more than ${DM_SCREEN_MAX_SECTIONS} sections`);
  if (itemCount > DM_SCREEN_MAX_ITEMS) issue('$.sections', `contains more than ${DM_SCREEN_MAX_ITEMS} items`);
  return issues;
}

export function isDmScreenState(value: unknown): value is DmScreenState {
  return validationIssues(value).length === 0;
}

function legacyValidationIssues(value: unknown): DmScreenValidationIssue[] {
  const issues: DmScreenValidationIssue[] = [];
  let sectionCount = 0;
  let itemCount = 0;

  function issue(path: string, message: string): void {
    issues.push({ path, message });
  }

  function validateLegacyItem(item: unknown, path: string): void {
    itemCount += 1;
    if (!isRecord(item)) {
      issue(path, 'must be an object');
      return;
    }
    if (!isBoundedText(item.id, MAX_ID_LENGTH)) issue(`${path}.id`, `must be a string no longer than ${MAX_ID_LENGTH} characters`);
    if (!ITEM_KINDS.has(item.kind as DmScreenItemKind)) issue(`${path}.kind`, 'is not a supported item kind');
    if (!isBoundedText(item.title, MAX_TITLE_LENGTH)) issue(`${path}.title`, `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
    if (item.body !== undefined && !isBoundedText(item.body, MAX_BODY_LENGTH)) issue(`${path}.body`, `must be a string no longer than ${MAX_BODY_LENGTH} characters`);
    if (item.resourceId !== undefined && !isBoundedText(item.resourceId, MAX_ID_LENGTH)) issue(`${path}.resourceId`, 'must be a bounded string when present');
    if (item.href !== undefined && (
      !isBoundedText(item.href, MAX_HREF_LENGTH, false)
      || !isSafeHref(item.href)
    )) issue(`${path}.href`, 'must use an internal, http(s), mailto, or tel link');
    if (typeof item.collapsed !== 'boolean') issue(`${path}.collapsed`, 'must be a boolean');
    if (typeof item.hidden !== 'boolean') issue(`${path}.hidden`, 'must be a boolean');
    if (item.origin !== undefined && item.origin !== 'manual' && item.origin !== 'auto-pin') issue(`${path}.origin`, 'must be manual or auto-pin when present');
  }

  function validateLegacySection(section: unknown, path: string, depth: number): void {
    sectionCount += 1;
    if (depth > DM_SCREEN_MAX_DEPTH) {
      issue(path, `exceeds the maximum nesting depth of ${DM_SCREEN_MAX_DEPTH}`);
      return;
    }
    if (!isRecord(section)) {
      issue(path, 'must be an object');
      return;
    }
    if (!isBoundedText(section.id, MAX_ID_LENGTH)) issue(`${path}.id`, `must be a string no longer than ${MAX_ID_LENGTH} characters`);
    if (!isBoundedText(section.title, MAX_TITLE_LENGTH)) issue(`${path}.title`, `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
    if (typeof section.collapsed !== 'boolean') issue(`${path}.collapsed`, 'must be a boolean');
    if (!Array.isArray(section.items)) issue(`${path}.items`, 'must be an array');
    else section.items.forEach((item, index) => validateLegacyItem(item, `${path}.items[${index}]`));
    if (!Array.isArray(section.children)) issue(`${path}.children`, 'must be an array');
    else section.children.forEach((child, index) => validateLegacySection(child, `${path}.children[${index}]`, depth + 1));
  }

  if (!isRecord(value)) return [{ path: '$', message: 'must be an object' }];
  if (value.version !== 1) issue('$.version', 'must be 1');
  if (!isBoundedText(value.title, MAX_TITLE_LENGTH)) issue('$.title', `must be a string no longer than ${MAX_TITLE_LENGTH} characters`);
  if (typeof value.autoAddPinnedMonsters !== 'boolean') issue('$.autoAddPinnedMonsters', 'must be a boolean');
  if (typeof value.autoAddPinnedSpells !== 'boolean') issue('$.autoAddPinnedSpells', 'must be a boolean');
  if (value.partySnapshot !== undefined && !isDmPartySummary(value.partySnapshot)) issue('$.partySnapshot', 'contains invalid Party summary fields');
  if (!Array.isArray(value.sections)) issue('$.sections', 'must be an array');
  else value.sections.forEach((section, index) => validateLegacySection(section, `$.sections[${index}]`, 1));
  if (sectionCount > DM_SCREEN_MAX_SECTIONS) issue('$.sections', `contains more than ${DM_SCREEN_MAX_SECTIONS} sections`);
  if (itemCount > DM_SCREEN_MAX_ITEMS) issue('$.sections', `contains more than ${DM_SCREEN_MAX_ITEMS} items`);
  return issues;
}

function allocateId(
  preferred: string | undefined,
  kind: DmScreenIdKind,
  used: Set<string>,
  createId: DmScreenIdFactory,
): string {
  if (preferred && preferred.trim() && preferred.length <= MAX_ID_LENGTH && !used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const generated = createId(kind).trim().slice(0, MAX_ID_LENGTH);
    if (generated && !used.has(generated)) {
      used.add(generated);
      return generated;
    }
  }
  let suffix = used.size + 1;
  let fallback = `${kind}-${suffix}`;
  while (used.has(fallback)) {
    suffix += 1;
    fallback = `${kind}-${suffix}`;
  }
  used.add(fallback);
  return fallback;
}

function migrateLegacyDocument(
  legacy: LegacyDmScreenState,
  createId: DmScreenIdFactory,
): { document: DmScreenState; warnings: string[] } {
  const legacyIds = new Set<string>();
  function collectLegacyIds(sections: readonly LegacyDmScreenSection[]): void {
    for (const section of sections) {
      if (section.id.trim()) legacyIds.add(section.id);
      for (const item of section.items) {
        if (item.id.trim()) legacyIds.add(item.id);
      }
      collectLegacyIds(section.children);
    }
  }
  collectLegacyIds(legacy.sections);
  const screenAllocationIds = new Set(legacyIds);
  const screenId = allocateId(undefined, 'screen', screenAllocationIds, createId);
  const used = new Set<string>([screenId]);
  const warnings: string[] = [];
  let remappedIds = 0;

  function migrateItem(item: LegacyDmScreenItem): DmScreenItem {
    const id = allocateId(item.id, 'item', used, createId);
    if (id !== item.id) remappedIds += 1;
    const migrated: DmScreenItem = {
      id,
      kind: item.kind,
      title: item.title,
      collapsed: item.collapsed,
      layout: {
        width: 'full',
        stashed: item.hidden,
        excludedFromPrint: false,
      },
    };
    if (item.body !== undefined) migrated.body = item.body;
    if (item.resourceId !== undefined) migrated.resourceId = item.resourceId;
    if (item.href !== undefined) migrated.href = item.href;
    if (item.origin === 'manual' || item.origin === 'auto-pin') migrated.origin = item.origin;
    return migrated;
  }

  function migrateSection(section: LegacyDmScreenSection, depth: number): DmScreenSection {
    const id = allocateId(section.id, 'section', used, createId);
    if (id !== section.id) remappedIds += 1;
    return {
      id,
      title: section.title,
      collapsed: section.collapsed,
      items: section.items.map(migrateItem),
      children: section.children.map((child) => migrateSection(child, depth + 1)),
    };
  }

  const document: DmScreenState = {
    version: DM_SCREEN_DOCUMENT_VERSION,
    id: screenId,
    revision: 0,
    title: legacy.title,
    autoAddPinnedMonsters: legacy.autoAddPinnedMonsters,
    autoAddPinnedSpells: legacy.autoAddPinnedSpells,
    layout: { columns: 'auto', density: 'comfortable' },
    ...(legacy.partySnapshot ? { partySnapshot: clonePartySummary(legacy.partySnapshot) } : {}),
    sections: legacy.sections.map((section) => migrateSection(section, 1)),
  };
  if (remappedIds > 0) warnings.push(`Reassigned ${remappedIds} blank or duplicate panel ID${remappedIds === 1 ? '' : 's'} during migration.`);
  warnings.unshift('Migrated the saved DM Screen from version 1 to version 2.');
  return { document, warnings };
}

export function parseDmScreenDocument(
  value: unknown,
  options: { createId?: DmScreenIdFactory } = {},
): DmScreenDocumentReadResult {
  if (isRecord(value) && typeof value.version === 'number' && value.version > DM_SCREEN_DOCUMENT_VERSION) {
    return {
      ok: false,
      reason: 'future-version',
      message: `This DM Screen was saved by version ${value.version}, which is newer than this app supports. The saved data was left untouched.`,
      issues: [{ path: '$.version', message: `version ${value.version} is newer than supported version ${DM_SCREEN_DOCUMENT_VERSION}` }],
    };
  }
  if (isRecord(value) && value.version === 1) {
    const legacyIssues = legacyValidationIssues(value);
    if (legacyIssues.length > 0) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'The existing DM Screen contains unsupported fields and was left untouched.',
        issues: legacyIssues,
      };
    }
    const migrated = migrateLegacyDocument(value as unknown as LegacyDmScreenState, options.createId ?? defaultId);
    const issues = validationIssues(migrated.document);
    if (issues.length === 0) return { ok: true, document: migrated.document, migrated: true, warnings: migrated.warnings };
    return { ok: false, reason: 'invalid', message: 'The existing DM Screen could not be migrated safely and was left untouched.', issues };
  }
  const issues = validationIssues(value);
  if (issues.length === 0) {
    return { ok: true, document: cloneDmScreenDocument(value as DmScreenState), migrated: false, warnings: [] };
  }
  return {
    ok: false,
    reason: 'invalid',
    message: 'The DM Screen contains invalid fields and was left untouched.',
    issues,
  };
}

function collectIds(sections: readonly DmScreenSection[], used: Set<string>): void {
  for (const section of sections) {
    used.add(section.id);
    for (const item of section.items) used.add(item.id);
    collectIds(section.children, used);
  }
}

export function mergeDmScreenDocuments(
  current: DmScreenState,
  incoming: DmScreenState,
  options: { createId?: DmScreenIdFactory } = {},
): DmScreenMergeResult {
  if (!isDmScreenState(current) || !isDmScreenState(incoming)) {
    throw new TypeError('Only valid DM Screen version 2 documents can be merged.');
  }
  const createId = options.createId ?? defaultId;
  const used = new Set<string>([current.id]);
  collectIds(current.sections, used);
  const sectionIdRemaps: DmScreenIdRemap[] = [];
  const itemIdRemaps: DmScreenIdRemap[] = [];
  const sectionIds = new Map<string, string>();
  const itemIds = new Map<string, string>();

  function allocateSectionIds(sections: readonly DmScreenSection[]): void {
    for (const section of sections) {
      const id = allocateId(section.id, 'section', used, createId);
      sectionIds.set(section.id, id);
      if (id !== section.id) sectionIdRemaps.push({ from: section.id, to: id });
      allocateSectionIds(section.children);
    }
  }

  function allocateItemIds(sections: readonly DmScreenSection[]): void {
    for (const section of sections) {
      for (const item of section.items) {
        const id = allocateId(item.id, 'item', used, createId);
        itemIds.set(item.id, id);
        if (id !== item.id) itemIdRemaps.push({ from: item.id, to: id });
      }
      allocateItemIds(section.children);
    }
  }

  allocateSectionIds(incoming.sections);
  allocateItemIds(incoming.sections);

  function mergeSection(section: DmScreenSection): DmScreenSection {
    return {
      id: sectionIds.get(section.id)!,
      title: section.title,
      collapsed: section.collapsed,
      items: section.items.map((item) => ({
        id: itemIds.get(item.id)!,
        kind: item.kind,
        title: item.title,
        collapsed: item.collapsed,
        layout: { ...item.layout },
        ...(item.body !== undefined ? { body: item.body } : {}),
        ...(item.resourceId !== undefined ? { resourceId: item.resourceId } : {}),
        ...(item.href !== undefined ? { href: item.href } : {}),
        ...(item.origin !== undefined ? { origin: item.origin } : {}),
      })),
      children: section.children.map(mergeSection),
    };
  }

  const document: DmScreenState = {
    ...cloneDmScreenDocument(current),
    ...(current.partySnapshot || !incoming.partySnapshot
      ? {}
      : { partySnapshot: clonePartySummary(incoming.partySnapshot) }),
    sections: [
      ...current.sections.map(cloneSection),
      ...incoming.sections.map(mergeSection),
    ],
  };
  if (!isDmScreenState(document)) throw new TypeError('The merged DM Screen exceeds supported document limits.');
  return { document, sectionIdRemaps, itemIdRemaps };
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
