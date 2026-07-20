import {
  Monster, Encounter, EncounterMonster, Party, Difficulty, EncounterAssessment,
  Environment, MonsterFilter, XP_BUDGET_PER_CHARACTER,
} from './types';
import { seededRandom, shuffleArray, pickRandom, randomSeed } from './random';
import { FlavorPools, FlavorVersion, getFlavorPools } from './flavor-pools';

// ─── XP Budgets (2024 DMG) ───────────────────────────────────────

/** Party-wide XP budget: the sum of each member's per-level budget row. */
export function getPartyXpBudget(party: Party, difficulty: Difficulty): number {
  const officialTier = difficulty === 'Trivial'
    ? 'Low'
    : difficulty === 'Extreme' ? 'High' : difficulty;
  const officialBudget = party.members.reduce((total, member) => {
    const level = Math.min(Math.max(member.level, 1), 20);
    return total + (XP_BUDGET_PER_CHARACTER[level]?.[officialTier] ?? 0);
  }, 0);

  if (difficulty === 'Trivial') return Math.floor(officialBudget * 0.5);
  if (difficulty === 'Extreme') return Math.round(officialBudget * 1.3);
  return officialBudget;
}

/**
 * Aim at the middle of the requested difficulty band instead of its hard cap.
 * Filling to 95–100% of a cap makes a generated "Moderate" encounter behave
 * like the next tier whenever monster action economy or a high-CR group spikes.
 */
export function getEncounterTargetXp(party: Party, difficulty: Difficulty): number {
  const order: Difficulty[] = ['Trivial', 'Low', 'Moderate', 'High', 'Extreme'];
  const index = order.indexOf(difficulty);
  const upper = getPartyXpBudget(party, difficulty);
  const lower = index > 0 ? getPartyXpBudget(party, order[index - 1]) : 0;
  return Math.round(lower + (upper - lower) * 0.5);
}

/**
 * Classify an encounter against the party's 2024 budgets. Budgets are caps:
 * an encounter belongs to the cheapest tier whose budget still contains it.
 * Raw monster XP is compared directly — 2024 has no monster-count multiplier.
 */
export function assessEncounterDifficulty(
  totalXp: number,
  party: Party,
): EncounterAssessment {
  if (totalXp <= getPartyXpBudget(party, 'Trivial')) return 'Trivial';
  if (totalXp <= getPartyXpBudget(party, 'Low')) return 'Low';
  if (totalXp <= getPartyXpBudget(party, 'Moderate')) return 'Moderate';
  if (totalXp <= getPartyXpBudget(party, 'High')) return 'High';
  return 'Extreme';
}

export interface EncounterXpSummary {
  totalXp: number;
  totalMonsterHp: number;
  monsterCount: number;
  budgets: Record<Difficulty, number>;
  /** null when the encounter has no monsters yet */
  assessment: EncounterAssessment | null;
}

/** Everything the Encounter Builder UI needs about a monster list, in one call. */
export function summarizeEncounter(
  monsters: EncounterMonster[],
  party: Party,
): EncounterXpSummary {
  const totalXp = monsters.reduce((sum, em) => sum + em.monster.xp * em.count, 0);
  const totalMonsterHp = monsters.reduce(
    (sum, em) => sum + em.monster.hitPoints * em.count,
    0,
  );
  const monsterCount = monsters.reduce((sum, em) => sum + em.count, 0);
  return {
    totalXp,
    totalMonsterHp,
    monsterCount,
    budgets: {
      Trivial: getPartyXpBudget(party, 'Trivial'),
      Low: getPartyXpBudget(party, 'Low'),
      Moderate: getPartyXpBudget(party, 'Moderate'),
      High: getPartyXpBudget(party, 'High'),
      Extreme: getPartyXpBudget(party, 'Extreme'),
    },
    assessment: monsterCount === 0 ? null : assessEncounterDifficulty(totalXp, party),
  };
}

// ─── Monster Selection (XP-budget knapsack) ──────────────────────

interface GenerateOptions {
  party: Party;
  difficulty: Difficulty;
  environment?: Environment;
  filter?: MonsterFilter;
  preferMixed?: boolean;   // prefer multiple monster types vs homogeneous
  maxMonsterTypes?: number; // max distinct monster stat blocks
  maxTotalMonsters?: number;
  seed?: number;           // replay a seed to reproduce an encounter exactly
  flavorVersion?: FlavorVersion; // which frozen flavor-pool set to draw prose from (default 1)
}

