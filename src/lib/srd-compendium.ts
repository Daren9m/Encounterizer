import { BACKGROUNDS } from '@/data/backgrounds';
import { FEATS } from '@/data/feats';
import { MAGIC_ITEMS } from '@/data/magic-items';
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

export type SrdCompendiumCategory =
  | 'magic-items'
  | 'feats'
  | 'backgrounds'
  | 'species';

export type SrdCompendiumCategoryFilter = SrdCompendiumCategory | 'all';

export type SrdCompendiumEntry =
  | { key: string; id: string; name: string; category: 'magic-items'; resource: MagicItem }
  | { key: string; id: string; name: string; category: 'feats'; resource: Feat }
  | { key: string; id: string; name: string; category: 'backgrounds'; resource: Background }
  | { key: string; id: string; name: string; category: 'species'; resource: Species };

export interface SrdCompendiumFilters {
  query: string;
  category: SrdCompendiumCategoryFilter;
  magicItemRarity?: MagicItemRarity;
  magicItemCategory?: MagicItemCategory;
  attunement?: 'required' | 'not-required';
  featCategory?: FeatCategory;
}

export const SRD_COMPENDIUM_CATEGORIES: ReadonlyArray<{
  id: SrdCompendiumCategory;
  label: string;
  singular: string;
  count: number;
}> = [
  { id: 'magic-items', label: 'Magic Items', singular: 'Magic Item', count: MAGIC_ITEMS.length },
  { id: 'feats', label: 'Feats', singular: 'Feat', count: FEATS.length },
  { id: 'backgrounds', label: 'Backgrounds', singular: 'Background', count: BACKGROUNDS.length },
  { id: 'species', label: 'Species', singular: 'Species', count: SPECIES.length },
];

export const MAGIC_ITEM_RARITIES: MagicItemRarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Very Rare',
  'Legendary',
  'Artifact',
  'Varies',
];

export const MAGIC_ITEM_CATEGORIES: MagicItemCategory[] = Array.from(
  new Set(MAGIC_ITEMS.map((item) => item.category)),
).sort((a, b) => a.localeCompare(b));

export const FEAT_CATEGORIES: FeatCategory[] = [
  'Origin',
  'General',
  'Fighting Style',
  'Epic Boon',
];

export const SRD_COMPENDIUM_ENTRIES: SrdCompendiumEntry[] = [
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

function entrySearchText(entry: SrdCompendiumEntry): string {
  switch (entry.category) {
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
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function filterSrdCompendium(
  filters: SrdCompendiumFilters,
  entries: SrdCompendiumEntry[] = SRD_COMPENDIUM_ENTRIES,
): SrdCompendiumEntry[] {
  const tokens = normalizedTokens(filters.query);

  const matches = entries.filter((entry) => {
    if (filters.category !== 'all' && entry.category !== filters.category) return false;

    if (entry.category === 'magic-items') {
      const item = entry.resource;
      if (filters.magicItemRarity && !item.rarities.includes(filters.magicItemRarity)) return false;
      if (filters.magicItemCategory && item.category !== filters.magicItemCategory) return false;
      if (filters.attunement === 'required' && !item.requiresAttunement) return false;
      if (filters.attunement === 'not-required' && item.requiresAttunement) return false;
    } else if (filters.magicItemRarity || filters.magicItemCategory || filters.attunement) {
      return false;
    }

    if (entry.category === 'feats') {
      if (filters.featCategory && entry.resource.category !== filters.featCategory) return false;
    } else if (filters.featCategory) {
      return false;
    }

    if (tokens.length === 0) return true;
    const haystack = entrySearchText(entry).toLocaleLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });

  if (tokens.length === 0) return matches;

  const normalizedQuery = tokens.join(' ');
  const relevance = (entry: SrdCompendiumEntry): number => {
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

export function getSrdCompendiumCategoryLabel(category: SrdCompendiumCategory): string {
  return SRD_COMPENDIUM_CATEGORIES.find((candidate) => candidate.id === category)?.singular
    ?? category;
}

export function getSrdCompendiumEntrySummary(entry: SrdCompendiumEntry): string {
  switch (entry.category) {
    case 'magic-items':
      return [
        entry.resource.rarityText,
        entry.resource.categoryDetail ?? entry.resource.category,
        entry.resource.requiresAttunement ? 'Attunement' : undefined,
      ].filter(Boolean).join(' · ');
    case 'feats':
      return [
        `${entry.resource.category} Feat`,
        entry.resource.prerequisite,
      ].filter(Boolean).join(' · ');
    case 'backgrounds':
      return `Background · ${entry.resource.feat}`;
    case 'species':
      return `${entry.resource.creatureType} · Speed ${entry.resource.speed} ft.`;
  }
}
