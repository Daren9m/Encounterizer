// ─── 5etools JSON → Internal Monster Converter ─────────────────
import { v4 } from 'uuid';
import type {
  Monster,
  FiveEToolsMonster,
  Size,
  CreatureType,
  Alignment,
  ArmorDetail,
  Speed,
  AbilityScores,
  Environment,
  MonsterAction,
  LegendaryDetail,
  DamageType,
  AttackDelivery,
  AttackType,
  Condition,
  MovementMode,
  SourceBook,
} from './types';
import { CR_XP, CR_PROF } from './types';

// ─── Lookup Tables ──────────────────────────────────────────────

const SIZE_CODE: Record<string, Size> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

const ALIGNMENT_CODE: Record<string, string> = {
  L: 'Lawful',
  N: 'Neutral',
  C: 'Chaotic',
  G: 'Good',
  E: 'Evil',
  U: 'Unaligned',
  A: 'Any Alignment',
};

const SOURCE_MAP: Record<string, SourceBook> = {
  MM: 'MM2014',
  'MM2024': 'MM2024',
  MPMM: 'MPMM',
  VGM: 'VGM',
  MTF: 'MTF',
  FTD: 'FTD',
  PHB: 'PHB2024',
  'PHB2024': 'PHB2024',
  DMG: 'DMG2024',
  'DMG2024': 'DMG2024',
};

const CREATURE_TYPES: Set<string> = new Set([
  'aberration', 'beast', 'celestial', 'construct', 'dragon',
  'elemental', 'fey', 'fiend', 'giant', 'humanoid',
  'monstrosity', 'ooze', 'plant', 'undead',
]);

const DAMAGE_TYPE_KEYWORDS: DamageType[] = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force',
  'Lightning', 'Necrotic', 'Piercing', 'Poison',
  'Psychic', 'Radiant', 'Slashing', 'Thunder',
];

const ENVIRONMENT_MAP: Record<string, Environment> = {
  arctic: 'Arctic',
  coastal: 'Coastal',
  desert: 'Desert',
  forest: 'Forest',
  grassland: 'Grassland',
  hill: 'Hill',
  mountain: 'Mountain',
  swamp: 'Swamp',
  underdark: 'Underdark',
  underwater: 'Underwater',
  urban: 'Urban',
  planar: 'Planar',
};

// ─── Helpers ────────────────────────────────────────────────────

function parseSize(raw: string[] | undefined): Size {
  if (!raw || raw.length === 0) return 'Medium';
  return SIZE_CODE[raw[0]] ?? 'Medium';
}

function parseCreatureType(raw: string | { type: string; tags?: string[] } | undefined): {
  type: CreatureType;
  subtype?: string;
} {
  if (!raw) return { type: 'Monstrosity' };

  let typeStr: string;
  let subtype: string | undefined;

  if (typeof raw === 'string') {
    typeStr = raw;
  } else {
    typeStr = raw.type;
    if (raw.tags && raw.tags.length > 0) {
      // Tags can be strings or objects; grab string tags for subtype
      subtype = raw.tags
        .filter((t): t is string => typeof t === 'string')
        .join(', ');
    }
  }

  const normalized = typeStr.toLowerCase().trim();
  if (CREATURE_TYPES.has(normalized)) {
    const capitalized = (normalized.charAt(0).toUpperCase() + normalized.slice(1)) as CreatureType;
    return { type: capitalized, subtype };
  }

  return { type: 'Monstrosity', subtype: subtype ?? typeStr };
}

function parseAlignment(raw: Array<string | { alignment: string[] }> | undefined): Alignment {
  if (!raw || raw.length === 0) return 'Unaligned';

  // Flatten to string codes
  const codes: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      codes.push(item);
    } else if (item && typeof item === 'object' && 'alignment' in item) {
      codes.push(...item.alignment);
    }
  }

  if (codes.length === 0) return 'Unaligned';

  // Single code shortcuts
  if (codes.length === 1) {
    const c = codes[0];
    if (c === 'U') return 'Unaligned';
    if (c === 'A') return 'Any Alignment';
    if (c === 'N') return 'True Neutral';
  }

  // Two-code alignments
  if (codes.length === 2) {
    const [a, b] = codes;
    if (a === 'N' && b === 'N') return 'True Neutral';

    const first = ALIGNMENT_CODE[a];
    const second = ALIGNMENT_CODE[b];
    if (first && second) {
      const combined = `${first} ${second}` as Alignment;
      return combined;
    }
  }

  // Fallback: try to build something reasonable
  return 'Unaligned';
}

