// ─── 5etools JSON → Internal Monster Converter ─────────────────
// Handles both the 2024-era tag-encoded format (XMM: "{@atkr m} {@hit 4},
// reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage") and the legacy
// 2014 prose format ("Melee Weapon Attack: +4 to hit, ..."). Used by the
// dev-time SRD import script AND the in-browser custom monster importer.

import type {
  Monster,
  FiveEToolsMonster,
  Size,
  CreatureType,
  Alignment,
  ArmorDetail,
  Speed,
  AbilityScores,
  SavingThrows,
  Skills,
  SpellcastingDetail,
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
  XMM: 'MM2024',
  XPHB: 'PHB2024',
  XDMG: 'DMG2024',
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

const ABILITY_NAMES: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

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
  any: 'Any',
};

// ─── Entry Flattening ───────────────────────────────────────────
// 5etools `entries` arrays mix strings with structured objects
// ({type:'list'}, {type:'entries'}, {type:'item'}). Flatten recursively —
// naive join() emits "[object Object]".

type RawEntry = string | { [key: string]: unknown };

export function entriesToText(entries: unknown): string {
  if (!Array.isArray(entries)) return typeof entries === 'string' ? entries : '';
  const lines: string[] = [];
  for (const entry of entries as RawEntry[]) {
    const text = entryToText(entry);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

function entryToText(entry: RawEntry): string {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return '';

  const name = typeof entry.name === 'string' ? entry.name : undefined;
  let body = '';

  if (Array.isArray(entry.items)) {
    body = (entry.items as RawEntry[]).map(entryToText).filter(Boolean).join('\n');
  } else if (Array.isArray(entry.entries)) {
    body = entriesToText(entry.entries);
  } else if (typeof entry.entry === 'string') {
    body = entry.entry;
  }

  return name && body ? `${name}: ${body}` : body || name || '';
}

// ─── 5etools Tag Rendering ──────────────────────────────────────
// Turns "{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2})
// Slashing damage" into readable prose. Order matters: specific tags
// first, then a generic pipe-display fallback for link-like tags.

const ATKR_LABEL: Record<string, string> = {
  m: 'Melee Attack Roll:',
  r: 'Ranged Attack Roll:',
  'm,r': 'Melee or Ranged Attack Roll:',
  'r,m': 'Melee or Ranged Attack Roll:',
};

/** Display text of a pipe-delimited 5etools tag body: {@tag a|b|c} → c ?? a */
function pipeDisplay(body: string): string {
  const parts = body.split('|');
  return (parts[2] ?? parts[0]).trim();
}

export function stripTags(text: string): string {
  let result = text;

  result = result
    .replace(/\{@atkr ([^}]+)\}/g, (_, codes: string) =>
      ATKR_LABEL[codes.replace(/\s/g, '')] ?? 'Attack Roll:')
    .replace(/\{@hit (-?\d+)([^}]*)\}/g, (_, n: string) => (n.startsWith('-') ? n : `+${n}`))
    .replace(/\{@h\}/g, 'Hit: ')
    .replace(/\{@hom\}/g, 'Hit or Miss: ')
    .replace(/\{@damage ([^}]+)\}/g, '$1')
    .replace(/\{@dice ([^}|]+)(\|[^}]*)?\}/g, '$1')
    .replace(/\{@scaledamage [^}|]+\|[^}|]+\|([^}]+)\}/g, '$1')
    .replace(/\{@dc (\d+)([^}]*)\}/g, 'DC $1')
    .replace(/\{@actSave (\w+)\}/g, (_, ab: string) =>
      `${ABILITY_NAMES[ab.toLowerCase()] ?? ab} Saving Throw:`)
    .replace(/\{@actSaveFailBy (\d+)\}/g, 'Failure by $1 or More:')
    .replace(/\{@actSaveFail( \d+)?\}/g, 'Failure:')
    .replace(/\{@actSaveSuccessOrFail\}/g, 'Failure or Success:')
    .replace(/\{@actSaveSuccess\}/g, 'Success:')
    .replace(/\{@actTrigger\}/g, 'Trigger:')
    .replace(/\{@actResponse( [^}]*)?\}/g, 'Response:')
    .replace(/\{@recharge (\d)\}/g, '(Recharge $1–6)')
    .replace(/\{@recharge\}/g, '(Recharge 6)');

  // Generic link-like tags: {@spell fireball|XPHB}, {@condition prone|XPHB|proned}...
  // Run repeatedly so single-level nesting resolves too.
  for (let i = 0; i < 4 && result.includes('{@'); i++) {
    result = result.replace(/\{@\w+ ([^{}]*)\}/g, (_, body: string) => pipeDisplay(body));
    result = result.replace(/\{@\w+\}/g, '');
  }

  return result;
}

