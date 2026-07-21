import { BACKGROUNDS } from '@/data/backgrounds';
import { FEATS } from '@/data/feats';
import { MAGIC_ITEMS } from '@/data/magic-items';
import {
  RULES_REFERENCE_CATEGORIES,
  RULES_REFERENCE_ENTRIES,
  type RulesReferenceCategoryId,
  type RulesReferenceEntry,
} from '@/data/rules-reference';
import { levelLabel, SRD_SPELLS, type Spell, type SpellSchool } from '@/data/spells';
import { SPECIES } from '@/data/species';
import type {
  Background,
  Feat,
  FeatCategory,
  MagicItem,
  MagicItemCategory,
  MagicItemRarity,
  Species,
} from '@/lib/srd-content-types';

export type ReferenceCategory =
  | 'rules'
  | 'spells'
  | 'magic-items'
  | 'feats'
  | 'backgrounds'
  | 'species';

export type ReferenceCategoryFilter = ReferenceCategory | 'all';

export type ReferenceLibraryEntry =
  | { key: string; id: string; name: string; category: 'rules'; resource: RulesReferenceEntry }
  | { key: string; id: string; name: string; category: 'spells'; resource: Spell }
  | { key: string; id: string; name: string; category: 'magic-items'; resource: MagicItem }
  | { key: string; id: string; name: string; category: 'feats'; resource: Feat }
  | { key: string; id: string; name: string; category: 'backgrounds'; resource: Background }
  | { key: string; id: string; name: string; category: 'species'; resource: Species };

export interface ReferenceLibraryFilters {
  query: string;
  category: ReferenceCategoryFilter;
  ruleCategory?: RulesReferenceCategoryId;
  spellLevel?: number;
  spellSchool?: SpellSchool;
  spellClass?: string;
  concentration?: 'yes' | 'no';
  ritual?: 'yes' | 'no';
  magicItemRarity?: MagicItemRarity;
  magicItemCategory?: MagicItemCategory;
  attunement?: 'required' | 'not-required';
  featCategory?: FeatCategory;
  bookmarkedOnly?: boolean;
}

export const REFERENCE_CATEGORIES: ReadonlyArray<{
  id: ReferenceCategory;
  label: string;
  singular: string;
  count: number;
}> = [
  { id: 'rules', label: 'Rules', singular: 'Rule', count: RULES_REFERENCE_ENTRIES.length },
  { id: 'spells', label: 'Spells', singular: 'Spell', count: SRD_SPELLS.length },
  { id: 'magic-items', label: 'Magic Items', singular: 'Magic Item', count: MAGIC_ITEMS.length },
  { id: 'feats', label: 'Feats', singular: 'Feat', count: FEATS.length },
  { id: 'backgrounds', label: 'Backgrounds', singular: 'Background', count: BACKGROUNDS.length },
  { id: 'species', label: 'Species', singular: 'Species', count: SPECIES.length },
];

export const MAGIC_ITEM_RARITIES: MagicItemRarity[] = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies',
];

export const MAGIC_ITEM_CATEGORIES: MagicItemCategory[] = Array.from(
  new Set(MAGIC_ITEMS.map((item) => item.category)),
).sort((a, b) => a.localeCompare(b));

export const FEAT_CATEGORIES: FeatCategory[] = [
  'Origin', 'General', 'Fighting Style', 'Epic Boon',
];

export const SPELL_SCHOOLS: SpellSchool[] = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
];

export const SPELL_CLASSES = [
  'Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard',
];

export const RULE_CATEGORY_OPTIONS = RULES_REFERENCE_CATEGORIES;