function parseAC(raw: Array<number | { ac: number; from?: string[] }> | undefined): ArmorDetail {
  if (!raw || raw.length === 0) return { ac: 10 };

  const first = raw[0];
  if (typeof first === 'number') {
    return { ac: first };
  }

  return {
    ac: first.ac,
    source: first.from ? first.from.join(', ') : undefined,
  };
}

function parseHP(raw: { average?: number; formula?: string } | undefined): {
  hitPoints: number;
  hitDice: string;
} {
  return {
    hitPoints: raw?.average ?? 1,
    hitDice: raw?.formula ?? '1d4',
  };
}

function parseSpeed(raw: Record<string, number | boolean | { number: number; condition: string }> | undefined): Speed {
  if (!raw) return {};

  const speed: Speed = {};

  const extractNum = (val: number | boolean | { number: number; condition: string }): number | undefined => {
    if (typeof val === 'number') return val;
    if (typeof val === 'object' && 'number' in val) return val.number;
    return undefined;
  };

  if (raw.walk !== undefined) {
    const v = extractNum(raw.walk);
    if (v !== undefined) speed.walk = v;
  }
  if (raw.fly !== undefined) {
    const v = extractNum(raw.fly);
    if (v !== undefined) speed.fly = v;
  }
  if (raw.swim !== undefined) {
    const v = extractNum(raw.swim);
    if (v !== undefined) speed.swim = v;
  }
  if (raw.burrow !== undefined) {
    const v = extractNum(raw.burrow);
    if (v !== undefined) speed.burrow = v;
  }
  if (raw.climb !== undefined) {
    const v = extractNum(raw.climb);
    if (v !== undefined) speed.climb = v;
  }
  if (raw.hover === true) {
    speed.hover = true;
  }

  return speed;
}

function parseCR(raw: string | { cr: string; lair?: string } | undefined): {
  cr: number;
  hasLairCR: boolean;
} {
  if (raw === undefined) return { cr: 0, hasLairCR: false };

  let crStr: string;
  let hasLairCR = false;

  if (typeof raw === 'string') {
    crStr = raw;
  } else {
    crStr = raw.cr;
    hasLairCR = raw.lair !== undefined;
  }

  return { cr: crStringToNumber(crStr), hasLairCR };
}

function crStringToNumber(cr: string): number {
  if (cr.includes('/')) {
    const [num, den] = cr.split('/').map(Number);
    return num / den;
  }
  return Number(cr) || 0;
}

function parseSource(raw: string | undefined): SourceBook {
  if (!raw) return 'Custom';
  return SOURCE_MAP[raw] ?? 'Custom';
}

function parseEnvironments(raw: string[] | undefined): Environment[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .map(e => ENVIRONMENT_MAP[e.toLowerCase()])
    .filter((e): e is Environment => e !== undefined);
}

// ─── Action Parsing ─────────────────────────────────────────────

function extractDamageTypes(text: string): DamageType[] {
  const lower = text.toLowerCase();
  const found: DamageType[] = [];
  for (const dt of DAMAGE_TYPE_KEYWORDS) {
    // Match patterns like "fire damage", "1d6 slashing", "2d8 + 4 piercing damage"
    const dtLower = dt.toLowerCase();
    const pattern = new RegExp(`(?:\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?\\s+)?${dtLower}(?:\\s+damage)?`, 'i');
    if (pattern.test(lower)) {
      found.push(dt);
    }
  }
  return found;
}

