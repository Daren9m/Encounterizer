export const SRD_REFORGED_REPOSITORY = 'oldmanumby/dnd.srd.5.2.1';
export const SRD_REFORGED_SHA = 'af537072cc95f362544c71ad14d56046a9aa065a';

export const SRD_SOURCE_DIRS = {
  classes: '03_Character_Classes/Character_Classes_Each',
  magicItems: '10_Magic_Items/Magic_Items_Each',
  feats: '05_Feats/Feats_Each',
  backgrounds: '04_Character_Origins/Backgrounds/Backgrounds_Each',
  species: '04_Character_Origins/Species/Species_Each',
  adventuringGear: '06_Equipment/Equipment_A-Z/Adventuring_Gear/Adventuring_Gear_Each',
  tools: '06_Equipment/Equipment_A-Z/Tools/Tools_Each',
  rulesGlossary: '08_Rules_Glossary/Rules_Glossary_Each',
} as const;

export const SRD_SOURCE_FILES = {
  playingTheGame: '01_Playing_The_Game/Playing_The_Game.md',
  characterCreation: '02_Creating_A_Character/Creating_A_Character.md',
  equipment: '06_Equipment/Equipment_All.md',
  spells: '07_Spells/Spells_All+Header.md',
  gameplayToolbox: '09_Gameplay_Toolbox/Gameplay_Toolbox.md',
  magicItems: '10_Magic_Items/Magic_Items_All+Header.md',
} as const;

export type SrdSourceCategory = keyof typeof SRD_SOURCE_DIRS;
