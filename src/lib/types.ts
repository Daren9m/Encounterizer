// ─── Encounterizer Type System ───────────────────────────────────
// Targeting 5.5e / 2024 revised rules where available,
// falling back to 2014 5e for content not yet updated.

// ─── Enums & Unions ──────────────────────────────────────────────

export type Size = 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan';

export type CreatureType =
  | 'Aberration' | 'Beast' | 'Celestial' | 'Construct' | 'Dragon'
  | 'Elemental' | 'Fey' | 'Fiend' | 'Giant' | 'Humanoid'
  | 'Monstrosity' | 'Ooze' | 'Plant' | 'Undead';

export type Environment =
  | 'Arctic' | 'Coastal' | 'Desert' | 'Forest' | 'Grassland'
  | 'Hill' | 'Mountain' | 'Swamp' | 'Underdark' | 'Underwater'
  | 'Urban' | 'Planar' | 'Any';

export type DamageType =
  | 'Acid' | 'Bludgeoning' | 'Cold' | 'Fire' | 'Force'
  | 'Lightning' | 'Necrotic' | 'Piercing' | 'Poison'
  | 'Psychic' | 'Radiant' | 'Slashing' | 'Thunder';

export type Condition =
  | 'Blinded' | 'Charmed' | 'Deafened' | 'Exhaustion'
  | 'Frightened' | 'Grappled' | 'Incapacitated' | 'Invisible'
  | 'Paralyzed' | 'Petrified' | 'Poisoned' | 'Prone'
  | 'Restrained' | 'Stunned' | 'Unconscious';

export type MovementMode = 'Walk' | 'Fly' | 'Swim' | 'Burrow' | 'Climb' | 'Hover';

export type AttackDelivery = 'Melee' | 'Ranged';
export type AttackType = 'Weapon' | 'Spell';

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Deadly';

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'
  | 'Unaligned' | 'Any Alignment' | 'Typically Neutral Evil'
  | 'Typically Chaotic Evil' | 'Typically Lawful Evil'
  | 'Typically Neutral' | 'Typically Lawful Good'
  | 'Typically Chaotic Good' | 'Typically Neutral Good';

export type SourceBook =
  | 'MM2024' | 'MM2014' | 'PHB2024' | 'DMG2024'
  | 'VGM' | 'MTF' | 'FTD' | 'MPMM'
  | 'Custom';

// ─── Structured Sub-types ────────────────────────────────────────

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Speed {
  walk?: number;
  fly?: number;
  swim?: number;
  burrow?: number;
  climb?: number;
  hover?: boolean;  // true if fly speed includes hover
}

export interface ArmorDetail {
  ac: number;
  source?: string;  // e.g. "natural armor", "chain mail", "shield"
}

export interface SavingThrows {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

export interface Skills {
  [skillName: string]: number;  // e.g. { "Perception": 5, "Stealth": 8 }
}

export interface DamageRelation {
  types: DamageType[];
  note?: string;  // e.g. "from nonmagical attacks"
}

export interface MonsterAction {
  name: string;
  description: string;
  attackDelivery?: AttackDelivery;
  attackType?: AttackType;
  attackBonus?: number;
  reach?: number;     // feet, for melee
  range?: number;     // feet, for ranged (normal range)
  longRange?: number; // feet, for ranged (long range)
  damageTypes?: DamageType[];
  damageDice?: string;
  damageAvg?: number;
}

export interface LegendaryDetail {
  description: string;       // preamble
  actions: MonsterAction[];
  actionsPerRound: number;   // typically 3
}

export interface SpellcastingDetail {
  ability: keyof AbilityScores;
  dc?: number;
  attackBonus?: number;
  atWill?: string[];
  perDay?: Record<string, string[]>;  // e.g. { "3": ["fireball", "counterspell"] }
  slots?: Record<string, string[]>;   // spell slot based casting
}

// ─── Monster ─────────────────────────────────────────────────────

export interface Monster {
  id: string;
  name: string;
  source: SourceBook;
  size: Size;
  type: CreatureType;
  subtype?: string;          // e.g. "devil", "goblinoid", "shapechanger"
  alignment: Alignment;
  armor: ArmorDetail;
  hitPoints: number;
  hitDice: string;
  speed: Speed;
  abilities: AbilityScores;
  savingThrows?: SavingThrows;
  skills?: Skills;
  senses: string[];          // e.g. ["darkvision 60 ft.", "passive Perception 14"]
  languages: string[];
  challengeRating: number;
  proficiencyBonus: number;
  xp: number;

