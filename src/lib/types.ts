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

// The 2024 DMG defines Low, Moderate, and High encounter budgets. Encounterizer
// adds Trivial (50% of Low) and Extreme (130% of High) as deterministic build
// targets so DMs can work with a familiar five-step scale without changing the
// official values below.
export type OfficialDifficulty = 'Low' | 'Moderate' | 'High';
export type Difficulty = 'Trivial' | OfficialDifficulty | 'Extreme';
export type EncounterAssessment = Difficulty;

export type Alignment =
  | 'Lawful Good' | 'Neutral Good' | 'Chaotic Good'
  | 'Lawful Neutral' | 'True Neutral' | 'Chaotic Neutral'
  | 'Lawful Evil' | 'Neutral Evil' | 'Chaotic Evil'
  | 'Unaligned' | 'Any Alignment' | 'Typically Neutral Evil'
  | 'Typically Chaotic Evil' | 'Typically Lawful Evil'
  | 'Typically Neutral' | 'Typically Lawful Good'
  | 'Typically Chaotic Good' | 'Typically Neutral Good';

export type SourceBook =
  | 'SRD52'
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

export type MapFeatureDensity = 'Sparse' | 'Balanced' | 'Dense';
export type MapTerrainVariety = 'Focused' | 'Varied' | 'Wild';

export type MapRoomTag =
  | 'spawn:party' | 'spawn:monster' | 'boss'
  | 'entrance' | 'exit' | 'treasure' | 'trap' | 'hazard' | 'landmark';

export interface MapRoom {
  /** 1-based display number, stable for a given seed. */
  id: number;
  name: string;
  /** One-line DM note on what this space is for. */
  purpose: string;
  /** 1–2 sentence boxed text to read to players. */
  readAloud: string;
  /** BSP rect | irregular cave region | outdoor band. */
  kind: 'room' | 'chamber' | 'zone';
  bounds: { x: number; y: number; w: number; h: number };
  /** Cell indices (y * width + x) for irregular regions; omitted when the
   *  bounding box is exact. */
  cells?: number[];
  tags: MapRoomTag[];
}

export interface EncounterMap {
  id: string;
  name: string;
  width: number;
  height: number;
  environment: Environment;
  grid: MapCell[][];
  // The fields below arrived with the map overhaul — optional so maps
  // persisted before it (history, saved encounters) keep loading.
  seed?: number;
  rooms?: MapRoom[];
  genOptions?: {
    featureDensity: MapFeatureDensity;
    terrainVariety: MapTerrainVariety;
    roomCount?: number;
  };
}