// ─── Field Parsers ──────────────────────────────────────────────

function parseSize(raw: string[] | undefined): Size {
  if (!raw || raw.length === 0) return 'Medium';
  return SIZE_CODE[raw[0]] ?? 'Medium';
}

function parseCreatureType(raw: FiveEToolsMonster['type']): {
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

function parseAlignment(raw: FiveEToolsMonster['alignment']): Alignment {
  if (!raw || raw.length === 0) return 'Unaligned';

  const codes: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      codes.push(item);
    } else if (item && typeof item === 'object' && 'alignment' in item) {
      codes.push(...item.alignment);
    }
  }

  if (codes.length === 0) return 'Unaligned';

  if (codes.length === 1) {
    const c = codes[0];
    if (c === 'U') return 'Unaligned';
    if (c === 'A') return 'Any Alignment';
    if (c === 'N') return 'True Neutral';
  }

  if (codes.length === 2) {
    const [a, b] = codes;
    if (a === 'N' && b === 'N') return 'True Neutral';

    const first = ALIGNMENT_CODE[a];
    const second = ALIGNMENT_CODE[b];
    if (first && second) {
      return `${first} ${second}` as Alignment;
    }
  }

  return 'Unaligned';
}

function parseAC(raw: FiveEToolsMonster['ac']): ArmorDetail {
  if (!raw || raw.length === 0) return { ac: 10 };

  const first = raw[0];
  if (typeof first === 'number') {
    return { ac: first };
  }

  return {
    ac: first.ac,
    source: first.from ? first.from.map(stripTags).join(', ') : undefined,
  };
}

function parseHP(raw: FiveEToolsMonster['hp']): { hitPoints: number; hitDice: string } {
  return {
    hitPoints: raw?.average ?? 1,
    hitDice: raw?.formula ?? '1d4',
  };
}

function parseSpeed(raw: FiveEToolsMonster['speed']): Speed {
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
  if (raw.canHover === true || raw.hover === true) {
    speed.hover = true;
  }

  return speed;
}

function parseCR(raw: FiveEToolsMonster['cr']): { cr: number; hasLairCR: boolean } {
  if (raw === undefined) return { cr: 0, hasLairCR: false };

  let crStr: string;
  let hasLairCR = false;

  if (typeof raw === 'string') {
    crStr = raw;
  } else {
    crStr = raw.cr;
    // 2024 data uses xpLair; older data used a lair CR string.
    hasLairCR = raw.lair !== undefined || raw.xpLair !== undefined;
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
  const found = new Set<Environment>();
  for (const entry of raw) {
    const lower = entry.toLowerCase();
    // 2024 data has compound planar values: "planar, abyss", "planar, feywild"
    const key = lower.startsWith('planar') ? 'planar' : lower;
    const mapped = ENVIRONMENT_MAP[key];
    if (mapped) found.add(mapped);
  }
  return Array.from(found);
}

function parseSavingThrows(raw: FiveEToolsMonster['save']): SavingThrows | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const saves: SavingThrows = {};
  let any = false;
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
    const value = raw[key];
    if (typeof value === 'string') {
      const n = Number.parseInt(value.replace('+', ''), 10);
      if (!Number.isNaN(n)) {
        saves[key] = n;
        any = true;
      }
    }
  }
  return any ? saves : undefined;
}

