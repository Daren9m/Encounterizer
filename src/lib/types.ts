// ─── Core D&D Types ──────────────────────────────────────────────

export type Size = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';

export type MonsterType =
  | 'Aberration' | 'Beast' | 'Celestial' | 'Construct' | 'Dragon'
  | 'Elemental' | 'Fey' | 'Fiend' | 'Giant' | 'Humanoid'
  | 'Monstrosity' | 'Ooze' | 'Plant' | 'Undead';

export type Environment =
  | 'Arctic' | 'Coastal' | 'Desert' | 'Forest' | 'Grassland'
  | 'Hill' | 'Mountain' | 'Swamp' | 'Underdark' | 'Underwater' | 'Urban';

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Deadly';

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'
  | 'Unaligned';

// ─── Monster ─────────────────────────────────────────────────────

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface MonsterAction {
  name: string;
  description: string;
  attackBonus?: number;
  damageDice?: string;
}

export interface Monster {
  id: string;
  name: string;
  size: Size;
  type: MonsterType;
  alignment: Alignment;
  armorClass: number;
  hitPoints: number;
  hitDice: string;
  speed: string;
  abilities: AbilityScores;
  challengeRating: number;
  xp: number;
  environments: Environment[];
  actions: MonsterAction[];
  specialAbilities?: MonsterAction[];
  languages?: string;
  senses?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
}

// ─── Map ─────────────────────────────────────────────────────────

export type TerrainType =
  | 'floor' | 'wall' | 'water' | 'difficult'
  | 'door' | 'trap' | 'treasure' | 'entrance' | 'exit'
  | 'pillar' | 'elevated';

export interface MapCell {
  terrain: TerrainType;
  label?: string;
}

export interface EncounterMap {
  id: string;
  name: string;
  width: number;
  height: number;
  environment: Environment;
  grid: MapCell[][];
}

// ─── Encounter ───────────────────────────────────────────────────

export interface EncounterMonster {
  monster: Monster;
  count: number;
}

export interface Encounter {
  id: string;
  name: string;
  description: string;
  environment: Environment;
  difficulty: Difficulty;
  monsters: EncounterMonster[];
  map?: EncounterMap;
  totalXp: number;
  adjustedXp: number;
  scenarioHook?: string;
  tactics?: string;
  treasure?: string;
}

// ─── Party ───────────────────────────────────────────────────────

export interface PartyMember {
  name: string;
  level: number;
  className: string;
}

export interface Party {
  id: string;
  name: string;
  members: PartyMember[];
}

// ─── XP Thresholds (per character level) ─────────────────────────

export const XP_THRESHOLDS: Record<number, Record<Difficulty, number>> = {
  1:  { Easy: 25,   Medium: 50,   Hard: 75,    Deadly: 100   },
  2:  { Easy: 50,   Medium: 100,  Hard: 150,   Deadly: 200   },
  3:  { Easy: 75,   Medium: 150,  Hard: 225,   Deadly: 400   },
  4:  { Easy: 125,  Medium: 250,  Hard: 375,   Deadly: 500   },
  5:  { Easy: 250,  Medium: 500,  Hard: 750,   Deadly: 1100  },
  6:  { Easy: 300,  Medium: 600,  Hard: 900,   Deadly: 1400  },
  7:  { Easy: 350,  Medium: 750,  Hard: 1100,  Deadly: 1700  },
  8:  { Easy: 450,  Medium: 900,  Hard: 1400,  Deadly: 2100  },
  9:  { Easy: 550,  Medium: 1100, Hard: 1600,  Deadly: 2400  },
  10: { Easy: 600,  Medium: 1200, Hard: 1900,  Deadly: 2800  },
  11: { Easy: 800,  Medium: 1600, Hard: 2400,  Deadly: 3600  },
  12: { Easy: 1000, Medium: 2000, Hard: 3000,  Deadly: 4500  },
  13: { Easy: 1100, Medium: 2200, Hard: 3400,  Deadly: 5100  },
  14: { Easy: 1250, Medium: 2500, Hard: 3800,  Deadly: 5700  },
  15: { Easy: 1400, Medium: 2800, Hard: 4300,  Deadly: 6400  },
  16: { Easy: 1600, Medium: 3200, Hard: 4800,  Deadly: 7200  },
  17: { Easy: 2000, Medium: 3900, Hard: 5900,  Deadly: 8800  },
  18: { Easy: 2100, Medium: 4200, Hard: 6300,  Deadly: 9500  },
  19: { Easy: 2400, Medium: 4900, Hard: 7300,  Deadly: 10900 },
  20: { Easy: 2800, Medium: 5700, Hard: 8500,  Deadly: 12700 },
};

// CR to XP mapping
export const CR_XP: Record<number, number> = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
  6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
  26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

// Encounter multipliers based on number of monsters
export function getEncounterMultiplier(monsterCount: number, partySize: number): number {
  let bracket: number;
  if (monsterCount === 1) bracket = 0;
  else if (monsterCount === 2) bracket = 1;
  else if (monsterCount <= 6) bracket = 2;
  else if (monsterCount <= 10) bracket = 3;
  else if (monsterCount <= 14) bracket = 4;
  else bracket = 5;

  const multipliers = [1, 1.5, 2, 2.5, 3, 4];

  // Adjust for party size
  if (partySize < 3) bracket = Math.min(bracket + 1, 5);
  else if (partySize >= 6) bracket = Math.max(bracket - 1, 0);

  return multipliers[bracket];
}