export function selectMonstersForBudget(
  available: Monster[],
  xpBudget: number,
  options: {
    preferMixed?: boolean;
    maxMonsterTypes?: number;
    maxTotalMonsters?: number;
    seed?: number;
  } = {}
): EncounterMonster[] {
  const {
    preferMixed = true,
    maxMonsterTypes = 4,
    maxTotalMonsters = 12,
    seed = Date.now(),
  } = options;

  if (available.length === 0) return [];

  const rng = seededRandom(seed);

  // Sort candidates by XP descending so we try big monsters first
  const candidates = shuffleArray(
    available.filter(m => m.xp > 0 && m.xp <= xpBudget),
    rng
  );

  if (candidates.length === 0) return [];

  // Strategy: try several random compositions & pick the best fit
  let bestResult: EncounterMonster[] = [];
  let bestScore = -Infinity;

  const attempts = Math.min(50, candidates.length * 3);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const result: Map<string, { monster: Monster; count: number }> = new Map();
    let remaining = xpBudget;
    let totalCount = 0;
    let typeCount = 0;
    const shuffled = shuffleArray(candidates, rng);

    for (const monster of shuffled) {
      if (typeCount >= maxMonsterTypes) break;
      if (totalCount >= maxTotalMonsters) break;
      if (monster.xp > remaining) continue;

      // Determine how many of this monster to add
      const maxByXp = Math.floor(remaining / monster.xp);
      const maxAllowed = Math.min(maxByXp, maxTotalMonsters - totalCount);

      if (maxAllowed <= 0) continue;

      // Prefer 1-3 of each type for variety, or more for weaker monsters
      let count: number;
      if (preferMixed && typeCount < maxMonsterTypes - 1) {
        count = Math.min(maxAllowed, 1 + Math.floor(rng() * 3));
      } else {
        count = Math.min(maxAllowed, 1 + Math.floor(rng() * maxAllowed));
      }

      result.set(monster.id, { monster, count });
      remaining -= monster.xp * count;
      totalCount += count;
      typeCount++;

      // If we've used most of the budget, stop
      if (remaining < xpBudget * 0.05) break;
    }

    // Score this composition: budget utilization (usedXp never exceeds the
    // budget by construction) plus a small variety bonus.
    const usedXp = xpBudget - remaining;
    const budgetFit = usedXp / xpBudget;
    const varietyBonus = preferMixed ? typeCount * 0.05 : 0;
    const score = budgetFit + varietyBonus;

    if (score > bestScore && totalCount > 0) {
      bestScore = score;
      bestResult = Array.from(result.values());
    }
  }

  return bestResult;
}

// ─── Scenario Hooks ──────────────────────────────────────────────
// Prose pools live in flavor-pools.ts, versioned behind getFlavorPools()
// so seeded replay links keep drawing from the exact frozen arrays.