/** A creature marker drawn on the battle map. */
export interface MapToken {
  /** 'party-N' for party slots, `${Monster.id}#${i}` for monster
   *  instances (the same ids the battle sim uses). */
  id: string;
  kind: 'party' | 'monster';
  name: string;
  /** 1–2 character initials shown inside the token. */
  label: string;
  /** Top-left cell of the footprint. */
  x: number;
  y: number;
  /** Footprint edge in cells: Tiny/Small/Medium 1, Large 2, Huge 3, Gargantuan 4. */
  sizeCells: 1 | 2 | 3 | 4;
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
  difficulty: EncounterAssessment;
  monsters: EncounterMonster[];
  map?: EncounterMap;
  totalXp: number;
  /** RNG seed that produced this encounter — replaying it (with the same
   *  monster pool) reproduces the encounter exactly. 0 = built manually. */
  seed: number;
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

// ─── XP Budget per character level (2024 DMG) ────────────────────
// "XP Budget per Character" from the 2024 Dungeon Master's Guide,
// chapter 4 (Creating Adventures → Combat Encounters). Multiply each
// character's row by their level and sum across the party. Unlike the
// 2014 thresholds, these are spending CAPS — an encounter's raw monster
// XP is compared directly against the budget with NO count multiplier.

export const XP_BUDGET_PER_CHARACTER: Record<number, Record<OfficialDifficulty, number>> = {
  1:  { Low: 50,   Moderate: 75,    High: 100   },
  2:  { Low: 100,  Moderate: 150,   High: 200   },
  3:  { Low: 150,  Moderate: 225,   High: 400   },
  4:  { Low: 250,  Moderate: 375,   High: 500   },
  5:  { Low: 500,  Moderate: 750,   High: 1100  },
  6:  { Low: 600,  Moderate: 1000,  High: 1400  },
  7:  { Low: 750,  Moderate: 1300,  High: 1700  },
  8:  { Low: 1000, Moderate: 1700,  High: 2100  },
  9:  { Low: 1300, Moderate: 2000,  High: 2600  },
  10: { Low: 1600, Moderate: 2300,  High: 3100  },
  11: { Low: 1900, Moderate: 2900,  High: 4100  },
  12: { Low: 2200, Moderate: 3700,  High: 4700  },
  13: { Low: 2600, Moderate: 4200,  High: 5400  },
  14: { Low: 2900, Moderate: 4900,  High: 6200  },
  15: { Low: 3300, Moderate: 5400,  High: 7800  },
  16: { Low: 3800, Moderate: 6100,  High: 9800  },
  17: { Low: 4500, Moderate: 7200,  High: 11700 },
  18: { Low: 5000, Moderate: 8700,  High: 14200 },
  19: { Low: 5500, Moderate: 10700, High: 17200 },
  20: { Low: 6400, Moderate: 13200, High: 22000 },
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

// ─── 5etools Import Types ────────────────────────────────────────

export interface FiveEToolsMonster {
  name: string;
  source: string;
  /** true = included in SRD 5.2.1 verbatim; a string = the SRD rename */
  srd52?: boolean | string;
  size?: string[];
  type?: string | { type: string; tags?: Array<string | { tag: string; prefix?: string }> };
  alignment?: Array<string | { alignment: string[] }>;
  ac?: Array<number | { ac: number; from?: string[] }>;
  hp?: { average?: number; formula?: string };
  speed?: Record<string, number | boolean | { number: number; condition: string }>;
  initiative?: { proficiency?: number } | number;
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
  /** e.g. { dex: "+3" } */
  save?: Partial<Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', string>>;
  /** e.g. { stealth: "+6" } — values can also be nested objects (ignored) */
  skill?: Record<string, unknown>;
  senses?: string[] | string;
  passive?: number | string;
  languages?: string[] | string;
  /** 2024 data uses xpLair; older data used a lair CR string */
  cr?: string | { cr: string; lair?: string; xpLair?: number };
  trait?: Array<{ name?: string; entries?: unknown }>;
  action?: Array<{ name?: string; entries?: unknown }>;
  bonus?: Array<{ name?: string; entries?: unknown }>;
  reaction?: Array<{ name?: string; entries?: unknown }>;
  legendary?: Array<{ name?: string; entries?: unknown }>;
  mythic?: Array<{ name?: string; entries?: unknown }>;
  lair?: unknown[];
  /** Structured spellcasting blocks (2024 format) */
  spellcasting?: unknown[];
  vulnerable?: unknown[];
  resist?: unknown[];
  immune?: unknown[];
  conditionImmune?: unknown[];
  gear?: unknown[];
  environment?: string[];
  [key: string]: unknown;
}

// Raw 5etools 2024 spell JSON shape (data/spells/spells-xphb.json).
export interface FiveEToolsSpellTime {
  number: number;
  unit: string;
  /** Reaction trigger, e.g. "which you take when you are hit by an attack roll" */
  condition?: string;
}

export interface FiveEToolsSpellRange {
  /** 'point' or a shape ('emanation', 'cone', 'sphere', 'cube', 'line', ...) */
  type: string;
  distance?: { type: string; amount?: number };
}

export interface FiveEToolsSpellDuration {
  type: string;
  duration?: { type: string; amount: number; upTo?: boolean };
  concentration?: boolean;
  ends?: string[];
}

export interface FiveEToolsSpellComponents {
  v?: boolean;
  s?: boolean;
  m?: string | true | { text: string; cost?: number; consume?: boolean | string };
}

export interface FiveEToolsSpell {
  name: string;
  source: string;
  /** true = included in SRD 5.2.1 verbatim; a string = the SRD rename */
  srd52?: boolean | string;
  level: number;
  /** School code: A/C/D/E/V/I/N/T */
  school: string;
  time: FiveEToolsSpellTime[];
  range: FiveEToolsSpellRange;
  components: FiveEToolsSpellComponents;
  duration: FiveEToolsSpellDuration[];
  entries: unknown[];
  entriesHigherLevel?: Array<{ name?: string; entries?: unknown }>;
  scalingLevelDice?:
    | { label?: string; scaling: Record<string, string> }
    | Array<{ label?: string; scaling: Record<string, string> }>;
  savingThrow?: string[];
  spellAttack?: string[];
  damageInflict?: string[];
  conditionInflict?: string[];
  areaTags?: string[];
  meta?: { ritual?: boolean };
  [key: string]: unknown;
}
