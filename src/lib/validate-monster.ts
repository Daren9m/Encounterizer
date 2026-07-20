// ─── Custom Monster Validation ───────────────────────────────────
// Normalizes untrusted JSON into a valid Monster or explains why it can't.
// Philosophy: strict about the fields the app's math depends on (name, CR,
// HP, AC, abilities), forgiving about everything else — hand-authored JSON
// shouldn't fight the validator over optional flavor fields.

import type {
  AbilityScores,
  Alignment,
  Condition,
  CreatureType,
  DamageType,
  Environment,
  Monster,
  MonsterAction,
  Size,
} from './types';
import { CR_PROF, CR_XP } from './types';
import { computeDerivedFields, slugifyMonsterName } from './import-5etools';

const SIZES: readonly Size[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const CREATURE_TYPES: readonly CreatureType[] = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon',
  'Elemental', 'Fey', 'Fiend', 'Giant', 'Humanoid',
  'Monstrosity', 'Ooze', 'Plant', 'Undead',
];
const ENVIRONMENTS: readonly Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland',
  'Hill', 'Mountain', 'Swamp', 'Underdark', 'Underwater',
  'Urban', 'Planar', 'Any',
];
const DAMAGE_TYPES: readonly DamageType[] = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force',
  'Lightning', 'Necrotic', 'Piercing', 'Poison',
  'Psychic', 'Radiant', 'Slashing', 'Thunder',
];
const CONDITIONS: readonly Condition[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion',
  'Frightened', 'Grappled', 'Incapacitated', 'Invisible',
  'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
];

export type ValidateResult =
  | { ok: true; monster: Monster }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function inList<T extends string>(v: unknown, list: readonly T[]): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function filterList<T extends string>(v: unknown, list: readonly T[]): T[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is T => inList(item, list));
}

function normalizeAction(v: unknown): MonsterAction | undefined {
  if (!isRecord(v) || typeof v.name !== 'string') return undefined;
  const action: MonsterAction = {
    name: v.name,
    description: typeof v.description === 'string' ? v.description : '',
  };
  const bonus = asFiniteNumber(v.attackBonus);
  if (bonus !== undefined) action.attackBonus = bonus;
  if (typeof v.damageDice === 'string') action.damageDice = v.damageDice;
  const avg = asFiniteNumber(v.damageAvg);
  if (avg !== undefined) action.damageAvg = avg;
  if (v.attackDelivery === 'Melee' || v.attackDelivery === 'Ranged') {
    action.attackDelivery = v.attackDelivery;
  }
  const reach = asFiniteNumber(v.reach);
  if (reach !== undefined) action.reach = reach;
  const range = asFiniteNumber(v.range);
  if (range !== undefined) action.range = range;
  const damageTypes = filterList(v.damageTypes, DAMAGE_TYPES);
  if (damageTypes.length > 0) action.damageTypes = damageTypes;
  return action;
}

function normalizeActions(v: unknown): MonsterAction[] {
  if (!Array.isArray(v)) return [];
  return v.map(normalizeAction).filter((a): a is MonsterAction => a !== undefined);
}

/**
 * Validate and normalize one candidate monster object.
 * Hard requirements: name, numeric CR (0–40), positive hitPoints, armor.ac.
 * Everything else is defaulted, coerced, or filtered to valid values.
 */
