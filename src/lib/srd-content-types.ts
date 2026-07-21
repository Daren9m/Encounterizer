export const SRD_DOCUMENT = 'SRD 5.2.1' as const;

export type SrdDocument = typeof SRD_DOCUMENT;

export type MagicItemCategory =
  | 'Armor'
  | 'Potion'
  | 'Ring'
  | 'Rod'
  | 'Scroll'
  | 'Staff'
  | 'Wand'
  | 'Weapon'
  | 'Wondrous Item';

export type MagicItemRarity =
  | 'Common'
  | 'Uncommon'
  | 'Rare'
  | 'Very Rare'
  | 'Legendary'
  | 'Artifact'
  | 'Varies';

export interface MagicItem {
  id: string;
  name: string;
  category: MagicItemCategory;
  categoryDetail?: string;
  rarities: MagicItemRarity[];
  rarityText: string;
  requiresAttunement: boolean;
  attunement?: string;
  description: string;
  source: SrdDocument;
}

export type FeatCategory = 'Origin' | 'General' | 'Fighting Style' | 'Epic Boon';

export interface Feat {
  id: string;
  name: string;
  category: FeatCategory;
  prerequisite?: string;
  description: string;
  source: SrdDocument;
}

export interface Background {
  id: string;
  name: string;
  abilityScores: string[];
  feat: string;
  skillProficiencies: string[];
  toolProficiency: string;
  equipment: string;
  description: string;
  source: SrdDocument;
}

export interface SpeciesTrait {
  name: string;
  description: string;
}

export interface Species {
  id: string;
  name: string;
  creatureType: string;
  size: string;
  speed: number;
  traits: SpeciesTrait[];
  description: string;
  source: SrdDocument;
}

export interface SrdContentMeta {
  count: number;
  source: SrdDocument;
  license: 'CC-BY-4.0';
  sourceRepository: string;
  sourceCommit: string;
}
