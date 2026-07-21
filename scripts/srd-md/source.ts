export const SRD_REFORGED_REPOSITORY = 'oldmanumby/dnd.srd.5.2.1';
export const SRD_REFORGED_SHA = 'af537072cc95f362544c71ad14d56046a9aa065a';

export const SRD_SOURCE_DIRS = {
  magicItems: '10_Magic_Items/Magic_Items_Each',
  feats: '05_Feats/Feats_Each',
  backgrounds: '04_Character_Origins/Backgrounds/Backgrounds_Each',
  species: '04_Character_Origins/Species/Species_Each',
} as const;

export type SrdSourceCategory = keyof typeof SRD_SOURCE_DIRS;