function extractAttackInfo(text: string): {
  delivery?: AttackDelivery;
  type?: AttackType;
  bonus?: number;
  reach?: number;
  range?: number;
  longRange?: number;
} {
  const info: {
    delivery?: AttackDelivery;
    type?: AttackType;
    bonus?: number;
    reach?: number;
    range?: number;
    longRange?: number;
  } = {};

  // Match "Melee Weapon Attack", "Ranged Spell Attack", etc.
  const attackMatch = text.match(/(Melee|Ranged)\s+(Weapon|Spell)\s+Attack/i);
  if (attackMatch) {
    info.delivery = attackMatch[1].charAt(0).toUpperCase() + attackMatch[1].slice(1).toLowerCase() as AttackDelivery;
    info.type = attackMatch[2].charAt(0).toUpperCase() + attackMatch[2].slice(1).toLowerCase() as AttackType;
  }

  // Attack bonus
  const bonusMatch = text.match(/([+-]\d+)\s+to\s+hit/i);
  if (bonusMatch) {
    info.bonus = parseInt(bonusMatch[1], 10);
  }

  // Reach
  const reachMatch = text.match(/reach\s+(\d+)\s*ft/i);
  if (reachMatch) {
    info.reach = parseInt(reachMatch[1], 10);
  }

  // Range (normal/long)
  const rangeMatch = text.match(/range\s+(\d+)(?:\/(\d+))?\s*ft/i);
  if (rangeMatch) {
    info.range = parseInt(rangeMatch[1], 10);
    if (rangeMatch[2]) {
      info.longRange = parseInt(rangeMatch[2], 10);
    }
  }

  return info;
}

function extractDamageDice(text: string): { dice?: string; avg?: number } {
  // Match patterns like "10 (2d6 + 3)" or just "2d6 + 3"
  const diceMatch = text.match(/(\d+)\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)/);
  if (diceMatch) {
    return { avg: parseInt(diceMatch[1], 10), dice: diceMatch[2].replace(/\s+/g, '') };
  }

  const simpleDice = text.match(/(\d+d\d+(?:\s*[+\-]\s*\d+)?)\s+(?:acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)/i);
  if (simpleDice) {
    return { dice: simpleDice[1].replace(/\s+/g, '') };
  }

  return {};
}

function parseActionEntry(entry: { name: string; entries: string[] }): MonsterAction {
  const description = entry.entries.join('\n');
  const attackInfo = extractAttackInfo(description);
  const damageTypes = extractDamageTypes(description);
  const { dice, avg } = extractDamageDice(description);

  const action: MonsterAction = {
    name: entry.name,
    description,
  };

  if (attackInfo.delivery) action.attackDelivery = attackInfo.delivery;
  if (attackInfo.type) action.attackType = attackInfo.type;
  if (attackInfo.bonus !== undefined) action.attackBonus = attackInfo.bonus;
  if (attackInfo.reach) action.reach = attackInfo.reach;
  if (attackInfo.range) action.range = attackInfo.range;
  if (attackInfo.longRange) action.longRange = attackInfo.longRange;
  if (damageTypes.length > 0) action.damageTypes = damageTypes;
  if (dice) action.damageDice = dice;
  if (avg) action.damageAvg = avg;

  return action;
}

function parseActions(raw: Array<{ name: string; entries: string[] }> | undefined): MonsterAction[] {
  if (!raw || raw.length === 0) return [];
  return raw.map(parseActionEntry);
}

// ─── Tag Extraction ─────────────────────────────────────────────

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /pack tactics/i, tag: 'pack tactics' },
  { pattern: /ambush/i, tag: 'ambusher' },
  { pattern: /sneak attack/i, tag: 'sneak attack' },
  { pattern: /multiattack/i, tag: 'multiattack' },
  { pattern: /swallow/i, tag: 'swallow' },
  { pattern: /frighten(?:ing|ed)?/i, tag: 'frightening' },
  { pattern: /grappl(?:e|ing)/i, tag: 'grappler' },
  { pattern: /shapechang/i, tag: 'shapechanger' },
  { pattern: /regenerat/i, tag: 'regeneration' },
  { pattern: /magic resistance/i, tag: 'magic resistance' },
  { pattern: /innate spellcasting/i, tag: 'innate spellcasting' },
  { pattern: /tunnel/i, tag: 'tunneler' },
  { pattern: /web\b/i, tag: 'web' },
  { pattern: /breath weapon/i, tag: 'breath weapon' },
  { pattern: /charm/i, tag: 'charmer' },
  { pattern: /telepathy/i, tag: 'telepathy' },
  { pattern: /flying|fly speed/i, tag: 'flyer' },
];