export function validateMonster(input: unknown): ValidateResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ['not a JSON object'] };
  }

  const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : undefined;
  if (!name) errors.push('missing or empty "name"');

  const cr = asFiniteNumber(input.challengeRating);
  if (cr === undefined || cr < 0 || cr > 40) {
    errors.push('"challengeRating" must be a number between 0 and 40');
  }

  const hitPoints = asFiniteNumber(input.hitPoints);
  if (hitPoints === undefined || hitPoints <= 0) {
    errors.push('"hitPoints" must be a positive number');
  }

  const armor = isRecord(input.armor) ? asFiniteNumber(input.armor.ac) : undefined;
  if (armor === undefined) {
    errors.push('"armor.ac" must be a number');
  }

  if (errors.length > 0 || !name || cr === undefined || hitPoints === undefined || armor === undefined) {
    return { ok: false, errors };
  }

  const rawAbilities = isRecord(input.abilities) ? input.abilities : {};
  const abilities: AbilityScores = {
    str: asFiniteNumber(rawAbilities.str) ?? 10,
    dex: asFiniteNumber(rawAbilities.dex) ?? 10,
    con: asFiniteNumber(rawAbilities.con) ?? 10,
    int: asFiniteNumber(rawAbilities.int) ?? 10,
    wis: asFiniteNumber(rawAbilities.wis) ?? 10,
    cha: asFiniteNumber(rawAbilities.cha) ?? 10,
  };

  const speed = isRecord(input.speed)
    ? {
        walk: asFiniteNumber(input.speed.walk),
        fly: asFiniteNumber(input.speed.fly),
        swim: asFiniteNumber(input.speed.swim),
        burrow: asFiniteNumber(input.speed.burrow),
        climb: asFiniteNumber(input.speed.climb),
        hover: input.speed.hover === true ? true : undefined,
      }
    : { walk: 30 };
  if (!speed.walk && !speed.fly && !speed.swim && !speed.burrow && !speed.climb) {
    speed.walk = 30;
  }

  const actions = normalizeActions(input.actions);
  const legendaryActions = isRecord(input.legendary)
    ? normalizeActions(input.legendary.actions)
    : [];
  const explicitSizeOptions = filterList(input.sizeOptions, SIZES);
  const legacySizeOptions = Array.isArray(input.size) ? filterList(input.size, SIZES) : [];
  const sizeOptions = explicitSizeOptions.length > 0
    ? explicitSizeOptions
    : legacySizeOptions.length > 0
      ? legacySizeOptions
      : [inList(input.size, SIZES) ? input.size : 'Medium'];

  const monster: Monster = {
    id: typeof input.id === 'string' && input.id.trim() ? input.id.trim() : slugifyMonsterName(name),
    name,
    source: 'Custom',
    size: sizeOptions[0],
    type: inList(input.type, CREATURE_TYPES) ? input.type : 'Monstrosity',
    alignment: typeof input.alignment === 'string' ? (input.alignment as Alignment) : 'Unaligned',
    armor: { ac: armor, source: isRecord(input.armor) && typeof input.armor.source === 'string' ? input.armor.source : undefined },
    hitPoints,
    hitDice: typeof input.hitDice === 'string' ? input.hitDice : `${Math.max(1, Math.round(hitPoints / 5))}d8`,
    speed,
    abilities,
    senses: Array.isArray(input.senses) ? input.senses.filter((s): s is string => typeof s === 'string') : [],
    languages: Array.isArray(input.languages) ? input.languages.filter((l): l is string => typeof l === 'string') : [],
    challengeRating: cr,
    proficiencyBonus: asFiniteNumber(input.proficiencyBonus) ?? CR_PROF[cr] ?? 2,
    xp: asFiniteNumber(input.xp) ?? CR_XP[cr] ?? 0,
    damageVulnerabilities: filterList(input.damageVulnerabilities, DAMAGE_TYPES),
    damageResistances: filterList(input.damageResistances, DAMAGE_TYPES),
    damageImmunities: filterList(input.damageImmunities, DAMAGE_TYPES),
    conditionImmunities: filterList(input.conditionImmunities, CONDITIONS),
    actions,
    environments: filterList(input.environments, ENVIRONMENTS),
    isLegendary: input.isLegendary === true || legendaryActions.length > 0,
    isMythic: input.isMythic === true,
    hasLair: input.hasLair === true,
    hasSpellcasting: input.hasSpellcasting === true,
    movementModes: [],
    attackDamageTypes: [],
    attackDeliveryModes: [],
    tags: Array.isArray(input.tags) ? input.tags.filter((t): t is string => typeof t === 'string') : [],
  };

  if (sizeOptions.length > 1) monster.sizeOptions = sizeOptions;

  if (typeof input.subtype === 'string') monster.subtype = input.subtype;
  if (legendaryActions.length > 0) {
    monster.legendary = {
      description:
        isRecord(input.legendary) && typeof input.legendary.description === 'string'
          ? input.legendary.description
          : 'The creature can take 3 legendary actions.',
      actions: legendaryActions,
      actionsPerRound:
        (isRecord(input.legendary) ? asFiniteNumber(input.legendary.actionsPerRound) : undefined) ?? 3,
    };
  }
  if (normalizeActions(input.specialAbilities).length > 0) {
    monster.specialAbilities = normalizeActions(input.specialAbilities);
  }
  if (normalizeActions(input.bonusActions).length > 0) {
    monster.bonusActions = normalizeActions(input.bonusActions);
  }
  if (normalizeActions(input.reactions).length > 0) {
    monster.reactions = normalizeActions(input.reactions);
  }

  return { ok: true, monster: computeDerivedFields(monster) };
}
