import { Monster, Environment, CreatureType } from './types';
import type { Rng } from './random';

// ─── Encounter Recipe System ─────────────────────────────────────

export type MonsterRole = 'Boss' | 'Brute' | 'Artillery' | 'Skirmisher' | 'Controller' | 'Minion';

export interface RecipeSlot {
  role: MonsterRole;
  crOffset: number;       // relative to party level (e.g., +3 = party level + 3)
  count: number;
  preferred?: CreatureType[];
  description: string;
}

export interface EncounterRecipe {
  id: string;
  name: string;
  category: 'combat' | 'narrative';
  description: string;
  slots: RecipeSlot[];
  terrainSuggestions: string[];
  tactics: string;
  scaling: string;
  narrativeHook: string;
}

export const ENCOUNTER_RECIPES: EncounterRecipe[] = [
  {
    id: 'boss-minions',
    name: 'Boss + Minions',
    category: 'combat',
    description: 'One powerful creature commands a group of weaker servants. The party must decide: burn down the boss while minions swarm, or clear adds first?',
    slots: [
      { role: 'Boss', crOffset: 3, count: 1, description: 'The main threat — high HP, multi-attack, possibly legendary' },
      { role: 'Minion', crOffset: -3, count: 4, description: 'Expendable followers that harass and flank' },
    ],
    terrainSuggestions: ['Throne room with pillars for cover', 'Cave with elevated boss position', 'Ritual chamber with hazardous altar'],
    tactics: 'Minions screen the boss and try to grapple/restrain PCs. Boss uses area attacks when party clusters. If minions fall, boss becomes reckless.',
    scaling: 'Easier: reduce minions to 2. Harder: add a Lieutenant (CR = party level) who buffs minions.',
    narrativeHook: 'The boss has something the party needs — killing it might destroy the objective. Can they negotiate?',
  },
  {
    id: 'ambush',
    name: 'Ambush',
    category: 'combat',
    description: 'Hidden enemies strike from concealment with a surprise round. Terrain favors the attackers — the party must adapt fast or get picked apart.',
    slots: [
      { role: 'Skirmisher', crOffset: 0, count: 3, description: 'Fast, stealthy attackers who strike and reposition' },
      { role: 'Artillery', crOffset: 0, count: 2, description: 'Ranged attackers in elevated or hidden positions' },
    ],
    terrainSuggestions: ['Dense forest with heavy undergrowth', 'Narrow canyon with cliffs above', 'Foggy swamp with concealment'],
    tactics: 'Skirmishers engage the rear line, artillery focuses the healer. All enemies try to maintain advantage from hidden positions. They flee when outnumbered.',
    scaling: 'Easier: remove artillery. Harder: add a trapped area that splits the party when the ambush triggers.',
    narrativeHook: 'These attackers were sent by someone. Who? A note on one body reveals the employer.',
  },
  {
    id: 'siege-defense',
    name: 'Siege / Defense',
    category: 'combat',
    description: 'The party must defend a position against waves of attackers. Resource management matters — healing, spell slots, and positioning are critical.',
    slots: [
      { role: 'Brute', crOffset: -1, count: 3, description: 'Wave 1 — front-line chargers' },
      { role: 'Skirmisher', crOffset: -1, count: 3, description: 'Wave 2 — flankers who hit the back line' },
      { role: 'Boss', crOffset: 2, count: 1, description: 'Wave 3 — the commander arrives when minions fail' },
    ],
    terrainSuggestions: ['Bridge chokepoint', 'Ruined keep with barricades', 'Village with buildings to defend'],
    tactics: 'Wave 1 tests defenses. Wave 2 exploits gaps. Boss arrives when the party is depleted. Smart parties fortify between waves.',
    scaling: 'Easier: only 2 waves. Harder: add environmental hazard (fire arrows set buildings ablaze, rising water).',
    narrativeHook: 'Someone inside the defended position is a traitor — they open a back entrance during Wave 2.',
  },
  {
    id: 'ticking-clock',
    name: 'Ticking Clock',
    category: 'combat',
    description: 'Combat with a deadline. The party must defeat enemies AND accomplish an objective before time runs out (ritual completes, prisoner dies, building collapses).',
    slots: [
      { role: 'Controller', crOffset: 1, count: 1, description: 'Creature performing the ritual or guarding the objective' },
      { role: 'Brute', crOffset: -1, count: 3, description: 'Bodyguards who delay the party' },
    ],
    terrainSuggestions: ['Ritual circle that pulses with energy each round', 'Collapsing mine with falling debris', 'Ship taking on water'],
    tactics: 'Bodyguards don\'t need to win — they just need to stall. Controller focuses entirely on the objective. Party must split attention.',
    scaling: 'Easier: 8 rounds until deadline. Harder: 4 rounds, and bodyguards have sentinel-style reactions.',
    narrativeHook: 'Stopping the ritual has unintended consequences — the contained energy releases as a final blast.',
  },
  {
    id: 'phased-fight',
    name: 'Phased Fight',
    category: 'combat',
    description: 'The fight transforms at HP thresholds. The boss changes form, the terrain shifts, or reinforcements arrive. Keeps combat dynamic and unpredictable.',
    slots: [
      { role: 'Boss', crOffset: 4, count: 1, description: 'A powerful creature that transforms or escalates at 50% HP' },
    ],
    terrainSuggestions: ['Arena that changes — floor breaks away, lava rises, walls shift', 'A creature that grows larger and breaks the room', 'Planar rift that warps reality at each phase'],
    tactics: 'Phase 1: boss fights conventionally. Phase 2 (50% HP): boss enrages — new attacks, higher damage, terrain becomes hazardous. Optional Phase 3 (25%): desperate final form.',
    scaling: 'Easier: only 2 phases. Harder: 3 phases, each adding new legendary actions.',
    narrativeHook: 'The boss is sympathetic — at 50% HP, it begs for mercy and reveals it was being controlled.',
  },
  {
    id: 'rival-party',
    name: 'Rival Adventuring Party',
    category: 'combat',
    description: 'An NPC party that mirrors the PCs — a fighter, rogue, wizard, cleric equivalent. Tests the party against opponents who use similar tactics.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 1, preferred: ['Humanoid'], description: 'Fighter/barbarian equivalent — heavy armor, multi-attack' },
      { role: 'Skirmisher', crOffset: 0, count: 1, preferred: ['Humanoid'], description: 'Rogue equivalent — sneak attack, evasion' },
      { role: 'Artillery', crOffset: 0, count: 1, preferred: ['Humanoid'], description: 'Wizard equivalent — area spells, low HP' },
      { role: 'Controller', crOffset: 0, count: 1, preferred: ['Humanoid'], description: 'Cleric equivalent — heals, buffs, spirit guardians' },
    ],
    terrainSuggestions: ['Contested dungeon room both parties want', 'Tournament arena', 'Race to a treasure vault'],
    tactics: 'They use real party tactics — focus fire the healer, counterspell, flanking. Their rogue tries to steal the party\'s objective.',
    scaling: 'Easier: 3 rivals. Harder: 5 rivals with magic items.',
    narrativeHook: 'The rivals aren\'t evil — they have a legitimate competing claim. Can the party negotiate a split?',
  },
  {
    id: 'environmental-hazard',
    name: 'Environmental Hazard',
    category: 'combat',
    description: 'The terrain is as dangerous as the monsters. Lava, flooding, collapsing ceiling, toxic gas — the battlefield itself is a threat.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 2, description: 'Creatures immune or resistant to the hazard' },
      { role: 'Skirmisher', crOffset: -1, count: 2, description: 'Creatures that use the hazard to their advantage' },
    ],
    terrainSuggestions: ['Rising lava — safe ground shrinks each round', 'Freezing river — CON saves or take cold damage', 'Toxic spore clouds that move with the wind'],
    tactics: 'Enemies are adapted to the hazard (immune to fire, can swim in acid, etc.). They try to push PCs into danger zones. The hazard forces movement.',
    scaling: 'Easier: hazard deals low damage (1d6/round). Harder: hazard escalates each round and deals 3d6+.',
    narrativeHook: 'The hazard can be disabled — a valve, a ritual focus, a keystone. But it\'s guarded.',
  },
  {
    id: 'stealth-encounter',
    name: 'Stealth Encounter',
    category: 'combat',
    description: 'The party must eliminate enemies without alerting reinforcements. Noise or visibility triggers escalation.',
    slots: [
      { role: 'Minion', crOffset: -2, count: 4, description: 'Sentries on patrol — vulnerable alone, dangerous if they raise the alarm' },
      { role: 'Boss', crOffset: 3, count: 1, description: 'The commander in a central location — only appears if alarm sounds' },
    ],
    terrainSuggestions: ['Guard camp with tents and fire light', 'Castle corridors with patrol routes', 'Cave network with echo chambers'],
    tactics: 'Sentries have set patrol patterns. Killing one silently is fine — a body found or noise triggers alarm. If alarm sounds, boss + 2d4 reinforcements arrive in 2 rounds.',
    scaling: 'Easier: sentries are drowsy (disadvantage on Perception). Harder: magical alarm wards, darkvision sentries.',
    narrativeHook: 'One sentry is actually a prisoner forced to patrol. They\'ll help if the party can identify them.',
  },
  {
    id: 'gauntlet',
    name: 'Gauntlet / Attrition',
    category: 'combat',
    description: 'A series of 3 smaller fights with no long rest between them. Tests resource management — do you burn your best spells early or save them?',
    slots: [
      { role: 'Minion', crOffset: -2, count: 4, description: 'Fight 1 — easy warm-up that tempts players to overspend' },
      { role: 'Brute', crOffset: 0, count: 2, description: 'Fight 2 — tougher, designed to drain HP and healing' },
      { role: 'Boss', crOffset: 2, count: 1, description: 'Fight 3 — the real threat, when resources are low' },
    ],
    terrainSuggestions: ['Dungeon corridor leading to a final chamber', 'Tournament with escalating opponents', 'Descent through dungeon levels'],
    tactics: 'Each fight is individually manageable. The danger is cumulative attrition. Fight 3 is only "Hard" if the party is fresh — it becomes Deadly when depleted.',
    scaling: 'Easier: allow a short rest between fights 2 and 3. Harder: no rests at all, fights trigger back-to-back.',
    narrativeHook: 'The gauntlet is a test — an ancient guardian judges their worthiness based on how they handle each challenge.',
  },
  {
    id: 'protect-npc',
    name: 'Protect the NPC',
    category: 'combat',
    description: 'A squishy but important NPC is under attack. The party must defend them while fighting. Changes priorities — you can\'t just focus fire.',
    slots: [
      { role: 'Skirmisher', crOffset: 0, count: 3, description: 'Fast attackers that bypass the party to reach the NPC' },
      { role: 'Artillery', crOffset: 0, count: 1, description: 'Ranged attacker targeting the NPC from distance' },
    ],
    terrainSuggestions: ['Open road with an overturned wagon for cover', 'Temple with the NPC at the altar', 'Bridge where the NPC is working a mechanism'],
    tactics: 'Skirmishers use Dash/Disengage to get past the party front line. Artillery stays at max range. At least one enemy always targets the NPC.',
    scaling: 'Easier: NPC has 30 HP and can dodge. Harder: NPC has 15 HP, is restrained, and enemies have pack tactics.',
    narrativeHook: 'The NPC knows critical information but will only share it after being saved. If they die, the info dies with them.',
  },
  // ─── Narrative Patterns ─────────────────────────────────────────
  {
    id: 'moral-dilemma',
    name: 'Moral Dilemma',
    category: 'narrative',
    description: 'Both sides have legitimate grievances. Fighting either has consequences. The party must choose — or find a third option.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 2, description: 'Faction A — they seem hostile but have a reason' },
      { role: 'Brute', crOffset: 0, count: 2, description: 'Faction B — they seem friendly but are hiding something' },
    ],
    terrainSuggestions: ['Contested bridge between two territories', 'Village caught between two forces', 'Sacred ground both factions claim'],
    tactics: 'Neither faction attacks first. Tension builds through dialogue. If combat starts, both factions fight each other AND the party unless diplomacy intervenes.',
    scaling: 'Easier: one faction is clearly more reasonable. Harder: both factions have done terrible things — there\'s no "right" answer.',
    narrativeHook: 'A child from one faction has been taken by the other. But the "kidnapping" was actually a rescue from abuse.',
  },
  {
    id: 'monster-with-deal',
    name: 'Monster with a Deal',
    category: 'narrative',
    description: 'A creature that could be fought — but offers something valuable in exchange for a favor. Combat is an option, but not the best one.',
    slots: [
      { role: 'Boss', crOffset: 2, count: 1, description: 'An intelligent creature with information or an item the party needs' },
    ],
    terrainSuggestions: ['Creature\'s lair filled with trophies and trinkets', 'Crossroads with a mysterious stranger', 'Prison cell where the creature is confined'],
    tactics: 'The creature doesn\'t want to fight — it has something to lose. It negotiates shrewdly. If attacked, it fights to escape rather than to kill.',
    scaling: 'Easier: the deal is straightforward. Harder: the favor has hidden consequences.',
    narrativeHook: 'The creature knows the party\'s enemy intimately — they used to be allies.',
  },
  {
    id: 'three-way-fight',
    name: 'Three-Way Fight',
    category: 'narrative',
    description: 'The party stumbles into an ongoing battle between two factions. They can join either side, play them against each other, or let them weaken each other first.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 2, description: 'Faction A — already fighting when the party arrives' },
      { role: 'Skirmisher', crOffset: 0, count: 2, description: 'Faction B — the other side of the conflict' },
    ],
    terrainSuggestions: ['Dungeon corridor where two groups collided', 'Forest clearing with an abandoned camp', 'Underground market during a gang war'],
    tactics: 'Both factions are damaged when the party arrives. Whichever faction the party helps will be grateful — but the other becomes a future enemy.',
    scaling: 'Easier: one faction is nearly defeated. Harder: both are strong and both try to recruit the party mid-fight.',
    narrativeHook: 'The object both factions are fighting over is cursed — whoever claims it gets more than they bargained for.',
  },
  {
    id: 'mistaken-identity',
    name: 'Mistaken Identity',
    category: 'narrative',
    description: 'The "enemies" aren\'t actually hostile — or the "allies" aren\'t what they seem. Things aren\'t what they appear to be.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 3, description: 'Creatures that appear threatening but have a benign purpose' },
    ],
    terrainSuggestions: ['Dark dungeon where shadows play tricks', 'Forest where animals behave strangely', 'Village where everyone is afraid of outsiders'],
    tactics: 'The creatures act defensively — they posture and threaten but don\'t attack first. Observant players notice inconsistencies. Combat is avoidable with Insight or Investigation.',
    scaling: 'Easier: clues are obvious. Harder: the deception is layered — even after the first reveal, there\'s a deeper truth.',
    narrativeHook: 'The "monsters" are polymorphed villagers. The real villain is the one who transformed them.',
  },
  {
    id: 'revenge-encounter',
    name: 'Revenge Encounter',
    category: 'narrative',
    description: 'An enemy from earlier in the campaign returns — upgraded, with new allies, and a personal grudge.',
    slots: [
      { role: 'Boss', crOffset: 3, count: 1, description: 'The returning villain — stronger than before' },
      { role: 'Minion', crOffset: -2, count: 3, description: 'New allies the villain recruited specifically to counter the party' },
    ],
    terrainSuggestions: ['The party\'s home base under attack', 'A location meaningful to the original encounter', 'An inversion of the first fight — the villain controls the terrain now'],
    tactics: 'The villain has studied the party. Minions specifically counter party strengths (anti-magic for the wizard, silver weapons for the lycanthrope, etc.).',
    scaling: 'Easier: the villain overestimates themselves. Harder: the villain has a contingency plan and backup escape route.',
    narrativeHook: 'The villain doesn\'t want to kill the party — they want to take something precious from them (reputation, an ally, a magic item).',
  },
];