function formatMonsterList(monsters: EncounterMonster[]): string {
  return monsters
    .map(em => em.count > 1 ? `${em.count} ${em.monster.name}s` : `a ${em.monster.name}`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');  // Oxford-comma-ish join
}

function generateScenarioHook(
  monsters: EncounterMonster[],
  environment: Environment,
  rng: () => number,
  pools: FlavorPools,
): string {
  const template = pickRandom(pools.scenarioHooks, rng);
  return template
    .replace('{monsters}', formatMonsterList(monsters))
    .replace('{environment}', environment.toLowerCase());
}

function generateTactics(
  monsters: EncounterMonster[],
  rng: () => number,
  pools: FlavorPools,
): string {
  const lines: string[] = [];
  const seenTypes = new Set<string>();

  for (const em of monsters) {
    const type = em.monster.type;
    if (seenTypes.has(type)) continue;
    seenTypes.add(type);

    const tactics = pools.tacticsByType[type] ?? pools.tacticsByType['Monstrosity']!;
    lines.push(`**${em.monster.name}** (${type}): ${pickRandom(tactics, rng)}`);
  }

  return lines.join('\n');
}

export function generateTreasure(
  cr: number,
  rng: () => number,
  flavorVersion: FlavorVersion = 1,
): string {
  let tier: 'low' | 'mid' | 'high' | 'legendary';
  if (cr <= 4) tier = 'low';
  else if (cr <= 10) tier = 'mid';
  else if (cr <= 17) tier = 'high';
  else tier = 'legendary';

  return pickRandom(getFlavorPools(flavorVersion).treasureByTier[tier], rng);
}

// ─── Main Generator ──────────────────────────────────────────────

export function generateEncounter(
  allMonsters: Monster[],
  options: GenerateOptions,
  filterFn?: (monsters: Monster[], filter: MonsterFilter) => Monster[]
): Encounter {
  const {
    party,
    difficulty,
    environment,
    filter,
    preferMixed = true,
    maxMonsterTypes = 4,
    maxTotalMonsters = 12,
    seed = randomSeed(),
    flavorVersion = 1,
  } = options;

  const rng = seededRandom(seed);
  const pools = getFlavorPools(flavorVersion);

  // Generate near the center of the requested band. The full budget remains
  // the assessment cap, but is intentionally not treated as a target.
  const xpBudget = getEncounterTargetXp(party, difficulty);

  // Filter available monsters by environment and any user filters
  let available = allMonsters;

  if (environment && environment !== 'Any') {
    available = available.filter(
      m => m.environments.includes(environment) || m.environments.includes('Any')
    );
  }

  // Apply additional user filters if provided
  if (filter && filterFn) {
    available = filterFn(available, filter);
  }

  // Select monsters to fill the XP budget
  const selectedMonsters = selectMonstersForBudget(available, xpBudget, {
    preferMixed,
    maxMonsterTypes,
    maxTotalMonsters,
    seed,
  });

  // Calculate actual XP (raw sum — no multiplier in the 2024 rules)
  const totalXp = selectedMonsters.reduce((sum, em) => sum + em.monster.xp * em.count, 0);

  // Determine the highest CR for treasure generation
  const maxCr = selectedMonsters.reduce((max, em) => Math.max(max, em.monster.challengeRating), 0);

  // Build the encounter
  const env = environment ?? 'Forest';
  const encounterName = generateEncounterName(selectedMonsters, env, rng, pools);

  return {
    id: `enc-${seed}`,
    name: encounterName,
    description: generateScenarioHook(selectedMonsters, env, rng, pools),
    environment: env,
    difficulty: assessEncounterDifficulty(totalXp, party),
    monsters: selectedMonsters,
    totalXp,
    seed,
    scenarioHook: generateScenarioHook(selectedMonsters, env, rng, pools),
    tactics: generateTactics(selectedMonsters, rng, pools),
    treasure: generateTreasure(maxCr, rng, flavorVersion),
  };
}

function generateEncounterName(
  monsters: EncounterMonster[],
  environment: Environment,
  rng: () => number,
  pools: FlavorPools,
): string {
  const prefix = pickRandom(pools.namePrefixes, rng);
  const envName = environment === 'Any' ? 'the Wilds' : `the ${environment}`;

  // An over-filtered pool can produce zero monsters — never crash on it.
  if (monsters.length === 0) {
    return `No Encounter — ${envName}`;
  }

  if (monsters.length === 1) {
    return `${prefix} — ${monsters[0].monster.name} in ${envName}`;
  }

  const primary = monsters.reduce((a, b) =>
    a.monster.challengeRating >= b.monster.challengeRating ? a : b
  );
  return `${prefix} — ${primary.monster.name} in ${envName}`;
}

// ─── Quick encounter presets ─────────────────────────────────────

export function generateQuickEncounter(
  allMonsters: Monster[],
  partyLevel: number,
  partySize: number,
  difficulty: Difficulty,
  environment?: Environment,
  filterFn?: (monsters: Monster[], filter: MonsterFilter) => Monster[],
  seed?: number,
): Encounter {
  const party: Party = {
    id: 'quick-party',
    name: 'Adventuring Party',
    members: Array.from({ length: partySize }, (_, i) => ({
      name: `Player ${i + 1}`,
      level: partyLevel,
      className: 'Adventurer',
    })),
  };

  return generateEncounter(allMonsters, { party, difficulty, environment, seed }, filterFn);
}