function extractTags(allActions: MonsterAction[], traits: MonsterAction[]): string[] {
  const tags = new Set<string>();
  const allText = [...allActions, ...traits].map(a => a.description).join(' ');

  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(allText)) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

// ─── Computed Fields ────────────────────────────────────────────

function computeMovementModes(speed: Speed): MovementMode[] {
  const modes: MovementMode[] = [];
  if (speed.walk) modes.push('Walk');
  if (speed.fly) modes.push('Fly');
  if (speed.swim) modes.push('Swim');
  if (speed.burrow) modes.push('Burrow');
  if (speed.climb) modes.push('Climb');
  if (speed.hover) modes.push('Hover');
  return modes;
}

function collectAttackDamageTypes(actionGroups: MonsterAction[][]): DamageType[] {
  const types = new Set<DamageType>();
  for (const group of actionGroups) {
    for (const action of group) {
      if (action.damageTypes) {
        for (const dt of action.damageTypes) {
          types.add(dt);
        }
      }
    }
  }
  return Array.from(types);
}

function collectAttackDeliveryModes(actionGroups: MonsterAction[][]): AttackDelivery[] {
  const modes = new Set<AttackDelivery>();
  for (const group of actionGroups) {
    for (const action of group) {
      if (action.attackDelivery) {
        modes.add(action.attackDelivery);
      }
    }
  }
  return Array.from(modes);
}

function detectSpellcasting(traits: MonsterAction[], actions: MonsterAction[]): boolean {
  const allText = [...traits, ...actions].map(a => `${a.name} ${a.description}`).join(' ');
  return /spellcasting|innate spellcasting|spells/i.test(allText);
}

// ─── Main Converter ─────────────────────────────────────────────

export function convert5eToolsMonster(raw: FiveEToolsMonster): Monster {
  const { type: creatureType, subtype } = parseCreatureType(raw.type);
  const alignment = parseAlignment(raw.alignment);
  const armor = parseAC(raw.ac);
  const { hitPoints, hitDice } = parseHP(raw.hp);
  const speed = parseSpeed(raw.speed);
  const { cr, hasLairCR } = parseCR(raw.cr);
  const source = parseSource(raw.source);
  const environments = parseEnvironments(raw.environment);

  const abilities: AbilityScores = {
    str: raw.str ?? 10,
    dex: raw.dex ?? 10,
    con: raw.con ?? 10,
    int: raw.int ?? 10,
    wis: raw.wis ?? 10,
    cha: raw.cha ?? 10,
  };

  // Parse all action categories
  const specialAbilities = parseActions(raw.trait);
  const actions = parseActions(raw.action);
  const bonusActions = parseActions(raw.bonus);
  const reactions = parseActions(raw.reaction);
  const legendaryActions = parseActions(raw.legendary);

  // Legendary detail
  let legendary: LegendaryDetail | undefined;
  if (legendaryActions.length > 0) {
    legendary = {
      description: 'The creature can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature\'s turn. The creature regains spent legendary actions at the start of its turn.',
      actions: legendaryActions,
      actionsPerRound: 3,
    };
  }

  // Compute derived fields
  const allActionGroups = [actions, bonusActions, reactions, specialAbilities, legendaryActions];
  const movementModes = computeMovementModes(speed);
  const attackDamageTypes = collectAttackDamageTypes(allActionGroups);
  const attackDeliveryModes = collectAttackDeliveryModes(allActionGroups);
  const isLegendary = legendaryActions.length > 0;
  const isMythic = Array.isArray(raw.mythic) && raw.mythic.length > 0;
  const hasLair = hasLairCR || (Array.isArray(raw.lair) && raw.lair.length > 0);
  const hasSpellcasting = detectSpellcasting(specialAbilities, actions);

  const tags = extractTags(
    [...actions, ...bonusActions, ...reactions, ...legendaryActions],
    specialAbilities,
  );

  // Senses and languages (stored as unknown keys on the raw object)
  const senses = parseSenses(raw);
  const languages = parseLanguages(raw);

  // Damage/condition relations
  const damageVulnerabilities = parseDamageList(raw.vulnerable as unknown);
  const damageResistances = parseDamageList(raw.resist as unknown);
  const damageImmunities = parseDamageList(raw.immune as unknown);
  const conditionImmunities = parseConditionList(raw.conditionImmune as unknown);

  const monster: Monster = {
    id: v4(),
    name: raw.name,
    source,
    size: parseSize(raw.size),
    type: creatureType,
    alignment,
    armor,
    hitPoints,
    hitDice,
    speed,
    abilities,
    senses,
    languages,
    challengeRating: cr,
    proficiencyBonus: CR_PROF[cr] ?? 2,
    xp: CR_XP[cr] ?? 0,
    damageVulnerabilities,
    damageResistances,
    damageImmunities,
    conditionImmunities,
    actions,
    environments,
    isLegendary,
    isMythic,
    hasLair,
    hasSpellcasting,
    movementModes,
    attackDamageTypes,
    attackDeliveryModes,
    tags,
  };

  if (subtype) monster.subtype = subtype;
  if (specialAbilities.length > 0) monster.specialAbilities = specialAbilities;
  if (bonusActions.length > 0) monster.bonusActions = bonusActions;
  if (reactions.length > 0) monster.reactions = reactions;
  if (legendary) monster.legendary = legendary;
  if (isMythic) monster.mythic = parseActions(raw.mythic as Array<{ name: string; entries: string[] }>);

  return monster;
}

