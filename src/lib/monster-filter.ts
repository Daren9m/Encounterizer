// ─── Monster Filter Engine ──────────────────────────────────────
// Provides search, filter, and summary utilities for Monster[].

import type {
  Monster,
  MonsterFilter,
  Size,
  CreatureType,
  Environment,
  DamageType,
  Condition,
  MovementMode,
  AttackDelivery,
  SourceBook,
} from './types';

// ─── Helpers ────────────────────────────────────────────────────

/** Check whether two arrays share at least one element. */
function hasOverlap<T>(a: T[], b: T[]): boolean {
  const set = new Set(b);
  return a.some((item) => set.has(item));
}

/** Case-insensitive substring test. */
function includesCI(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

// ─── Core Filter ────────────────────────────────────────────────

/**
 * Return true if a single monster passes every active criterion in the filter.
 * An undefined / empty filter field means "no constraint" (pass-through).
 */
function matchesFilter(monster: Monster, filter: MonsterFilter): boolean {
  // ── Free-text search ──────────────────────────────────────────
  if (filter.search && filter.search.trim().length > 0) {
    const q = filter.search.trim();
    const searchable = [
      monster.name,
      monster.type,
      monster.subtype ?? '',
      ...monster.tags,
    ];
    if (!searchable.some((field) => includesCI(field, q))) {
      return false;
    }
  }

  // ── Challenge rating range ────────────────────────────────────
  if (filter.crMin !== undefined && monster.challengeRating < filter.crMin) {
    return false;
  }
  if (filter.crMax !== undefined && monster.challengeRating > filter.crMax) {
    return false;
  }

  // ── Size ──────────────────────────────────────────────────────
  if (filter.sizes && filter.sizes.length > 0) {
    if (!filter.sizes.includes(monster.size)) {
      return false;
    }
  }

  // ── Creature type ─────────────────────────────────────────────
  if (filter.types && filter.types.length > 0) {
    if (!filter.types.includes(monster.type)) {
      return false;
    }
  }

  // ── Environments (ANY overlap) ────────────────────────────────
  if (filter.environments && filter.environments.length > 0) {
    if (monster.environments.length === 0 || !hasOverlap(monster.environments, filter.environments)) {
      return false;
    }
  }

  // ── Movement modes (ANY overlap) ──────────────────────────────
  if (filter.movementModes && filter.movementModes.length > 0) {
    if (monster.movementModes.length === 0 || !hasOverlap(monster.movementModes, filter.movementModes)) {
      return false;
    }
  }

  // ── Attack damage types (ANY overlap) ─────────────────────────
  if (filter.attackDamageTypes && filter.attackDamageTypes.length > 0) {
    if (monster.attackDamageTypes.length === 0 || !hasOverlap(monster.attackDamageTypes, filter.attackDamageTypes)) {
      return false;
    }
  }

  // ── Attack delivery modes (ANY overlap) ───────────────────────
  if (filter.attackDeliveryModes && filter.attackDeliveryModes.length > 0) {
    if (monster.attackDeliveryModes.length === 0 || !hasOverlap(monster.attackDeliveryModes, filter.attackDeliveryModes)) {
      return false;
    }
  }

  // ── Damage resistances (ANY overlap) ──────────────────────────
  if (filter.damageResistances && filter.damageResistances.length > 0) {
    if (monster.damageResistances.length === 0 || !hasOverlap(monster.damageResistances, filter.damageResistances)) {
      return false;
    }
  }

  // ── Damage immunities (ANY overlap) ───────────────────────────
  if (filter.damageImmunities && filter.damageImmunities.length > 0) {
    if (monster.damageImmunities.length === 0 || !hasOverlap(monster.damageImmunities, filter.damageImmunities)) {
      return false;
    }
  }

  // ── Damage vulnerabilities (ANY overlap) ──────────────────────
  if (filter.damageVulnerabilities && filter.damageVulnerabilities.length > 0) {
    if (monster.damageVulnerabilities.length === 0 || !hasOverlap(monster.damageVulnerabilities, filter.damageVulnerabilities)) {
      return false;
    }
  }

  // ── Condition immunities (ANY overlap) ────────────────────────
  if (filter.conditionImmunities && filter.conditionImmunities.length > 0) {
    if (monster.conditionImmunities.length === 0 || !hasOverlap(monster.conditionImmunities, filter.conditionImmunities)) {
      return false;
    }
  }

  // ── Boolean flags (exact match when defined) ──────────────────
  if (filter.isLegendary !== undefined && monster.isLegendary !== filter.isLegendary) {
    return false;
  }
  if (filter.hasSpellcasting !== undefined && monster.hasSpellcasting !== filter.hasSpellcasting) {
    return false;
  }
  if (filter.hasLair !== undefined && monster.hasLair !== filter.hasLair) {
    return false;
  }

  // ── Source books ──────────────────────────────────────────────
  if (filter.sources && filter.sources.length > 0) {
    if (!filter.sources.includes(monster.source)) {
      return false;
    }
  }

  // ── Tags (ANY overlap) ───────────────────────────────────────
  if (filter.tags && filter.tags.length > 0) {
    if (monster.tags.length === 0 || !hasOverlap(monster.tags, filter.tags)) {
      return false;
    }
  }

  return true;
}

// ─── Sorting ────────────────────────────────────────────────────

/** Comparator value for sorting. Returns negative, zero, or positive. */
function compareMonsters(
  a: Monster,
  b: Monster,
  sortBy: MonsterFilter['sortBy'],
  sortDir: MonsterFilter['sortDir'],
): number {
  const dir = sortDir === 'desc' ? -1 : 1;
  let cmp: number;

  switch (sortBy) {
    case 'cr':
      cmp = a.challengeRating - b.challengeRating;
      break;
    case 'hp':
      cmp = a.hitPoints - b.hitPoints;
      break;
    case 'ac':
      cmp = a.armor.ac - b.armor.ac;
      break;
    case 'name':
    default:
      return a.name.localeCompare(b.name) * dir;
  }

  // Stable secondary sort by name when primary keys are equal
  if (cmp === 0) {
    return a.name.localeCompare(b.name) * dir;
  }

  return cmp * dir;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * The main filter function.
 *
 * Takes a full list of monsters and a filter specification, returns only the
 * monsters that match every active criterion, sorted according to the filter's
 * `sortBy` / `sortDir` fields (defaulting to name ascending).
 */
export function filterMonsters(monsters: Monster[], filter: MonsterFilter): Monster[] {
  const results = monsters.filter((m) => matchesFilter(m, filter));

  const sortBy = filter.sortBy ?? 'name';
  const sortDir = filter.sortDir ?? 'asc';

  results.sort((a, b) => compareMonsters(a, b, sortBy, sortDir));

  return results;
}

// ─── Filter Options Discovery ───────────────────────────────────

export interface FilterOptions {
  sizes: Size[];
  types: CreatureType[];
  environments: Environment[];
  movementModes: MovementMode[];
  attackDamageTypes: DamageType[];
  attackDeliveryModes: AttackDelivery[];
  damageResistances: DamageType[];
  damageImmunities: DamageType[];
  damageVulnerabilities: DamageType[];
  conditionImmunities: Condition[];
  sources: SourceBook[];
  tags: string[];
  crMin: number;
  crMax: number;
}

/**
 * Scan all monsters and collect every distinct value for each filterable
 * dimension. Useful for dynamically populating dropdown / checkbox UI.
 */
export function getFilterOptions(monsters: Monster[]): FilterOptions {
  const sizes = new Set<Size>();
  const types = new Set<CreatureType>();
  const environments = new Set<Environment>();
  const movementModes = new Set<MovementMode>();
  const attackDamageTypes = new Set<DamageType>();
  const attackDeliveryModes = new Set<AttackDelivery>();
  const damageResistances = new Set<DamageType>();
  const damageImmunities = new Set<DamageType>();
  const damageVulnerabilities = new Set<DamageType>();
  const conditionImmunities = new Set<Condition>();
  const sources = new Set<SourceBook>();
  const tags = new Set<string>();

  let crMin = Infinity;
  let crMax = -Infinity;

  for (const m of monsters) {
    sizes.add(m.size);
    types.add(m.type);
    sources.add(m.source);

    if (m.challengeRating < crMin) crMin = m.challengeRating;
    if (m.challengeRating > crMax) crMax = m.challengeRating;

    for (const e of m.environments) environments.add(e);
    for (const mm of m.movementModes) movementModes.add(mm);
    for (const dt of m.attackDamageTypes) attackDamageTypes.add(dt);
    for (const ad of m.attackDeliveryModes) attackDeliveryModes.add(ad);
    for (const dr of m.damageResistances) damageResistances.add(dr);
    for (const di of m.damageImmunities) damageImmunities.add(di);
    for (const dv of m.damageVulnerabilities) damageVulnerabilities.add(dv);
    for (const ci of m.conditionImmunities) conditionImmunities.add(ci);
    for (const t of m.tags) tags.add(t);
  }

  // When the input list is empty, use sensible defaults for CR range
  if (!isFinite(crMin)) crMin = 0;
  if (!isFinite(crMax)) crMax = 30;

  return {
    sizes: Array.from(sizes).sort(),
    types: Array.from(types).sort(),
    environments: Array.from(environments).sort(),
    movementModes: Array.from(movementModes).sort(),
    attackDamageTypes: Array.from(attackDamageTypes).sort(),
    attackDeliveryModes: Array.from(attackDeliveryModes).sort(),
    damageResistances: Array.from(damageResistances).sort(),
    damageImmunities: Array.from(damageImmunities).sort(),
    damageVulnerabilities: Array.from(damageVulnerabilities).sort(),
    conditionImmunities: Array.from(conditionImmunities).sort(),
    sources: Array.from(sources).sort(),
    tags: Array.from(tags).sort(),
    crMin,
    crMax,
  };
}

// ─── Summary Statistics ─────────────────────────────────────────

export interface MonsterSummaryStats {
  totalCount: number;
  crDistribution: Record<number, number>;
  typeDistribution: Record<string, number>;
}

/**
 * Compute quick summary statistics for a list of monsters.
 *
 * - `totalCount`: number of monsters in the list.
 * - `crDistribution`: map of challenge rating -> count of monsters at that CR.
 * - `typeDistribution`: map of creature type -> count of monsters of that type.
 */
export function getMonsterSummaryStats(monsters: Monster[]): MonsterSummaryStats {
  const crDistribution: Record<number, number> = {};
  const typeDistribution: Record<string, number> = {};

  for (const m of monsters) {
    crDistribution[m.challengeRating] = (crDistribution[m.challengeRating] ?? 0) + 1;
    typeDistribution[m.type] = (typeDistribution[m.type] ?? 0) + 1;
  }

  return {
    totalCount: monsters.length,
    crDistribution,
    typeDistribution,
  };
}
