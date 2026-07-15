import {
  Monster, Encounter, EncounterMonster, Party, Difficulty, Environment,
  MonsterFilter, XP_THRESHOLDS, getEncounterMultiplier,
} from './types';
import { seededRandom, shuffleArray, pickRandom } from './random';

// ─── XP Budget Calculation ───────────────────────────────────────

export function getPartyXpThreshold(party: Party, difficulty: Difficulty): number {
  return party.members.reduce((total, member) => {
    const level = Math.min(Math.max(member.level, 1), 20);
    return total + (XP_THRESHOLDS[level]?.[difficulty] ?? 0);
  }, 0);
}

export function getEncounterDifficulty(
  totalXp: number,
  monsterCount: number,
  party: Party
): Difficulty {
  const partySize = party.members.length;
  const multiplier = getEncounterMultiplier(monsterCount, partySize);
  const adjustedXp = totalXp * multiplier;

  const easy = getPartyXpThreshold(party, 'Easy');
  const medium = getPartyXpThreshold(party, 'Medium');
  const hard = getPartyXpThreshold(party, 'Hard');
  const deadly = getPartyXpThreshold(party, 'Deadly');

  if (adjustedXp >= deadly) return 'Deadly';
  if (adjustedXp >= hard) return 'Hard';
  if (adjustedXp >= medium) return 'Medium';
  return 'Easy';
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
}

