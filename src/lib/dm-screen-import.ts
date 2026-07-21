import type { Spell } from '../data/spells';
import { validateSpell } from './validate-spell';
import type { Monster } from './types';
import { validateMonster } from './validate-monster';
import {
  getBattlePhase,
  type BattleState,
} from './battle-organizer';
import { isStoredBattleState } from './battle-store';
import {
  mergeDmScreenDocuments,
  parseDmScreenDocument,
  type DmScreenItem,
  type DmScreenSection,
  type DmScreenState,
} from './dm-screen';

export const DM_SCREEN_EXPORT_KIND = 'encounterizer.dm-screen' as const;
export const DM_SCREEN_EXPORT_VERSION = 2 as const;

export type DmScreenDocumentOptions = NonNullable<
  Parameters<typeof parseDmScreenDocument>[1]
>;

export interface DmScreenExportResources {
  monsters: Monster[];
  spells: Spell[];
}

export interface DmScreenExportEnvelope {
  kind: typeof DM_SCREEN_EXPORT_KIND;
  version: typeof DM_SCREEN_EXPORT_VERSION;
  exportedAt: string;
  dmScreen: DmScreenState;
  battle?: BattleState;
  resources: DmScreenExportResources;
}

export interface DmScreenImportPreview {
  source: 'legacy' | 'v2';
  migrated: boolean;
  title: string;
  sections: number;
  items: number;
  itemsByKind: Readonly<Record<string, number>>;
  monsters: number;
  spells: number;
  battleIncluded: boolean;
  battleCombatants: number;
  battlePhase?: ReturnType<typeof getBattlePhase>;
}

export interface DmScreenImportCandidate {
  dmScreen: DmScreenState;
  battle?: BattleState;
  resources: DmScreenExportResources;
  preview: DmScreenImportPreview;
  warnings: string[];
}

export type DmScreenImportFailureReason =
  | 'invalid-json'
  | 'invalid-envelope'
  | 'invalid-document'
  | 'future-version';

export type DmScreenImportParseResult =
  | { ok: true; candidate: DmScreenImportCandidate }
  | {
      ok: false;
      reason: DmScreenImportFailureReason;
      error: string;
      errors: string[];
    };

export interface DmScreenResourceIdRemap {
  from: string;
  to: string;
}

export interface DmScreenResourceRestorePlan {
  dmScreen: DmScreenState;
  monsters: Monster[];
  spells: Spell[];
  monsterIdRemaps: DmScreenResourceIdRemap[];
  spellIdRemaps: DmScreenResourceIdRemap[];
  warnings: string[];
}

export type DmScreenImportMode = 'merge' | 'replace';

export interface DmScreenImportPlanOptions {
  mode: DmScreenImportMode;
  /** Battle restore is destructive and is never implied by screen restore. */
  includeBattle?: boolean;
  existingMonsterIds?: Iterable<string>;
  existingSpellIds?: Iterable<string>;
  documentOptions?: DmScreenDocumentOptions;
}

export interface DmScreenImportPlan extends DmScreenResourceRestorePlan {
  mode: DmScreenImportMode;
  battle?: BattleState;
  sectionIdRemaps: DmScreenResourceIdRemap[];
  itemIdRemaps: DmScreenResourceIdRemap[];
}

interface NormalizedEnvelope {
  source: DmScreenImportPreview['source'];
  dmScreen: unknown;
  battle?: unknown;
  monsters: unknown[];
  spells: unknown[];
}

interface ResourceValidation<T> {
  values: T[];
  errors: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isMonsterAction(value: unknown): value is Monster['actions'][number] {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.description !== 'string') return false;
  for (const field of ['attackBonus', 'reach', 'range', 'longRange', 'damageAvg']) {
    if (value[field] !== undefined && !isFiniteNumber(value[field])) return false;
  }
  if (value.damageDice !== undefined && typeof value.damageDice !== 'string') return false;
  if (value.attackDelivery !== undefined
    && value.attackDelivery !== 'Melee'
    && value.attackDelivery !== 'Ranged') return false;
  if (value.attackType !== undefined
    && value.attackType !== 'Weapon'
    && value.attackType !== 'Spell') return false;
  return value.damageTypes === undefined || isStringArray(value.damageTypes);
}