// ─── Recipe Selection ────────────────────────────────────────────

export function getRecipesByCategory(category: 'combat' | 'narrative'): EncounterRecipe[] {
  return ENCOUNTER_RECIPES.filter(r => r.category === category);
}

export function getRecipeById(id: string): EncounterRecipe | undefined {
  return ENCOUNTER_RECIPES.find(r => r.id === id);
}

export function fillRecipeSlots(
  recipe: EncounterRecipe,
  allMonsters: Monster[],
  partyLevel: number,
  environment?: Environment,
  rng: Rng = Math.random,
  xpBudget = Number.POSITIVE_INFINITY,
): { role: MonsterRole; monster: Monster; count: number }[] {
  const results: { role: MonsterRole; monster: Monster; count: number }[] = [];
  let remainingXp = xpBudget;

  for (let slotIndex = 0; slotIndex < recipe.slots.length; slotIndex += 1) {
    const slot = recipe.slots[slotIndex];
    const targetCr = Math.max(0, partyLevel + slot.crOffset);
    const crRange = 2;
    const futureCreatureCount = recipe.slots
      .slice(slotIndex + 1)
      .reduce((total, futureSlot) => total + futureSlot.count, 0);
    const cheapestXp = allMonsters.reduce(
      (minimum, monster) => Math.min(minimum, monster.xp),
      Number.POSITIVE_INFINITY,
    );
    const reserveXp = Number.isFinite(remainingXp) && Number.isFinite(cheapestXp)
      ? futureCreatureCount * cheapestXp
      : 0;
    const maxXpPerCreature = Number.isFinite(remainingXp)
      ? Math.floor(Math.max(0, remainingXp - reserveXp) / slot.count)
      : Number.POSITIVE_INFINITY;

    let candidates = allMonsters.filter(m => m.xp <= maxXpPerCreature);

    if (environment && environment !== 'Any') {
      const envFiltered = candidates.filter(m =>
        m.environments.includes(environment) || m.environments.includes('Any')
      );
      if (envFiltered.length > 0) candidates = envFiltered;
    }

    if (slot.preferred && slot.preferred.length > 0) {
      const typeFiltered = candidates.filter(m => slot.preferred!.includes(m.type));
      if (typeFiltered.length > 0) candidates = typeFiltered;
    }

    const nearby = candidates.filter(m =>
      m.challengeRating >= targetCr - crRange &&
      m.challengeRating <= targetCr + crRange
    );
    if (nearby.length > 0) candidates = nearby;

    // Prefer the intended role's CR, but the XP cap is authoritative. Recipes
    // should shape an encounter without silently changing its difficulty.
    candidates.sort((a, b) =>
      Math.abs(a.challengeRating - targetCr) - Math.abs(b.challengeRating - targetCr)
    );

    const pick = candidates[Math.floor(rng() * Math.min(5, candidates.length))];
    if (pick) {
      results.push({ role: slot.role, monster: pick, count: slot.count });
      remainingXp -= pick.xp * slot.count;
    }
  }

  return results;
}