  // Damage & condition relations — structured for filtering
  damageVulnerabilities: DamageType[];
  damageResistances: DamageType[];
  damageResistanceNotes?: string;      // e.g. "bludgeoning from nonmagical attacks"
  damageImmunities: DamageType[];
  damageImmunityNotes?: string;
  conditionImmunities: Condition[];

  // Actions
  actions: MonsterAction[];
  bonusActions?: MonsterAction[];
  reactions?: MonsterAction[];
  specialAbilities?: MonsterAction[];
  legendary?: LegendaryDetail;
  mythic?: MonsterAction[];
  lair?: MonsterAction[];

  // Spellcasting
  spellcasting?: SpellcastingDetail;

  // Metadata for filtering
  environments: Environment[];
  isLegendary: boolean;
  isMythic: boolean;
  hasLair: boolean;
  hasSpellcasting: boolean;

  // Derived / computed filter tags (populated at load time)
  movementModes: MovementMode[];
  attackDamageTypes: DamageType[];      // all damage types this monster can deal
  attackDeliveryModes: AttackDelivery[];
  tags: string[];                       // freeform tags: "pack tactics", "ambusher", etc.
}

// ─── Monster Filter ──────────────────────────────────────────────

export interface MonsterFilter {
  search?: string;              // free-text name search
  crMin?: number;
  crMax?: number;
  sizes?: Size[];
  types?: CreatureType[];
  environments?: Environment[];
  movementModes?: MovementMode[];       // has ANY of these movement modes
  attackDamageTypes?: DamageType[];      // deals ANY of these damage types
  attackDeliveryModes?: AttackDelivery[];
  damageResistances?: DamageType[];     // resistant to ANY of these
  damageImmunities?: DamageType[];      // immune to ANY of these
  damageVulnerabilities?: DamageType[]; // vulnerable to ANY of these
  conditionImmunities?: Condition[];
  isLegendary?: boolean;
  hasSpellcasting?: boolean;
  hasLair?: boolean;
  sources?: SourceBook[];
  tags?: string[];
  sortBy?: 'name' | 'cr' | 'hp' | 'ac';
  sortDir?: 'asc' | 'desc';
}

// ─── Map ─────────────────────────────────────────────────────────

export type TerrainType =
  | 'floor' | 'wall' | 'water' | 'difficult'
  | 'door' | 'trap' | 'treasure' | 'entrance' | 'exit'
  | 'pillar' | 'elevated' | 'lava' | 'ice' | 'vegetation'
  | 'bridge' | 'chasm' | 'rubble' | 'altar' | 'stairs';

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

// ─── XP Thresholds per character level (2024 rules) ──────────────

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

// CR to XP mapping (official table)
export const CR_XP: Record<number, number> = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100,
  1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800,
  6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
  11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000,
  16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000,
  21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000,
  26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

// CR to proficiency bonus
export const CR_PROF: Record<number, number> = {
  0: 2, 0.125: 2, 0.25: 2, 0.5: 2,
  1: 2, 2: 2, 3: 2, 4: 2,
  5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4,
  13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
  21: 7, 22: 7, 23: 7, 24: 7,
  25: 8, 26: 8, 27: 8, 28: 8,
  29: 9, 30: 9,
};

// Encounter multipliers based on number of monsters (2024 rules)
export function getEncounterMultiplier(monsterCount: number, partySize: number): number {
  let bracket: number;
  if (monsterCount === 1) bracket = 0;
  else if (monsterCount === 2) bracket = 1;
  else if (monsterCount <= 6) bracket = 2;
  else if (monsterCount <= 10) bracket = 3;
  else if (monsterCount <= 14) bracket = 4;
  else bracket = 5;

  const multipliers = [1, 1.5, 2, 2.5, 3, 4];

  if (partySize < 3) bracket = Math.min(bracket + 1, 5);
  else if (partySize >= 6) bracket = Math.max(bracket - 1, 0);

  return multipliers[bracket];
}

// ─── 5etools Import Types ────────────────────────────────────────

export interface FiveEToolsMonster {
  name: string;
  source: string;
  size?: string[];
  type?: string | { type: string; tags?: string[] };
  alignment?: Array<string | { alignment: string[] }>;
  ac?: Array<number | { ac: number; from?: string[] }>;
  hp?: { average?: number; formula?: string };
  speed?: Record<string, number | boolean | { number: number; condition: string }>;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  cr?: string | { cr: string; lair?: string };
  trait?: Array<{ name: string; entries: string[] }>;
  action?: Array<{ name: string; entries: string[] }>;
  bonus?: Array<{ name: string; entries: string[] }>;
  reaction?: Array<{ name: string; entries: string[] }>;
  legendary?: Array<{ name: string; entries: string[] }>;
  environment?: string[];
  [key: string]: unknown;
}