function isMonsterActions(value: unknown): value is Monster['actions'] {
  return Array.isArray(value) && value.every(isMonsterAction);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isSpellListRecord(value: unknown): value is Record<string, string[]> {
  return isRecord(value) && Object.values(value).every(isStringArray);
}

function copyCompleteMonsterDetails(
  input: Record<string, unknown>,
  normalized: Monster,
  id: string,
): Monster {
  const complete: Monster = { ...normalized, id, source: 'Custom' };
  if (isNumberRecord(input.savingThrows)) complete.savingThrows = cloneJson(input.savingThrows);
  if (isNumberRecord(input.skills)) complete.skills = cloneJson(input.skills);
  if (typeof input.damageResistanceNotes === 'string') complete.damageResistanceNotes = input.damageResistanceNotes;
  if (typeof input.damageImmunityNotes === 'string') complete.damageImmunityNotes = input.damageImmunityNotes;
  if (isMonsterActions(input.actions)) complete.actions = cloneJson(input.actions);
  if (isMonsterActions(input.bonusActions)) complete.bonusActions = cloneJson(input.bonusActions);
  if (isMonsterActions(input.reactions)) complete.reactions = cloneJson(input.reactions);
  if (isMonsterActions(input.specialAbilities)) complete.specialAbilities = cloneJson(input.specialAbilities);
  if (isMonsterActions(input.mythic)) complete.mythic = cloneJson(input.mythic);
  if (isMonsterActions(input.lair)) complete.lair = cloneJson(input.lair);
  if (isRecord(input.legendary)
    && typeof input.legendary.description === 'string'
    && isFiniteNumber(input.legendary.actionsPerRound)
    && isMonsterActions(input.legendary.actions)) {
    complete.legendary = cloneJson({
      description: input.legendary.description,
      actionsPerRound: input.legendary.actionsPerRound,
      actions: input.legendary.actions,
    });
  }
  if (isRecord(input.spellcasting)
    && ['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(String(input.spellcasting.ability))
    && (input.spellcasting.dc === undefined || isFiniteNumber(input.spellcasting.dc))
    && (input.spellcasting.attackBonus === undefined || isFiniteNumber(input.spellcasting.attackBonus))
    && (input.spellcasting.atWill === undefined || isStringArray(input.spellcasting.atWill))
    && (input.spellcasting.perDay === undefined || isSpellListRecord(input.spellcasting.perDay))
    && (input.spellcasting.slots === undefined || isSpellListRecord(input.spellcasting.slots))) {
    complete.spellcasting = cloneJson(input.spellcasting) as unknown as NonNullable<Monster['spellcasting']>;
  }
  return complete;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function failure(
  reason: DmScreenImportFailureReason,
  errors: string[],
): DmScreenImportParseResult {
  return {
    ok: false,
    reason,
    error: errors[0] ?? 'The DM Screen backup is invalid.',
    errors,
  };
}

function documentErrorPath(path: string, message: string): string {
  const trimmed = path.trim();
  const suffix = message.trim();
  if (trimmed.startsWith('$')) return `$.dmScreen${trimmed.slice(1)}: ${suffix}`;
  if (trimmed.startsWith('[') || trimmed.startsWith('.')) {
    return `$.dmScreen${trimmed}: ${suffix}`;
  }
  if (trimmed.length > 0 && !/\s/.test(trimmed)) {
    return `$.dmScreen.${trimmed}: ${suffix}`;
  }
  return `$.dmScreen: ${suffix}`;
}

function resourceErrorPath(path: string, message: string): string {
  const quotedField = message.match(/^"([a-zA-Z][a-zA-Z0-9.]*)"\s+(.*)$/);
  if (quotedField) return `${path}.${quotedField[1]}: ${quotedField[2]}.`;
  const plainField = message.match(/^([a-zA-Z][a-zA-Z0-9.]*)\s+(must\b.*)$/);
  if (plainField) return `${path}.${plainField[1]}: ${plainField[2]}.`;
  return `${path}: ${message}.`;
}

function normalizeEnvelope(value: unknown):
  | { ok: true; envelope: NormalizedEnvelope }
  | { ok: false; reason: DmScreenImportFailureReason; errors: string[] } {
  if (!isRecord(value)) {
    return {
      ok: false,
      reason: 'invalid-envelope',
      errors: ['$: expected a DM Screen backup object.'],
    };
  }

  const hasKind = Object.prototype.hasOwnProperty.call(value, 'kind');
  const hasVersion = Object.prototype.hasOwnProperty.call(value, 'version');
  let source: NormalizedEnvelope['source'];
  const errors: string[] = [];

  if (hasKind || hasVersion) {
    source = 'v2';
    if (value.kind !== DM_SCREEN_EXPORT_KIND) {
      errors.push(`$.kind: expected "${DM_SCREEN_EXPORT_KIND}".`);
    }
    if (typeof value.version === 'number' && value.version > DM_SCREEN_EXPORT_VERSION) {
      return {
        ok: false,
        reason: 'future-version',
        errors: [
          `$.version: backup version ${value.version} is newer than supported version ${DM_SCREEN_EXPORT_VERSION}. Update Encounterizer before restoring it.`,
        ],
      };
    }
    if (value.version !== DM_SCREEN_EXPORT_VERSION) {
      errors.push(`$.version: expected ${DM_SCREEN_EXPORT_VERSION}.`);
    }
  } else {
    source = 'legacy';
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'dmScreen')) {
    errors.push('$.dmScreen: field is required.');
  }
  if (value.exportedAt !== undefined
    && (typeof value.exportedAt !== 'string' || value.exportedAt.trim().length === 0)) {
    errors.push('$.exportedAt: expected a non-empty string when present.');
  }
  if (value.battle !== undefined && !isRecord(value.battle)) {
    errors.push('$.battle: expected a saved battle object when present.');
  }

  let monsters: unknown[] = [];
  let spells: unknown[] = [];
  if (value.resources !== undefined) {
    if (!isRecord(value.resources)) {
      errors.push('$.resources: expected an object when present.');
    } else {
      if (value.resources.monsters !== undefined) {
        if (Array.isArray(value.resources.monsters)) {
          monsters = value.resources.monsters;
        } else {
          errors.push('$.resources.monsters: expected an array.');
        }
      }
      if (value.resources.spells !== undefined) {
        if (Array.isArray(value.resources.spells)) {
          spells = value.resources.spells;
        } else {
          errors.push('$.resources.spells: expected an array.');
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, reason: 'invalid-envelope', errors };
  return {
    ok: true,
    envelope: {
      source,
      dmScreen: value.dmScreen,
      ...(value.battle === undefined ? {} : { battle: value.battle }),
      monsters,
      spells,
    },
  };
}

function resourceId(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  const id = value.id.trim();
  return id.length > 0 ? id : undefined;
}

function validateMonsters(values: readonly unknown[]): ResourceValidation<Monster> {
  const monsters: Monster[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  values.forEach((value, index) => {
    const path = `$.resources.monsters[${index}]`;
    const id = resourceId(value);
    const validated = validateMonster(value);
    if (!id) errors.push(`${path}.id: expected a non-empty string.`);
    if (!validated.ok) {
      errors.push(...validated.errors.map((message) => resourceErrorPath(path, message)));
    }
    if (id && seen.has(id)) {
      errors.push(`${path}.id: duplicates $.resources.monsters[${seen.get(id)}].id.`);
    } else if (id) {
      seen.set(id, index);
    }
    if (id && validated.ok && isRecord(value)) {
      monsters.push(cloneJson(copyCompleteMonsterDetails(value, validated.monster, id)));
    }
  });

  return { values: monsters, errors };
}

function validateSpells(values: readonly unknown[]): ResourceValidation<Spell> {
  const spells: Spell[] = [];
  const errors: string[] = [];
  const seen = new Map<string, number>();

  values.forEach((value, index) => {
    const path = `$.resources.spells[${index}]`;
    const id = resourceId(value);
    const validated = validateSpell(value);
    if (!id) errors.push(`${path}.id: expected a non-empty string.`);
    if (!validated.ok) {
      errors.push(...validated.errors.map((message) => resourceErrorPath(path, message)));
    }
    if (id && seen.has(id)) {
      errors.push(`${path}.id: duplicates $.resources.spells[${seen.get(id)}].id.`);
    } else if (id) {
      seen.set(id, index);
    }
    if (id && validated.ok) {
      spells.push(cloneJson({ ...validated.spell, id, source: 'Custom' }));
    }
  });

  return { values: spells, errors };
}

function documentCounts(document: DmScreenState): {
  sections: number;
  items: number;
  itemsByKind: Record<string, number>;
} {
  let sectionCount = 0;
  let itemCount = 0;
  const itemsByKind: Record<string, number> = {};
  const visit = (sections: readonly DmScreenSection[]) => {
    for (const section of sections) {
      sectionCount += 1;
      for (const item of section.items) {
        itemCount += 1;
        itemsByKind[item.kind] = (itemsByKind[item.kind] ?? 0) + 1;
      }
      visit(section.children);
    }
  };
  visit(document.sections);
  return { sections: sectionCount, items: itemCount, itemsByKind };
}

export function parseDmScreenImport(
  json: string,
  documentOptions?: DmScreenDocumentOptions,
): DmScreenImportParseResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : '';
    return failure('invalid-json', [`$: file is not valid JSON.${detail}`]);
  }

  const normalized = normalizeEnvelope(parsedJson);
  if (!normalized.ok) return failure(normalized.reason, normalized.errors);

  const parsedDocument = parseDmScreenDocument(
    normalized.envelope.dmScreen,
    documentOptions,
  );
  if (!parsedDocument.ok) {
    const errors = parsedDocument.issues.length > 0
      ? parsedDocument.issues.map((issue) => documentErrorPath(issue.path, issue.message))
      : [`$.dmScreen: ${parsedDocument.message}`];
    return failure(
      parsedDocument.reason === 'future-version' ? 'future-version' : 'invalid-document',
      errors,
    );
  }

  const monsterValidation = validateMonsters(normalized.envelope.monsters);
  const spellValidation = validateSpells(normalized.envelope.spells);
  const resourceErrors = [...monsterValidation.errors, ...spellValidation.errors];
  if (resourceErrors.length > 0) return failure('invalid-envelope', resourceErrors);

  let battle: BattleState | undefined;
  if (normalized.envelope.battle !== undefined) {
    if (!isStoredBattleState(normalized.envelope.battle)) {
      return failure('invalid-envelope', [
        '$.battle: included battle does not match a valid saved Battle Organizer state.',
      ]);
    }
    battle = cloneJson(normalized.envelope.battle);
  }

  const dmScreen = cloneJson(parsedDocument.document);
  const resources: DmScreenExportResources = {
    monsters: cloneJson(monsterValidation.values),
    spells: cloneJson(spellValidation.values),
  };
  const counts = documentCounts(dmScreen);
  const warnings = [
    ...(normalized.envelope.source === 'legacy'
      ? ['This backup uses the older unversioned export envelope and will be upgraded when restored.']
      : []),
    ...parsedDocument.warnings,
  ];
  if (parsedDocument.migrated
    && !warnings.some((warning) => warning.toLowerCase().includes('migrat'))) {
    warnings.push('The DM Screen document will be migrated to version 2 when restored.');
  }

  return {
    ok: true,
    candidate: {
      dmScreen,
      ...(battle ? { battle } : {}),
      resources,
      warnings,
      preview: {
        source: normalized.envelope.source,
        migrated: parsedDocument.migrated,
        title: dmScreen.title,
        ...counts,
        monsters: resources.monsters.length,
        spells: resources.spells.length,
        battleIncluded: battle !== undefined,
        battleCombatants: battle?.combatants.length ?? 0,
        ...(battle ? { battlePhase: getBattlePhase(battle) } : {}),
      },
    },
  };
}

export function createDmScreenExportEnvelope(
  input: {
    dmScreen: DmScreenState;
    battle?: BattleState;
    resources?: Partial<DmScreenExportResources>;
    exportedAt?: string;
  },
  documentOptions?: DmScreenDocumentOptions,
): DmScreenExportEnvelope {
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  if (exportedAt.trim().length === 0) {
    throw new TypeError('$.exportedAt: expected a non-empty string.');
  }
  const document = parseDmScreenDocument(cloneJson(input.dmScreen), documentOptions);
  if (!document.ok) {
    const errors = document.issues.length > 0
      ? document.issues.map((issue) => documentErrorPath(issue.path, issue.message))
      : [`$.dmScreen: ${document.message}`];
    throw new TypeError(errors.join('\n'));
  }
  if (input.battle && !isStoredBattleState(input.battle)) {
    throw new TypeError('$.battle: included battle does not match a valid saved Battle Organizer state.');
  }
  const sourceMonsters = input.resources?.monsters ?? [];
  const sourceSpells = input.resources?.spells ?? [];
  const monsters = validateMonsters(sourceMonsters);
  const spells = validateSpells(sourceSpells);
  const resourceErrors = [...monsters.errors, ...spells.errors];
  if (resourceErrors.length > 0) throw new TypeError(resourceErrors.join('\n'));

  return {
    kind: DM_SCREEN_EXPORT_KIND,
    version: DM_SCREEN_EXPORT_VERSION,
    exportedAt,
    dmScreen: cloneJson(document.document),
    ...(input.battle ? { battle: cloneJson(input.battle) } : {}),
    // Internal resources are already typed. Validate them above, then retain
    // their complete copied definitions rather than the custom-import
    // validator's intentionally reduced normalization.
    resources: {
      monsters: cloneJson(sourceMonsters),
      spells: cloneJson(sourceSpells),
    },
  };
}

function allocateResourceId(original: string, reserved: Set<string>): string {
  const base = original.startsWith('custom-')
    ? `${original}-imported`
    : `custom-${original}`;
  let candidate = base;
  for (let suffix = 2; reserved.has(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  reserved.add(candidate);
  return candidate;
}

function planResourceKind<T extends { id: string }>(
  resources: readonly T[],
  existingIds: Iterable<string>,
): { resources: T[]; remaps: DmScreenResourceIdRemap[]; idMap: Map<string, string> } {
  const existing = new Set(existingIds);
  const reserved = new Set([
    ...existing,
    ...resources.map((resource) => resource.id),
  ]);
  const remaps: DmScreenResourceIdRemap[] = [];
  const idMap = new Map<string, string>();
  const planned = resources.map((resource) => {
    const nextId = existing.has(resource.id)
      ? allocateResourceId(resource.id, reserved)
      : resource.id;
    idMap.set(resource.id, nextId);
    if (nextId !== resource.id) remaps.push({ from: resource.id, to: nextId });
    return cloneJson({ ...resource, id: nextId });
  });
  return { resources: planned, remaps, idMap };
}

function rewriteItemResourceId(
  item: DmScreenItem,
  monsterIds: ReadonlyMap<string, string>,
  spellIds: ReadonlyMap<string, string>,
): DmScreenItem {
  const map = item.kind === 'monster'
    ? monsterIds
    : item.kind === 'spell'
      ? spellIds
      : undefined;
  if (!map || !item.resourceId) return item;
  const resourceId = map.get(item.resourceId);
  return resourceId && resourceId !== item.resourceId
    ? { ...item, resourceId }
    : item;
}

function rewriteSectionResources(
  section: DmScreenSection,
  monsterIds: ReadonlyMap<string, string>,
  spellIds: ReadonlyMap<string, string>,
): DmScreenSection {
  return {
    ...section,
    items: section.items.map((item) => rewriteItemResourceId(item, monsterIds, spellIds)),
    children: section.children.map((child) => rewriteSectionResources(child, monsterIds, spellIds)),
  };
}

export function planDmScreenResourceRestore(
  candidate: DmScreenImportCandidate,
  existing: {
    monsterIds?: Iterable<string>;
    spellIds?: Iterable<string>;
  } = {},
): DmScreenResourceRestorePlan {
  const monsters = planResourceKind(
    candidate.resources.monsters,
    existing.monsterIds ?? [],
  );
  const spells = planResourceKind(
    candidate.resources.spells,
    existing.spellIds ?? [],
  );
  const cloned = cloneJson(candidate.dmScreen);
  const dmScreen: DmScreenState = {
    ...cloned,
    sections: cloned.sections.map((section) => rewriteSectionResources(
      section,
      monsters.idMap,
      spells.idMap,
    )),
  };
  const warnings: string[] = [];
  if (monsters.remaps.length > 0) {
    warnings.push(
      `${monsters.remaps.length} copied monster ID${monsters.remaps.length === 1 ? '' : 's'} will be reassigned to preserve existing resources.`,
    );
  }
  if (spells.remaps.length > 0) {
    warnings.push(
      `${spells.remaps.length} copied spell ID${spells.remaps.length === 1 ? '' : 's'} will be reassigned to preserve existing resources.`,
    );
  }
  return {
    dmScreen,
    monsters: monsters.resources,
    spells: spells.resources,
    monsterIdRemaps: monsters.remaps,
    spellIdRemaps: spells.remaps,
    warnings,
  };
}

export function planDmScreenImport(
  current: DmScreenState,
  candidate: DmScreenImportCandidate,
  options: DmScreenImportPlanOptions,
): DmScreenImportPlan {
  const resources = planDmScreenResourceRestore(candidate, {
    monsterIds: options.existingMonsterIds,
    spellIds: options.existingSpellIds,
  });
  const merged = options.mode === 'merge'
    ? mergeDmScreenDocuments(
        cloneJson(current),
        resources.dmScreen,
        options.documentOptions,
      )
    : undefined;
  const dmScreen = merged?.document ?? cloneJson(resources.dmScreen);
  const battle = options.includeBattle && candidate.battle
    ? cloneJson(candidate.battle)
    : undefined;
  return {
    mode: options.mode,
    dmScreen: cloneJson(dmScreen),
    ...(battle ? { battle } : {}),
    monsters: cloneJson(resources.monsters),
    spells: cloneJson(resources.spells),
    monsterIdRemaps: [...resources.monsterIdRemaps],
    spellIdRemaps: [...resources.spellIdRemaps],
    sectionIdRemaps: merged ? [...merged.sectionIdRemaps] : [],
    itemIdRemaps: merged ? [...merged.itemIdRemaps] : [],
    warnings: [...candidate.warnings, ...resources.warnings],
  };
}