function parseSkills(raw: FiveEToolsMonster['skill']): Skills | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const skills: Skills = {};
  let any = false;
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue; // skip nested "other"/"oneOf" forms
    const n = Number.parseInt(value.replace('+', ''), 10);
    if (Number.isNaN(n)) continue;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    skills[label] = n;
    any = true;
  }
  return any ? skills : undefined;
}

// ─── Spellcasting ───────────────────────────────────────────────

interface RawSpellcasting {
  name?: string;
  ability?: string;
  headerEntries?: unknown;
  will?: unknown;
  daily?: Record<string, unknown>;
  spells?: Record<string, { spells?: unknown }>;
}

function toSpellList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => (typeof s === 'string' ? stripTags(s) : entryToText(s as RawEntry)))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseSpellcastingBlock(raw: unknown): SpellcastingDetail | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const block = raw[0] as RawSpellcasting;
  if (!block || typeof block !== 'object') return undefined;

  const header = entriesToText(block.headerEntries);
  const dcMatch = header.match(/\{@dc (\d+)\}/) ?? stripTags(header).match(/DC (\d+)/);
  const hitMatch = header.match(/\{@hit (-?\d+)[^}]*\}/);

  const ability = (['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).find(
    (a) => a === (block.ability ?? '').toLowerCase(),
  ) ?? 'int';

  const detail: SpellcastingDetail = { ability: ability as keyof AbilityScores };
  if (dcMatch) detail.dc = Number.parseInt(dcMatch[1], 10);
  if (hitMatch) detail.attackBonus = Number.parseInt(hitMatch[1], 10);

  const atWill = toSpellList(block.will);
  if (atWill.length > 0) detail.atWill = atWill;

  if (block.daily && typeof block.daily === 'object') {
    const perDay: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(block.daily)) {
      const spells = toSpellList(value);
      if (spells.length > 0) perDay[key.replace(/e$/, '')] = spells; // "1e" → "1"
    }
    if (Object.keys(perDay).length > 0) detail.perDay = perDay;
  }

  if (block.spells && typeof block.spells === 'object') {
    const slots: Record<string, string[]> = {};
    for (const [level, group] of Object.entries(block.spells)) {
      const spells = toSpellList(group?.spells);
      if (spells.length > 0) slots[level] = spells;
    }
    if (Object.keys(slots).length > 0) detail.slots = slots;
  }

  return detail;
}

// ─── Action Parsing ─────────────────────────────────────────────

function extractDamageTypes(strippedText: string): DamageType[] {
  const lower = strippedText.toLowerCase();
  const found: DamageType[] = [];
  for (const dt of DAMAGE_TYPE_KEYWORDS) {
    const dtLower = dt.toLowerCase();
    const pattern = new RegExp(`(?:\\d+d\\d+(?:\\s*[+\\-]\\s*\\d+)?\\s+)?${dtLower}(?:\\s+damage)?`, 'i');
    if (pattern.test(lower)) {
      found.push(dt);
    }
  }
  return found;
}