export function selectMonstersForBudget(
  available: Monster[],
  xpBudget: number,
  partySize: number,
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

    // Score this composition: closer to budget = better, some variety bonus
    const usedXp = xpBudget - remaining;
    const multiplier = getEncounterMultiplier(totalCount, partySize);
    const adjustedXp = usedXp * multiplier;
    const budgetFit = 1 - Math.abs(adjustedXp - xpBudget) / xpBudget;
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

const SCENARIO_HOOKS = [
  'The party stumbles upon {monsters} while traveling through the {environment}.',
  'A local village has been terrorized by {monsters} lurking in the nearby {environment}.',
  'Screams echo through the {environment} — {monsters} have ambushed a merchant caravan.',
  'The entrance to the dungeon is guarded by {monsters}, who seem agitated.',
  'A mysterious fog rolls in as {monsters} emerge from the shadows of the {environment}.',
  'The party discovers the remains of an adventuring group, slain by {monsters}.',
  'A bounty board lists a reward for clearing {monsters} from the {environment}.',
  '{monsters} have established a lair and are raiding nearby settlements.',
  'An ancient shrine in the {environment} has attracted {monsters} drawn to its power.',
  'The party interrupts {monsters} in the middle of a dark ritual.',
  'Territorial {monsters} block the only path through the {environment}.',
  'A dying scout warns the party of {monsters} ahead in the {environment}.',
  'The ground trembles as {monsters} emerge from beneath the {environment}.',
  'A trap set by {monsters} separates the party in the {environment}.',
  'The party is hired to escort a prisoner through {environment} infested with {monsters}.',
  'An earthquake has disturbed {monsters} from their slumber in the {environment}.',
  '{monsters} are fighting over a magical artifact when the party arrives.',
  'The party must negotiate passage through territory claimed by {monsters}.',
  'A portal tears open, unleashing {monsters} into the {environment}.',
  'The ruins in the {environment} are not as abandoned as they appear — {monsters} lurk within.',
];

const TACTICS_BY_TYPE: Record<string, string[]> = {
  Beast: [
    'These creatures fight on instinct — they flee when reduced below half HP.',
    'The pack targets the weakest-looking party member first.',
    'They use hit-and-run tactics, retreating into cover between attacks.',
  ],
  Undead: [
    'Mindless undead attack the nearest living creature relentlessly.',
    'The undead press forward without regard for their own survival.',
    'They focus on isolating party members from the group.',
  ],
  Humanoid: [
    'They use coordinated tactics, flanking and focusing fire on spellcasters.',
    'A leader barks orders — taking them down may cause morale to break.',
    'They attempt to parley if the fight turns against them.',
  ],
  Dragon: [
    'Uses breath weapon immediately, then takes flight to recharge.',
    'Targets clustered party members with area attacks.',
    'Uses lair actions to reshape the battlefield each round.',
  ],
  Fiend: [
    'Focuses on corrupting or tempting party members before combat.',
    'Targets the cleric or paladin first to eliminate radiant damage threats.',
    'Uses darkness and fear to split the party.',
  ],
  Aberration: [
    'Uses bizarre, alien tactics that are hard to predict.',
    'Targets the character with the highest Intelligence for psychic assaults.',
    'Attempts to dominate or charm a party member to fight their allies.',
  ],
  Elemental: [
    'Fights with single-minded purpose, ignoring pain and fear.',
    'Uses the environment to its advantage — fire near flammables, water near cliffs.',
    'Retreats to its native element if available on the map.',
  ],
  Monstrosity: [
    'Ambushes from hiding, using surprise to devastating effect.',
    'Uses special movement (fly, burrow, climb) to stay out of melee range.',
    'Guards its territory fiercely and fights to the death.',
  ],
  Giant: [
    'Hurls boulders from range before closing to melee.',
    'Targets the smallest party member, underestimating them.',
    'Uses the environment as improvised weapons.',
  ],
  Construct: [
    'Follows its orders to the letter, ignoring all other stimuli.',
    'Cannot be reasoned with, bribed, or intimidated.',
    'Fights until destroyed, never retreating.',
  ],
  Ooze: [
    'Moves slowly but relentlessly toward the nearest creature.',
    'Splits when hit with slashing damage (if applicable).',
    'Squeezes through tight spaces to ambush from unexpected directions.',
  ],
  Celestial: [
    'Attempts to warn intruders before resorting to violence.',
    'Focuses radiant attacks on fiends and undead first.',
    'Fights with divine purpose, retreating only if ordered by a higher power.',
  ],
  Fey: [
    'Uses illusions and trickery to confuse the party.',
    'Targets the party member with the lowest Wisdom for charm effects.',
    'May offer a deal or riddle instead of fighting.',
  ],
  Plant: [
    'Remains motionless until prey enters reach, then strikes.',
    'Uses entangling vines and difficult terrain to trap victims.',
    'Focuses on grappling and restraining rather than direct damage.',
  ],
};

const TREASURE_BY_CR: Record<string, string[]> = {
  low: [
    '2d6 × 10 CP, 1d6 × 10 SP',
    'A battered trinket worth 5 GP and a healing potion',
    '3d6 GP scattered among the remains',
    'A crude map leading to a nearby point of interest',
  ],
  mid: [
    '4d6 × 10 GP, 1d6 gems worth 50 GP each',
    'A +1 weapon or suit of armor (DM\'s choice)',
    'A scroll of a 3rd-level spell and 100 GP',
    'An uncommon magic item from the DMG random tables',
  ],
  high: [
    '2d6 × 100 GP, 2d6 gems worth 100 GP each',
    'A rare magic item and 500 GP in mixed coinage',
    'A spell scroll (5th level), potion of greater healing, and 300 GP',
    'An art object worth 750 GP and a rare magic item',
  ],
  legendary: [
    'A very rare or legendary magic item',
    '10d6 × 100 GP, 3d6 gems worth 500 GP each',
    'A legendary artifact with a storied history',
    'An immense hoard: 5,000+ GP in mixed treasure and 2 rare magic items',
  ],
};

function formatMonsterList(monsters: EncounterMonster[]): string {
  return monsters
    .map(em => em.count > 1 ? `${em.count} ${em.monster.name}s` : `a ${em.monster.name}`)
    .join(', ')
    .replace(/, ([^,]*)$/, ' and $1');  // Oxford-comma-ish join
}

function generateScenarioHook(
  monsters: EncounterMonster[],
  environment: Environment,
  rng: () => number
): string {
  const template = pickRandom(SCENARIO_HOOKS, rng);
  return template
    .replace('{monsters}', formatMonsterList(monsters))
    .replace('{environment}', environment.toLowerCase());
}

function generateTactics(monsters: EncounterMonster[], rng: () => number): string {
  const lines: string[] = [];
  const seenTypes = new Set<string>();

  for (const em of monsters) {
    const type = em.monster.type;
    if (seenTypes.has(type)) continue;
    seenTypes.add(type);

    const tactics = TACTICS_BY_TYPE[type] ?? TACTICS_BY_TYPE['Monstrosity']!;
    lines.push(`**${em.monster.name}** (${type}): ${pickRandom(tactics, rng)}`);
  }

  return lines.join('\n');
}

function generateTreasure(cr: number, rng: () => number): string {
  let tier: string;
  if (cr <= 4) tier = 'low';
  else if (cr <= 10) tier = 'mid';
  else if (cr <= 17) tier = 'high';
  else tier = 'legendary';

  return pickRandom(TREASURE_BY_CR[tier]!, rng);
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
  } = options;

  const seed = Date.now() + Math.floor(Math.random() * 100000);
  const rng = seededRandom(seed);

  // Calculate XP budget for the desired difficulty
  const xpBudget = getPartyXpThreshold(party, difficulty);

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
  const selectedMonsters = selectMonstersForBudget(available, xpBudget, party.members.length, {
    preferMixed,
    maxMonsterTypes,
    maxTotalMonsters,
    seed,
  });

  // Calculate actual XP
  const totalXp = selectedMonsters.reduce((sum, em) => sum + em.monster.xp * em.count, 0);
  const totalCount = selectedMonsters.reduce((sum, em) => sum + em.count, 0);
  const multiplier = getEncounterMultiplier(totalCount, party.members.length);
  const adjustedXp = Math.round(totalXp * multiplier);

  // Determine the highest CR for treasure generation
  const maxCr = selectedMonsters.reduce((max, em) => Math.max(max, em.monster.challengeRating), 0);

  // Build the encounter
  const env = environment ?? 'Forest';
  const encounterName = generateEncounterName(selectedMonsters, env, rng);

  return {
    id: `enc-${seed}`,
    name: encounterName,
    description: generateScenarioHook(selectedMonsters, env, rng),
    environment: env,
    difficulty: getEncounterDifficulty(totalXp, totalCount, party),
    monsters: selectedMonsters,
    totalXp,
    adjustedXp,
    scenarioHook: generateScenarioHook(selectedMonsters, env, rng),
    tactics: generateTactics(selectedMonsters, rng),
    treasure: generateTreasure(maxCr, rng),
  };
}

function generateEncounterName(
  monsters: EncounterMonster[],
  environment: Environment,
  rng: () => number
): string {
  const prefixes = [
    'Ambush', 'Siege', 'Skirmish', 'Raid', 'Assault',
    'Standoff', 'Hunt', 'Clash', 'Confrontation', 'Battle',
  ];
  const prefix = pickRandom(prefixes, rng);
  const envName = environment === 'Any' ? 'the Wilds' : `the ${environment}`;

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
  filterFn?: (monsters: Monster[], filter: MonsterFilter) => Monster[]
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

  return generateEncounter(allMonsters, { party, difficulty, environment }, filterFn);
}
