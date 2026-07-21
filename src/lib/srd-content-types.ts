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

export interface SrdTextSection {
  heading?: string;
  text: string;
}

export type SrdRuleGroup =
  | 'Playing the Game'
  | 'Character Creation'
  | 'Equipment Rules'
  | 'Spellcasting Rules'
  | 'Rules Glossary'
  | 'Gameplay Toolbox'
  | 'Magic Item Rules';

export interface SrdReferenceArticle {
  id: string;
  name: string;
  group: SrdRuleGroup;
  summary: string;
  sections: SrdTextSection[];
  source: SrdDocument;
}

export interface SrdClassEntry {
  id: string;
  name: string;
  kind: 'Class' | 'Subclass';
  className: string;
  summary: string;
  sections: SrdTextSection[];
  source: SrdDocument;
}

export type SrdEquipmentCategory =
  | 'Weapon'
  | 'Armor'
  | 'Adventuring Gear'
  | 'Tool'
  | 'Mount'
  | 'Tack and Vehicle'
  | 'Large Vehicle';

export interface SrdEquipmentFact {
  label: string;
  value: string;
}

export interface SrdEquipmentItem {
  id: string;
  name: string;
  category: SrdEquipmentCategory;
  cost?: string;
  weight?: string;
  summary: string;
  facts: SrdEquipmentFact[];
  description: string;
  source: SrdDocument;
}

export interface SrdReferenceContentMeta {
  rules: number;
  classes: number;
  equipment: number;
  source: SrdDocument;
  license: 'CC-BY-4.0';
  sourceRepository: string;
  sourceCommit: string;
}

export interface SrdContentMeta {
  count: number;
  source: SrdDocument;
  license: 'CC-BY-4.0';
  sourceRepository: string;
  sourceCommit: string;
}