function extractAttackInfo(rawText: string, strippedText: string): {
  deliveries: AttackDelivery[];
  type?: AttackType;
  bonus?: number;
  reach?: number;
  range?: number;
  longRange?: number;
} {
  const info: ReturnType<typeof extractAttackInfo> = { deliveries: [] };

  // 2024 tag format: {@atkr m}, {@atkr r}, {@atkr m,r}
  const atkrMatches = Array.from(rawText.matchAll(/\{@atkr ([^}]+)\}/g));
  for (const match of atkrMatches) {
    const codes = match[1].replace(/\s/g, '').split(',');
    if (codes.includes('m') && !info.deliveries.includes('Melee')) info.deliveries.push('Melee');
    if (codes.includes('r') && !info.deliveries.includes('Ranged')) info.deliveries.push('Ranged');
  }

  const hitMatch = rawText.match(/\{@hit (-?\d+)[^}]*\}/);
  if (hitMatch) {
    info.bonus = Number.parseInt(hitMatch[1], 10);
  }

  // Legacy 2014 prose format (also covers hand-authored custom uploads)
  if (info.deliveries.length === 0) {
    const attackMatch = strippedText.match(/(Melee|Ranged)(?:\s+or\s+(?:Melee|Ranged))?\s+(Weapon|Spell)?\s*Attack/i);
    if (attackMatch) {
      const isBoth = /Melee\s+or\s+Ranged|Ranged\s+or\s+Melee/i.test(strippedText);
      if (isBoth) {
        info.deliveries.push('Melee', 'Ranged');
      } else {
        info.deliveries.push(
          (attackMatch[1].charAt(0).toUpperCase() + attackMatch[1].slice(1).toLowerCase()) as AttackDelivery,
        );
      }
      if (attackMatch[2]) {
        info.type = (attackMatch[2].charAt(0).toUpperCase() + attackMatch[2].slice(1).toLowerCase()) as AttackType;
      }
    }
  }

  if (info.bonus === undefined) {
    const bonusMatch = strippedText.match(/([+-]\d+)\s+to\s+hit/i);
    if (bonusMatch) {
      info.bonus = Number.parseInt(bonusMatch[1], 10);
    }
  }

  const reachMatch = strippedText.match(/reach\s+(\d+)\s*ft/i);
  if (reachMatch) {
    info.reach = Number.parseInt(reachMatch[1], 10);
  }

  const rangeMatch = strippedText.match(/range\s+(\d+)(?:\/(\d+))?\s*ft/i);
  if (rangeMatch) {
    info.range = Number.parseInt(rangeMatch[1], 10);
    if (rangeMatch[2]) {
      info.longRange = Number.parseInt(rangeMatch[2], 10);
    }
  }

  return info;
}

function extractDamageDice(strippedText: string): { dice?: string; avg?: number } {
  // "10 (2d6 + 3)" — the universal average-then-dice notation
  const diceMatch = strippedText.match(/(\d+)\s*\((\d+d\d+(?:\s*[+\-]\s*\d+)?)\)/);
  if (diceMatch) {
    return { avg: Number.parseInt(diceMatch[1], 10), dice: diceMatch[2].replace(/\s+/g, '') };
  }

  const simpleDice = strippedText.match(/(\d+d\d+(?:\s*[+\-]\s*\d+)?)\s+(?:acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)/i);
  if (simpleDice) {
    return { dice: simpleDice[1].replace(/\s+/g, '') };
  }

  return {};
}

interface RawNamedEntry {
  name?: string;
  entries?: unknown;
}

function parseActionEntry(entry: RawNamedEntry): MonsterAction {
  const rawText = entriesToText(entry.entries);
  const strippedText = stripTags(rawText);
  const attackInfo = extractAttackInfo(rawText, strippedText);
  const damageTypes = extractDamageTypes(strippedText);
  const { dice, avg } = extractDamageDice(strippedText);

  const action: MonsterAction = {
    name: stripTags(entry.name ?? 'Unnamed'),
    description: strippedText,
  };

  if (attackInfo.deliveries.length > 0) action.attackDelivery = attackInfo.deliveries[0];
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

function parseActions(raw: unknown): MonsterAction[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return (raw as RawNamedEntry[]).map(parseActionEntry);
}

/** All delivery modes across an action's raw text (an action can be both). */
function actionDeliveries(rawEntry: RawNamedEntry): AttackDelivery[] {
  const rawText = entriesToText(rawEntry.entries);
  return extractAttackInfo(rawText, stripTags(rawText)).deliveries;
}

// ─── Tag Extraction ─────────────────────────────────────────────

const TAG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /pack tactics/i, tag: 'pack tactics' },
  { pattern: /ambush/i, tag: 'ambusher' },
  { pattern: /sneak attack/i, tag: 'sneak attack' },
  { pattern: /multiattack/i, tag: 'multiattack' },
  { pattern: /swallow/i, tag: 'swallow' },
  { pattern: /frighten(?:ing|ed)?/i, tag: 'frightening' },
  { pattern: /grappl(?:e|ing|ed)/i, tag: 'grappler' },
  { pattern: /shapechang/i, tag: 'shapechanger' },
  { pattern: /regenerat/i, tag: 'regeneration' },
  { pattern: /magic resistance/i, tag: 'magic resistance' },
  { pattern: /innate spellcasting/i, tag: 'innate spellcasting' },
  { pattern: /tunnel/i, tag: 'tunneler' },
  { pattern: /web\b/i, tag: 'web' },
  { pattern: /breath weapon|breath \(recharge|breath\./i, tag: 'breath weapon' },
  { pattern: /charm/i, tag: 'charmer' },
  { pattern: /telepathy/i, tag: 'telepathy' },
];