// ─── Senses & Languages ────────────────────────────────────────

function parseSenses(raw: FiveEToolsMonster): string[] {
  const senses: string[] = [];
  const rawSenses = raw.senses as unknown;
  if (Array.isArray(rawSenses)) {
    for (const s of rawSenses) {
      if (typeof s === 'string') senses.push(s);
    }
  } else if (typeof rawSenses === 'string') {
    senses.push(rawSenses);
  }

  // 5etools also stores passive perception separately
  const passive = raw.passive as unknown;
  if (typeof passive === 'number') {
    senses.push(`passive Perception ${passive}`);
  }

  return senses;
}

function parseLanguages(raw: FiveEToolsMonster): string[] {
  const rawLangs = raw.languages as unknown;
  if (Array.isArray(rawLangs)) {
    return rawLangs.filter((l): l is string => typeof l === 'string');
  }
  if (typeof rawLangs === 'string') {
    return rawLangs.split(',').map(l => l.trim()).filter(Boolean);
  }
  return [];
}

// ─── Damage & Condition List Parsing ────────────────────────────

function parseDamageList(raw: unknown): DamageType[] {
  if (!raw) return [];

  const results = new Set<DamageType>();

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const matched = matchDamageType(item);
        if (matched) results.add(matched);
      } else if (typeof item === 'object' && item !== null) {
        // 5etools uses objects like { resist: ["fire", "cold"], note: "..." }
        const nested = (item as Record<string, unknown>).resist
          ?? (item as Record<string, unknown>).immune
          ?? (item as Record<string, unknown>).vulnerable;
        if (Array.isArray(nested)) {
          for (const sub of nested) {
            if (typeof sub === 'string') {
              const matched = matchDamageType(sub);
              if (matched) results.add(matched);
            }
          }
        }
      }
    }
  }

  return Array.from(results);
}

function matchDamageType(str: string): DamageType | undefined {
  const lower = str.toLowerCase().trim();
  for (const dt of DAMAGE_TYPE_KEYWORDS) {
    if (dt.toLowerCase() === lower) return dt;
  }
  return undefined;
}

const VALID_CONDITIONS: readonly string[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion',
  'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
] as const;

function parseConditionList(raw: unknown): Condition[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .filter((c): c is string => typeof c === 'string')
      .map(c => c.charAt(0).toUpperCase() + c.slice(1).toLowerCase())
      .filter((c): c is Condition => VALID_CONDITIONS.includes(c));
  }
  return [];
}

// ─── Batch Import ───────────────────────────────────────────────

export function import5eToolsBestiary(json: { monster: FiveEToolsMonster[] }): Monster[] {
  if (!json || !Array.isArray(json.monster)) return [];
  return json.monster.map(convert5eToolsMonster);
}