export function buildReferenceLibraryEntries(
  spells: Spell[] = SRD_SPELLS,
): ReferenceLibraryEntry[] {
  return [
    ...RULES_REFERENCE_ENTRIES.map((resource) => ({
      key: `rules:${resource.id}`,
      id: resource.id,
      name: resource.title,
      category: 'rules' as const,
      resource,
    })),
    ...spells.map((resource) => ({
      key: `spells:${resource.id}`,
      id: resource.id,
      name: resource.name,
      category: 'spells' as const,
      resource,
    })),
    ...MAGIC_ITEMS.map((resource) => ({
      key: `magic-items:${resource.id}`,
      id: resource.id,
      name: resource.name,
      category: 'magic-items' as const,
      resource,
    })),
    ...FEATS.map((resource) => ({
      key: `feats:${resource.id}`,
      id: resource.id,
      name: resource.name,
      category: 'feats' as const,
      resource,
    })),
    ...BACKGROUNDS.map((resource) => ({
      key: `backgrounds:${resource.id}`,
      id: resource.id,
      name: resource.name,
      category: 'backgrounds' as const,
      resource,
    })),
    ...SPECIES.map((resource) => ({
      key: `species:${resource.id}`,
      id: resource.id,
      name: resource.name,
      category: 'species' as const,
      resource,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
}

export const REFERENCE_LIBRARY_ENTRIES = buildReferenceLibraryEntries();

function entrySearchText(entry: ReferenceLibraryEntry): string {
  switch (entry.category) {
    case 'rules': {
      const rule = entry.resource;
      return [rule.title, rule.summary, ...rule.details, ...(rule.tags ?? [])].join(' ');
    }
    case 'spells': {
      const spell = entry.resource;
      return [
        spell.name,
        levelLabel(spell.level),
        spell.school,
        ...spell.classes,
        spell.castingTime,
        spell.range,
        spell.area,
        spell.components,
        spell.duration,
        spell.saveType,
        spell.attackType,
        spell.damageType,
        spell.effectSummary,
        spell.upcast,
        spell.description,
      ].filter(Boolean).join(' ');
    }
    case 'magic-items': {
      const item = entry.resource;
      return [
        item.name,
        item.category,
        item.categoryDetail,
        item.rarityText,
        ...item.rarities,
        item.attunement,
        item.requiresAttunement ? 'attunement required' : 'no attunement',
        item.description,
      ].filter(Boolean).join(' ');
    }
    case 'feats': {
      const feat = entry.resource;
      return [feat.name, feat.category, feat.prerequisite, feat.description].filter(Boolean).join(' ');
    }
    case 'backgrounds': {
      const background = entry.resource;
      return [
        background.name,
        ...background.abilityScores,
        background.feat,
        ...background.skillProficiencies,
        background.toolProficiency,
        background.equipment,
        background.description,
      ].join(' ');
    }
    case 'species': {
      const species = entry.resource;
      return [
        species.name,
        species.creatureType,
        species.size,
        String(species.speed),
        ...species.traits.flatMap((trait) => [trait.name, trait.description]),
        species.description,
      ].join(' ');
    }
  }
}

function normalizedTokens(query: string): string[] {
  return query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
}

export function filterReferenceLibrary(
  filters: ReferenceLibraryFilters,
  entries: ReferenceLibraryEntry[] = REFERENCE_LIBRARY_ENTRIES,
  bookmarkedKeys: ReadonlySet<string> = new Set(),
): ReferenceLibraryEntry[] {
  const tokens = normalizedTokens(filters.query);
  const matches = entries.filter((entry) => {
    if (filters.category !== 'all' && entry.category !== filters.category) return false;
    if (filters.bookmarkedOnly && !bookmarkedKeys.has(entry.key)) return false;

    if (entry.category === 'rules') {
      if (filters.ruleCategory && entry.resource.category !== filters.ruleCategory) return false;
    } else if (filters.ruleCategory) return false;

    if (entry.category === 'spells') {
      const spell = entry.resource;
      if (filters.spellLevel !== undefined && spell.level !== filters.spellLevel) return false;
      if (filters.spellSchool && spell.school !== filters.spellSchool) return false;
      if (filters.spellClass && !spell.classes.includes(filters.spellClass)) return false;
      if (filters.concentration && spell.concentration !== (filters.concentration === 'yes')) return false;
      if (filters.ritual && spell.ritual !== (filters.ritual === 'yes')) return false;
    } else if (
      filters.spellLevel !== undefined
      || filters.spellSchool
      || filters.spellClass
      || filters.concentration
      || filters.ritual
    ) return false;

    if (entry.category === 'magic-items') {
      const item = entry.resource;
      if (filters.magicItemRarity && !item.rarities.includes(filters.magicItemRarity)) return false;
      if (filters.magicItemCategory && item.category !== filters.magicItemCategory) return false;
      if (filters.attunement === 'required' && !item.requiresAttunement) return false;
      if (filters.attunement === 'not-required' && item.requiresAttunement) return false;
    } else if (filters.magicItemRarity || filters.magicItemCategory || filters.attunement) return false;

    if (entry.category === 'feats') {
      if (filters.featCategory && entry.resource.category !== filters.featCategory) return false;
    } else if (filters.featCategory) return false;

    if (tokens.length === 0) return true;
    const haystack = entrySearchText(entry).toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  if (tokens.length === 0) return matches;
  const normalizedQuery = tokens.join(' ');
  const relevance = (entry: ReferenceLibraryEntry): number => {
    const name = entry.name.toLocaleLowerCase();
    if (name === normalizedQuery) return 100;
    if (name.startsWith(normalizedQuery)) return 90;
    if (name.includes(normalizedQuery)) return 80;
    if (tokens.every((token) => name.includes(token))) return 70;
    if (name.startsWith(tokens[0])) return 20;
    if (tokens.some((token) => name.includes(token))) return 10;
    return 0;
  };
  return matches.sort((a, b) => (
    relevance(b) - relevance(a)
    || a.name.localeCompare(b.name)
    || a.category.localeCompare(b.category)
  ));
}

export function getReferenceCategoryLabel(category: ReferenceCategory): string {
  return REFERENCE_CATEGORIES.find((candidate) => candidate.id === category)?.singular ?? category;
}

export function getReferenceEntrySummary(entry: ReferenceLibraryEntry): string {
  switch (entry.category) {
    case 'rules':
      return entry.resource.summary;
    case 'spells':
      return `${levelLabel(entry.resource.level)} ${entry.resource.school} · ${entry.resource.castingTime} · ${entry.resource.range}`;
    case 'magic-items':
      return [
        entry.resource.rarityText,
        entry.resource.categoryDetail ?? entry.resource.category,
        entry.resource.requiresAttunement ? 'Attunement' : undefined,
      ].filter(Boolean).join(' · ');
    case 'feats':
      return [`${entry.resource.category} Feat`, entry.resource.prerequisite].filter(Boolean).join(' · ');
    case 'backgrounds':
      return `Background · ${entry.resource.feat}`;
    case 'species':
      return `${entry.resource.creatureType} · Speed ${entry.resource.speed} ft.`;
  }
}

export function isReferenceBookmarkList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}