function extractTags(allActions: MonsterAction[], traits: MonsterAction[], speed: Speed): string[] {
  const tags = new Set<string>();
  const allText = [...allActions, ...traits].map(a => `${a.name} ${a.description}`).join(' ');

  for (const { pattern, tag } of TAG_PATTERNS) {
    if (pattern.test(allText)) {
      tags.add(tag);
    }
  }

  if (speed.fly) tags.add('flyer');

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

/**
 * Recompute the derived filter fields from a monster's own data. Used for
 * native-JSON custom imports where the uploader may have omitted them.
 */
export function computeDerivedFields(monster: Monster): Monster {
  const allActionGroups = [
    monster.actions,
    monster.bonusActions ?? [],
    monster.reactions ?? [],
    monster.specialAbilities ?? [],
    monster.legendary?.actions ?? [],
  ];
  const deliveries = new Set<AttackDelivery>();
  for (const group of allActionGroups) {
    for (const action of group) {
      if (action.attackDelivery) deliveries.add(action.attackDelivery);
    }
  }
  return {
    ...monster,
    movementModes: computeMovementModes(monster.speed),
    attackDamageTypes: collectAttackDamageTypes(allActionGroups),
    attackDeliveryModes: Array.from(deliveries),
    tags: monster.tags.length > 0
      ? monster.tags
      : extractTags(
          allActionGroups.flat(),
          monster.specialAbilities ?? [],
          monster.speed,
        ),
  };
}

// ─── Ids ────────────────────────────────────────────────────────

export function slugifyMonsterName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Main Converter ─────────────────────────────────────────────

export interface ConvertOptions {
  /** Prepended to the slug id, e.g. 'custom-' for user uploads. */
  idPrefix?: string;
  /** Override the source book, e.g. 'SRD52' for the SRD import script. */
  forceSource?: SourceBook;
}

export function convert5eToolsMonster(raw: FiveEToolsMonster, opts: ConvertOptions = {}): Monster {
  const { type: creatureType, subtype } = parseCreatureType(raw.type);
  const alignment = parseAlignment(raw.alignment);
  const armor = parseAC(raw.ac);
  const { hitPoints, hitDice } = parseHP(raw.hp);
  const speed = parseSpeed(raw.speed);
  const { cr, hasLairCR } = parseCR(raw.cr);
  const source = opts.forceSource ?? parseSource(raw.source);
  const environments = parseEnvironments(raw.environment);

  // An srd52 string value is the monster's SRD name (a rename).
  const name = typeof raw.srd52 === 'string' ? raw.srd52 : raw.name;

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

  // Spellcasting: 2024 data carries a structured top-level array; the text
  // heuristic remains as a fallback for legacy/custom data.
  const spellcasting = parseSpellcastingBlock(raw.spellcasting);
  const hasSpellcasting = spellcasting !== undefined
    || /spellcasting/i.test([...specialAbilities, ...actions].map(a => a.name).join(' '));

  // Compute derived fields
  const allActionGroups = [actions, bonusActions, reactions, specialAbilities, legendaryActions];
  const movementModes = computeMovementModes(speed);
  const attackDamageTypes = collectAttackDamageTypes(allActionGroups);
  const deliverySet = new Set<AttackDelivery>();
  for (const group of [raw.action, raw.bonus, raw.reaction, raw.legendary]) {
    if (!Array.isArray(group)) continue;
    for (const entry of group as RawNamedEntry[]) {
      for (const d of actionDeliveries(entry)) deliverySet.add(d);
    }
  }
  const attackDeliveryModes = Array.from(deliverySet);
  const isLegendary = legendaryActions.length > 0;
  const isMythic = Array.isArray(raw.mythic) && raw.mythic.length > 0;
  const hasLair = hasLairCR || (Array.isArray(raw.lair) && (raw.lair as unknown[]).length > 0);

  const tags = extractTags(
    [...actions, ...bonusActions, ...reactions, ...legendaryActions],
    specialAbilities,
    speed,
  );

  const senses = parseSenses(raw);
  const languages = parseLanguages(raw);

  const damageVulnerabilities = parseDamageList(raw.vulnerable);
  const damageResistances = parseDamageList(raw.resist);
  const damageImmunities = parseDamageList(raw.immune);
  const conditionImmunities = parseConditionList(raw.conditionImmune);

  const savingThrows = parseSavingThrows(raw.save);
  const skills = parseSkills(raw.skill);

  const monster: Monster = {
    id: `${opts.idPrefix ?? ''}${slugifyMonsterName(name)}`,
    name,
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
  if (savingThrows) monster.savingThrows = savingThrows;
  if (skills) monster.skills = skills;
  if (spellcasting) monster.spellcasting = spellcasting;
  if (specialAbilities.length > 0) monster.specialAbilities = specialAbilities;
  if (bonusActions.length > 0) monster.bonusActions = bonusActions;
  if (reactions.length > 0) monster.reactions = reactions;
  if (legendary) monster.legendary = legendary;
  if (isMythic) monster.mythic = parseActions(raw.mythic);

  return monster;
}

// ─── Senses & Languages ────────────────────────────────────────

function parseSenses(raw: FiveEToolsMonster): string[] {
  const senses: string[] = [];
  if (Array.isArray(raw.senses)) {
    for (const s of raw.senses) {
      if (typeof s === 'string') senses.push(stripTags(s));
    }
  } else if (typeof raw.senses === 'string') {
    senses.push(stripTags(raw.senses));
  }

  if (typeof raw.passive === 'number') {
    senses.push(`passive Perception ${raw.passive}`);
  }

  return senses;
}

function parseLanguages(raw: FiveEToolsMonster): string[] {
  if (Array.isArray(raw.languages)) {
    return raw.languages
      .filter((l): l is string => typeof l === 'string')
      .map(stripTags);
  }
  if (typeof raw.languages === 'string') {
    return raw.languages.split(',').map(l => stripTags(l).trim()).filter(Boolean);
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
        // Nested forms: { resist: [...], note } / { special: "..." }
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

function normalizeCondition(c: string): Condition | undefined {
  const normalized = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  return VALID_CONDITIONS.includes(normalized) ? (normalized as Condition) : undefined;
}

function parseConditionList(raw: unknown): Condition[] {
  if (!raw || !Array.isArray(raw)) return [];

  const results = new Set<Condition>();
  for (const item of raw) {
    if (typeof item === 'string') {
      const matched = normalizeCondition(item);
      if (matched) results.add(matched);
    } else if (item && typeof item === 'object') {
      // { conditionImmune: ["charmed", ...], note: "...", cond: true }
      const nested = (item as Record<string, unknown>).conditionImmune;
      if (Array.isArray(nested)) {
        for (const sub of nested) {
          if (typeof sub === 'string') {
            const matched = normalizeCondition(sub);
            if (matched) results.add(matched);
          }
        }
      }
    }
  }
  return Array.from(results);
}

// ─── Batch Import ───────────────────────────────────────────────

export function import5eToolsBestiary(
  json: { monster: FiveEToolsMonster[] },
  opts: ConvertOptions = {},
): Monster[] {
  if (!json || !Array.isArray(json.monster)) return [];
  return json.monster.map((m) => convert5eToolsMonster(m, opts));
}
