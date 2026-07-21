import {
  type Monster,
  type Environment,
  type CreatureType,
  type EncounterBeatTrigger,
  type EncounterRecipePlan,
} from './types';
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

export interface FilledRecipeSlot {
  role: MonsterRole;
  monster: Monster;
  count: number;
}

export interface RecipePlanContext {
  environment: Environment;
  partyLevel: number;
  partySize: number;
  seed: number;
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
  {
    id: 'control-ground',
    name: 'Control the Ground',
    category: 'combat',
    description: 'Three important zones turn the battlefield into a contest of movement and control. Defeating enemies helps, but holding ground wins the encounter.',
    slots: [
      { role: 'Controller', crOffset: 0, count: 1, description: 'A coordinator who dislodges heroes from scoring zones' },
      { role: 'Skirmisher', crOffset: -1, count: 3, description: 'Mobile claimants who move between objectives' },
    ],
    terrainSuggestions: ['Ruined plaza with three raised shrines', 'Gatehouse with two winches and a signal tower', 'Planar nexus with three unstable anchors'],
    tactics: 'Enemies contest zones instead of trading attacks in place. The controller pushes, restrains, or divides; skirmishers abandon wounded targets to steal unattended ground.',
    scaling: 'Easier: the party needs 3 control points. Harder: the enemy starts with 2 points and hazards activate on occupied zones.',
    narrativeHook: 'Each controlled point reveals part of a sealed message or suppresses one layer of a larger ward.',
  },
  {
    id: 'seize-escape',
    name: 'Seize & Escape',
    category: 'combat',
    description: 'The party must take a portable objective and get its carrier off the battlefield. The fight becomes a relay, pursuit, and extraction instead of a wipeout.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 2, description: 'Blockers guarding the objective and exit lanes' },
      { role: 'Skirmisher', crOffset: -1, count: 3, description: 'Pursuers who chase, grapple, and recover the objective' },
    ],
    terrainSuggestions: ['Vault floor with a distant service exit', 'Dockside warehouse with a waiting skiff', 'Cracked temple with a portal that opens intermittently'],
    tactics: 'The defenders protect the route, not their lives. Once the objective moves, skirmishers pursue the carrier while brutes block the nearest exit.',
    scaling: 'Easier: the carrier keeps full speed. Harder: carrying the objective costs 10 feet of Speed and prevents reactions.',
    narrativeHook: 'The objective reacts to its carrier, revealing a memory, omen, or unwanted magical bond during the escape.',
  },
  {
    id: 'rescue-reinforcements',
    name: 'Rescue Under Fire',
    category: 'combat',
    description: 'Captives are trapped in the battlefield while enemy reinforcements close in. The party must free and extract them before the fight becomes unwinnable.',
    slots: [
      { role: 'Brute', crOffset: 0, count: 2, description: 'Jailers who hold the center and punish rescue attempts' },
      { role: 'Artillery', crOffset: -1, count: 2, description: 'Overwatch covering the captives and exits' },
    ],
    terrainSuggestions: ['Burning prison wagon in a muddy crossroads', 'Flooding dungeon cells beneath a guard balcony', 'Web-bound captives suspended across a cavern'],
    tactics: 'Jailers stay between heroes and captives. Artillery holds attacks for anyone interacting with restraints. At round 4, signs of a larger force make withdrawal urgent.',
    scaling: 'Easier: one action frees every captive. Harder: three separate restraints require checks while under fire.',
    narrativeHook: 'One captive refuses to leave without recovering evidence that could clear their name.',
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

// ─── Harnessed recipe text engine ────────────────────────────────

interface RecipeBeatScript {
  title: string;
  trigger: EncounterBeatTrigger;
  guidance: string;
  effect: string;
}

interface RecipeScript {
  objective: { title: string; summary: string; success: string; failure: string };
  setup: string[];
  beats: RecipeBeatScript[];
  forecast: { headline: string; guidance: string[]; caveat: string };
  closing: string;
  specialParticipant?: (context: RecipePlanContext) => EncounterRecipePlan['specialParticipant'];
}

const RECIPE_SCRIPTS: Record<string, RecipeScript> = {
  'boss-minions': {
    objective: {
      title: 'Break the command structure',
      summary: 'Defeat {leader} or force it to yield while surviving pressure from {minions}.',
      success: 'The leader falls or yields; surviving followers scatter or surrender.',
      failure: 'The party withdraws, or the leader completes its purpose while the minions keep the heroes occupied.',
    },
    setup: ['Place {leader} where {terrain} gives it cover or distance.', 'Start {minions} between the party and the leader; leave one route that rewards a risky push.'],
    beats: [
      { title: 'The screen closes', trigger: { kind: 'round', round: 2 }, guidance: '{minions} converge on the hero creating the clearest path to {leader}.', effect: 'One minion Helps, grapples, or blocks a lane instead of dealing damage.' },
      { title: 'Command breaks', trigger: { kind: 'enemies-remaining', count: 1 }, guidance: 'With its support gone, {leader} abandons restraint.', effect: 'The leader presses the most wounded hero, exposes itself, and offers a surrender or escape opening.' },
    ],
    forecast: { headline: 'Target selection matters more than raw win rate.', guidance: ['A forecast assumes efficient focus fire; splitting damage between leader and minions usually makes the table fight harder.', 'Compare the deadliest foe with the intended leader. If they differ, rewrite the leader role around the actual threat.'], caveat: 'The forecast cannot value body-blocking, surrender, or the leader losing discipline.' },
    closing: 'If {leader} survives, it remembers who broke through the screen and changes its defenses next time.',
  },
  ambush: {
    objective: { title: 'Survive the kill zone', summary: 'Reach defensible ground and neutralize {artillery} before the ambushers isolate a hero.', success: 'The party establishes a safe line or drives off half the attackers.', failure: 'A hero is captured, the party flees through the attackers’ chosen route, or the ambushers seize the party’s cargo.', },
    setup: ['Use {terrain}; mark two concealed firing positions and one defensible fallback point.', 'Give the party a visible clue before initiative: disturbed ground, a cut birdcall, or an unnatural silence.'],
    beats: [
      { title: 'Crossfire', trigger: { kind: 'round', round: 1 }, guidance: '{artillery} attack from separate angles while {skirmishers} threaten the rear.', effect: 'Describe the safest nearby cover so the opening has a decision, not only surprise damage.' },
      { title: 'Exit closes', trigger: { kind: 'round', round: 3 }, guidance: 'The ambushers shift to the party’s apparent retreat route.', effect: 'Move one attacker without an opportunity attack, or reveal a prepared obstacle instead of making an extra attack.' },
    ],
    forecast: { headline: 'Read the first-round damage spike, not only the final win rate.', guidance: ['Use the knockout rates to identify who the ambushers would target.', 'If a battle map is attached, check whether contact time reflects the intended concealed range.'], caveat: 'Surprise, concealment, and escape behavior are simplified by the forecast.' },
    closing: 'A searched position points toward whoever selected this kill zone and supplied the attackers.',
  },
  'siege-defense': {
    objective: { title: 'Hold until relief', summary: 'Keep the defended position secure through three escalating waves.', success: 'The position remains usable when the commander’s wave breaks.', failure: 'Enemies occupy the objective for a full round or destroy the thing the party came to defend.' },
    setup: ['Turn {terrain} into three approaches: obvious, exposed, and concealed.', 'Let the party place two simple defenses before initiative. Each should delay one approach for a round.'],
    beats: [
      { title: 'First breach', trigger: { kind: 'round', round: 1 }, guidance: '{brutes} test the strongest defense and reveal how the siege will score progress.', effect: 'Keep later-wave creatures off the turn order until their cue.' },
      { title: 'Flanking wave', trigger: { kind: 'round', round: 3 }, guidance: '{skirmishers} enter from the least protected approach.', effect: 'Add the skirmishers at the end of the current round; they prioritize the objective.' },
      { title: 'Commander commits', trigger: { kind: 'round', round: 5 }, guidance: '{leader} enters through the approach that caused the most trouble.', effect: 'The leader offers surrender once, then personally attacks the defenses.' },
    ],
    forecast: { headline: 'Treat the full-roster forecast as an upper bound.', guidance: ['The simulator fields every creature together; staged waves should be easier early and more punishing through resource attrition.', 'Watch average rounds: a result shorter than the final-wave cue means the schedule needs to accelerate.'], caveat: 'Wave timing, fortifications, and spent spell slots are not modeled.' },
    closing: 'The condition of the defended position determines the reward: intact, damaged, or won at a lasting cost.',
  },
  'ticking-clock': {
    objective: { title: 'Beat the deadline', summary: 'Stop {controllers} and complete the battlefield objective before the end of round 6.', success: 'The objective is secured before the final pulse.', failure: 'The deadline completes even if every enemy is defeated afterward.' },
    setup: ['Place the objective at {terrain} and show a six-segment clock.', 'State what one hero can do to advance or reverse the clock before initiative.'],
    beats: [
      { title: 'First pulse', trigger: { kind: 'round', round: 2 }, guidance: 'Show a concrete consequence of delay: a cracked seal, falling beam, or fading prisoner.', effect: 'Advance the visible clock and name the remaining rounds.' },
      { title: 'Complication', trigger: { kind: 'round', round: 4 }, guidance: '{brutes} abandon damage to obstruct the hero nearest the objective.', effect: 'Create difficult terrain, a grapple, or a blocked interaction lane.' },
      { title: 'Last chance', trigger: { kind: 'round', round: 6 }, guidance: 'Announce the final actionable turn plainly.', effect: 'Resolve success or failure at the end of the round; defeating enemies alone does not stop it.' },
    ],
    forecast: { headline: 'Use rounds-to-victory as the key result.', guidance: ['An average longer than 6 rounds signals that the combat roster conflicts with the deadline.', 'A high win rate can still be a scenario loss if heroes cannot spare actions for the objective.'], caveat: 'The forecast spends every action on combat and cannot attempt the objective.' },
    closing: 'On a narrow success, let the stopped process leave one unstable consequence for the next scene.',
  },
  'phased-fight': {
    objective: { title: 'Survive the transformation', summary: 'Defeat {leader} as its behavior and the battlefield change at 50% and 25% HP.', success: 'The final form is overcome and the transformed terrain settles.', failure: 'The party is driven out, or the final form reaches the feature that completes its transformation.' },
    setup: ['Choose {terrain} and identify one visible feature that will change in each phase.', 'Divide the leader’s hit points into 50% and 25% thresholds; foreshadow both transformations.'],
    beats: [
      { title: 'Phase two', trigger: { kind: 'leader-hp', percent: 50 }, guidance: '{leader} changes posture, form, or intent as the first threshold breaks.', effect: 'Clear one removable condition on the leader, change one movement option, and activate the first terrain hazard.' },
      { title: 'Final phase', trigger: { kind: 'leader-hp', percent: 25 }, guidance: 'The leader becomes desperate and the safest part of the arena changes.', effect: 'Trade defense for pressure: expose a weakness while increasing movement or damage, without adding hit points.' },
    ],
    forecast: { headline: 'The forecast measures the HP shell, not phase mechanics.', guidance: ['Use the HP curve to estimate when each threshold arrives.', 'If the leader drops too quickly, make phase changes reposition or reveal choices rather than secretly adding health.'], caveat: 'Condition clears, form-specific actions, and changing hazards are not simulated.' },
    closing: 'The final form leaves physical evidence of what transformed the leader—and whether it could happen again.',
  },
  'rival-party': {
    objective: { title: 'Outplay the rivals', summary: 'Secure the contested prize or force the rival party to concede.', success: 'The party controls the prize and at least one rival can carry word of the result.', failure: 'The rivals escape with the prize or publicly force the heroes to yield.' },
    setup: ['At {terrain}, give both parties an equally short route to the prize.', 'Assign each rival one visible counterpart or counter-tactic among the heroes.'],
    beats: [
      { title: 'They adapt', trigger: { kind: 'round', round: 2 }, guidance: 'The rivals call out a party tactic they have studied.', effect: 'One rival switches targets or Readies an action that directly answers the heroes’ last round.' },
      { title: 'Terms on the table', trigger: { kind: 'enemies-remaining', count: 2 }, guidance: 'A rival offers a split, wager, or mutual retreat before losses become permanent.', effect: 'Pause initiative long enough for a real answer; refusal gives the rivals a clear escape priority.' },
    ],
    forecast: { headline: 'A mirrored roster amplifies action-economy swings.', guidance: ['Knockout rates help choose which rival needs a defensive escape plan.', 'A lopsided forecast is acceptable if the weaker side can win by taking the prize.'], caveat: 'Counterspells, concessions, theft, and escape priorities are only approximated.' },
    closing: 'Record which rival was spared, embarrassed, or respected; that reaction is the real reward of the encounter.',
  },
  'environmental-hazard': {
    objective: { title: 'Master the battlefield', summary: 'Defeat or bypass the adapted enemies while preventing the {environment} hazard from controlling every safe route.', success: 'The party reaches safety or disables the hazard with the enemy threat contained.', failure: 'The battlefield becomes impassable or forces the party into the enemies’ chosen exit.' },
    setup: ['Use {terrain}; mark a safe zone, a danger zone, and the control point that can alter the hazard.', 'Tell players exactly when the hazard changes: initiative 20 each round.'],
    beats: [
      { title: 'Hazard shifts', trigger: { kind: 'round', round: 2 }, guidance: 'Shrink or move the safe area toward the enemy formation.', effect: 'At initiative 20, move the hazard one band; show the next band before it becomes dangerous.' },
      { title: 'Terrain fails', trigger: { kind: 'round', round: 4 }, guidance: 'A route collapses, floods, ignites, or becomes unstable.', effect: 'Close one route and open a risky alternate path through the control point.' },
    ],
    forecast: { headline: 'Position and forced movement decide this recipe.', guidance: ['A map forecast can show contact time, but not escalating hazard damage.', 'Treat a close numerical result as harder if enemies can repeatedly push heroes into danger.'], caveat: 'Changing safe zones and hazard-control interactions are not simulated.' },
    closing: 'After combat, the altered terrain reveals a passage, resource, or scar that would not otherwise exist.',
  },
  'stealth-encounter': {
    objective: { title: 'Complete the mission quietly', summary: 'Reach {leader} or the objective without filling a three-step alarm track.', success: 'The objective is secured before the alarm reaches 3.', failure: 'At alarm 3, the commander and reinforcements arrive; survival replaces stealth as the goal.' },
    setup: ['Map three patrol routes through {terrain} and place a visible three-step alarm track.', 'State what raises alarm: an audible attack, a body found, or a sentry ending a turn with line of sight.'],
    beats: [
      { title: 'Patrol crosses', trigger: { kind: 'round', round: 2 }, guidance: 'A patrol changes route toward the party’s last disturbance.', effect: 'Move one sentry between cover points; give players a moment to react before detection.' },
      { title: 'Alarm response', trigger: { kind: 'manual', label: 'When alarm reaches 3' }, guidance: '{leader} enters and surviving sentries stop patrolling.', effect: 'Add the leader at the start of the next round and switch enemies to containment tactics.' },
    ],
    forecast: { headline: 'Forecast two states: quiet success and alarmed combat.', guidance: ['The full roster represents the alarmed failure state, not the desired path.', 'Use the result to ensure discovery creates danger without making retreat impossible.'], caveat: 'Detection, silent takedowns, and delayed reinforcements are outside the combat model.' },
    closing: 'The final alarm score determines how much evidence, time, and anonymity the party keeps.',
  },
  gauntlet: {
    objective: { title: 'Reach the final chamber', summary: 'Clear three stages without a long rest and defeat {leader} with enough resources left to continue.', success: 'The leader falls and the party preserves at least one meaningful recovery resource.', failure: 'The party withdraws between stages or reaches the leader too depleted to finish.' },
    setup: ['Separate {minions}, {brutes}, and {leader} into three physical groups at {terrain}.', 'Allow one minute between stages for potions and features, but no short or long rest unless the easier option is chosen.'],
    beats: [
      { title: 'Stage one: temptation', trigger: { kind: 'round', round: 1 }, guidance: '{minions} look numerous but fragile; make spending a major resource feel tempting.', effect: 'Only the minion group is active.' },
      { title: 'Stage two: pressure', trigger: { kind: 'round', round: 3 }, guidance: '{brutes} arrive as the party crosses the midpoint.', effect: 'Begin the second stage after the first ends; carry HP and expended resources forward.' },
      { title: 'Stage three: consequence', trigger: { kind: 'round', round: 5 }, guidance: '{leader} confronts the party with full knowledge of how they handled the earlier stages.', effect: 'Begin the final stage; the leader targets the resource pattern the party relied on most.' },
    ],
    forecast: { headline: 'The combined-roster forecast is intentionally pessimistic.', guidance: ['Run or mentally assess each stage separately; the value is cumulative HP and resource loss.', 'Use knockout rates from the full roster only as a warning about an over-tuned finale.'], caveat: 'The simulator fields all creatures together and refreshes repeatable behavior between rounds.' },
    closing: 'The party’s remaining resources determine whether the reward is freely claimed or demands one last sacrifice.',
  },
  'protect-npc': {
    objective: { title: 'Keep the witness alive', summary: 'Keep the Protected NPC conscious until every attacker is defeated or driven off.', success: 'The Protected NPC survives and completes the task or shares the promised information.', failure: 'The Protected NPC reaches 0 HP; the battle can continue, but the primary objective is lost.' },
    setup: ['Place the Protected NPC near cover at {terrain}; their tracker entry is added automatically.', 'Name one task the NPC must spend an action on each round instead of hiding.'],
    beats: [
      { title: 'They break through', trigger: { kind: 'round', round: 2 }, guidance: '{skirmishers} use Dash or Disengage to reach the Protected NPC.', effect: 'At least one enemy changes target to the NPC even if another target is tactically easier.' },
      { title: 'The ward falls', trigger: { kind: 'ally-at-zero' }, guidance: 'The objective is lost unless a hero can immediately stabilize or revive the NPC.', effect: 'Mark failure if the NPC remains at 0 HP when the round ends.' },
    ],
    forecast: { headline: 'A party win can still be an objective loss.', guidance: ['Use monster damage output to judge whether the NPC can survive one focused round.', 'If the party is heavily favored, keep pressure on movement and protection rather than adding HP to enemies.'], caveat: 'The forecast does not redirect attacks toward the added NPC or score their survival.' },
    closing: 'How much harm the NPC suffered changes their trust, testimony, or ability to help in the next scene.',
    specialParticipant: ({ partyLevel }) => ({ name: 'Protected NPC', kind: 'ally', armorClass: 11 + Math.floor(partyLevel / 5), maxHp: Math.max(10, 8 + partyLevel * 3), notes: 'Recipe objective · can Dodge or work on the protected task' }),
  },
  'control-ground': {
    objective: { title: 'Score 5 control points', summary: 'At the end of each round, gain 1 point if the party controls at least two of three marked zones.', success: 'The party reaches 5 points before the enemy does.', failure: 'The enemy reaches 5 points first, even if their remaining creatures are later defeated.' },
    setup: ['At {terrain}, mark three zones at least 30 feet apart.', 'A side controls a zone when only its conscious creatures are inside it; track both sides from 0.'],
    beats: [
      { title: 'Score the field', trigger: { kind: 'round', round: 1 }, guidance: 'At the end of every round, announce who controls each zone.', effect: 'Award 1 point to a side controlling two or more zones; award none on a split field.' },
      { title: 'The center destabilizes', trigger: { kind: 'round', round: 4 }, guidance: 'The central zone becomes dangerous but remains valuable.', effect: 'A creature ending its turn there takes modest environmental damage or makes a save to hold position.' },
    ],
    forecast: { headline: 'Mobility is more valuable than the win rate suggests.', guidance: ['Compare speed and ranged reach when deciding whether the roster can contest all three zones.', 'A slower party may need fewer points or closer zones even when its damage forecast is strong.'], caveat: 'Zone occupancy, scoring, and movement priorities are not simulated.' },
    closing: 'The final score determines how completely the party controls the site and what remains contested.',
  },
  'seize-escape': {
    objective: { title: 'Extract the objective', summary: 'Take the objective from the center of {terrain} and carry it through the marked exit.', success: 'A hero carrying the objective leaves through the exit.', failure: 'The defenders recover it for a full round, or every possible carrier is downed.' },
    setup: ['Place the objective halfway between party and defenders; mark an exit at least 60 feet away.', 'Picking up, dropping, or handing off the objective uses an Utilize action.'],
    beats: [
      { title: 'The chase begins', trigger: { kind: 'manual', label: 'When a hero takes the objective' }, guidance: '{skirmishers} abandon other targets and pursue the carrier.', effect: 'The carrier loses 10 feet of Speed; an adjacent ally can receive a handoff as an action.' },
      { title: 'Exit threatened', trigger: { kind: 'round', round: 4 }, guidance: '{brutes} move to block the shortest route to extraction.', effect: 'Reveal a longer route that offers cover but costs distance.' },
    ],
    forecast: { headline: 'Survival is secondary to route length and carrier pressure.', guidance: ['Use average rounds as the time window before attrition overwhelms the carrier.', 'A low win rate can still produce a fair extraction if the exit is reachable in two committed turns.'], caveat: 'Carrying, passing, pursuit priorities, and leaving the map are not simulated.' },
    closing: 'Who carries the objective across the line determines who it bonds with, implicates, or reveals itself to.',
  },
  'rescue-reinforcements': {
    objective: { title: 'Free and extract the captives', summary: 'Complete three rescue actions and get the captives to the marked exit before round 6.', success: 'All three rescue segments are complete and at least one hero escorts the captives out.', failure: 'Round 6 ends before extraction; overwhelming reinforcements claim the site.' },
    setup: ['Use {terrain}; place three rescue segments together or at separate restraints.', 'A hero adjacent to a restraint can spend an action to clear one segment; damage does not clear them.'],
    beats: [
      { title: 'Conditions worsen', trigger: { kind: 'round', round: 3 }, guidance: 'Smoke, water, webs, or panic make the next rescue action harder.', effect: 'The next rescue attempt needs a moderate ability check; failure costs the action, not a segment.' },
      { title: 'Reinforcements sighted', trigger: { kind: 'round', round: 4 }, guidance: 'Show the approaching force and name the exit route.', effect: 'Start a visible two-round countdown; remaining enemies shift to delaying withdrawal.' },
      { title: 'Overrun', trigger: { kind: 'round', round: 6 }, guidance: 'Resolve extraction now rather than adding a second full encounter.', effect: 'Unextracted captives are lost; heroes still on the field must retreat under pressure.' },
    ],
    forecast: { headline: 'Budget three hero actions away from damage.', guidance: ['A close forecast becomes much harder when rescue actions replace attacks.', 'Average battle length above 5 rounds means either shorten the roster or move the exit closer.'], caveat: 'Rescue checks, captive movement, and overwhelming reinforcements are not simulated.' },
    closing: 'Each captive saved adds a witness, clue, or relationship; each one lost changes the story rather than merely the XP.',
  },
  'moral-dilemma': {
    objective: { title: 'Choose what peace costs', summary: 'Learn what both factions need and reach a decision before violence makes compromise impossible.', success: 'The party secures a concession from both sides or knowingly accepts the cost of choosing one.', failure: 'One faction is destroyed before its truth is learned, leaving the party with a false version of events.' },
    setup: ['At {terrain}, place both factions in defensible positions with the party between them.', 'Write one legitimate grievance and one hidden wrongdoing for each faction.'],
    beats: [
      { title: 'First truth', trigger: { kind: 'round', round: 1 }, guidance: 'One combatant uses its turn to reveal a grievance instead of attacking.', effect: 'Pause for a response; a hero who engages can attempt to shift one faction’s attitude.' },
      { title: 'Irreversible cost', trigger: { kind: 'enemies-remaining', count: 2 }, guidance: 'Make clear what knowledge, relationship, or future aid dies with the next combatant.', effect: 'Offer one final ceasefire window before the next damaging action.' },
    ],
    forecast: { headline: 'The forecast is a consequence check, not the desired solution.', guidance: ['Use each side’s threat to make choosing violence informed.', 'Do not balance away the moral asymmetry: a weaker faction can still be the harder choice.'], caveat: 'Persuasion, faction switching, and partial victory are not simulated.' },
    closing: 'Write down which truth the party accepted; let future NPCs remember that version.',
  },
  'monster-with-deal': {
    objective: { title: 'Leave with terms—or a body', summary: 'Learn what {leader} offers, what it wants, and decide whether the price is better than combat.', success: 'The party reaches an enforceable agreement or wins while preserving the thing it came for.', failure: 'The creature escapes with its leverage, or the desired information or item is destroyed in combat.' },
    setup: ['Place {leader} at {terrain} with a visible escape route and visible leverage.', 'Write its opening offer, minimum acceptable price, and one promise it cannot safely keep.'],
    beats: [
      { title: 'Revised offer', trigger: { kind: 'leader-hp', percent: 50 }, guidance: '{leader} names the hidden cost of killing it and offers narrower terms.', effect: 'Give the party one round to answer; the creature uses that round to prepare escape, not attack.' },
      { title: 'Leverage moves', trigger: { kind: 'round', round: 3 }, guidance: 'The deal’s valuable object, witness, or secret becomes endangered.', effect: 'Show a non-damage action that can preserve the leverage before combat ends.' },
    ],
    forecast: { headline: 'Use lethality to price the deal.', guidance: ['A dangerous forecast makes concessions credible; an easy one means the creature needs stronger leverage.', 'Check whether the leader is likely to survive until its second offer.'], caveat: 'Negotiation, escape, and destruction of leverage are not simulated.' },
    closing: 'Whether bargained with or defeated, the creature leaves a favor owed, a secret exposed, or an enemy informed.',
  },
  'three-way-fight': {
    objective: { title: 'Exploit the conflict', summary: 'Secure the contested object or alliance while Faction A and Faction B remain independent actors.', success: 'The party leaves with the objective and a clear relationship to at least one faction.', failure: 'The factions unite against the party or the contested object is lost in the fighting.' },
    setup: ['Split the roster into two visibly distinct factions at {terrain}.', 'Start each non-party combatant at 75% HP to show the battle was already underway.'],
    beats: [
      { title: 'Recruitment attempt', trigger: { kind: 'round', round: 1 }, guidance: 'Each faction offers the party a different immediate reward for help.', effect: 'A hero can answer freely; the chosen faction avoids targeting that hero until betrayed.' },
      { title: 'Balance shifts', trigger: { kind: 'enemies-remaining', count: 2 }, guidance: 'The surviving faction turns from survival to claiming the objective.', effect: 'Re-evaluate alliances openly; gratitude does not erase competing goals.' },
    ],
    forecast: { headline: 'One combined forecast hides the faction geometry.', guidance: ['Treat the roster result as the danger if every side turns on the party.', 'The intended fight should become easier when the party commits to one faction, but cost them the other relationship.'], caveat: 'Faction target selection, pre-existing damage, and temporary alliances are not simulated.' },
    closing: 'The side the party did not help becomes a named future pressure, not a forgotten survivor.',
  },
  'mistaken-identity': {
    objective: { title: 'Recognize the truth', summary: 'Find three contradictions before the apparent enemies are killed or the false ally completes its plan.', success: 'The party identifies the mistaken identity and redirects the encounter.', failure: 'The truth arrives only after irreversible harm, empowering the real antagonist.' },
    setup: ['At {terrain}, prepare three clues: behavior, physical evidence, and a statement that does not fit.', 'Have the apparent enemies defend space or people rather than opening with lethal attacks.'],
    beats: [
      { title: 'First contradiction', trigger: { kind: 'round', round: 1 }, guidance: 'An apparent enemy protects something innocent at personal cost.', effect: 'Give any observing hero the clue without requiring a roll; a check reveals why.' },
      { title: 'The mask slips', trigger: { kind: 'round', round: 3 }, guidance: 'The true hostile actor makes a move that cannot fit the original story.', effect: 'Let the party change targets or halt combat without losing a turn to procedure.' },
    ],
    forecast: { headline: 'The forecast represents the cost of missing the clues.', guidance: ['Make the avoidable fight survivable but consequential.', 'If it is trivially easy, killing first has too little cost; use relationships or lost information rather than extra HP.'], caveat: 'Recognition, hesitation, and changing sides are not simulated.' },
    closing: 'Reveal who benefited from the mistake and how they arranged the misleading evidence.',
  },
  'revenge-encounter': {
    objective: { title: 'Break the revenge plan', summary: 'Defeat or outmaneuver {leader} before it takes the specific thing it came to destroy.', success: 'The target of the grudge is preserved and the returning enemy cannot repeat this plan.', failure: 'The villain achieves its personal objective even if it later loses the fight.' },
    setup: ['Use {terrain}, chosen because it counters something the party relied on before.', 'Name the villain’s revenge target and one contingency prepared for a known hero tactic.'],
    beats: [
      { title: 'I learned that trick', trigger: { kind: 'round', round: 2 }, guidance: '{leader} reveals a prepared answer to the party’s most memorable old tactic.', effect: 'Counter it once, clearly and fairly; reveal the limitation so the party can adapt.' },
      { title: 'Revenge over survival', trigger: { kind: 'leader-hp', percent: 25 }, guidance: 'The villain abandons self-preservation to reach the revenge target.', effect: 'Open an escape or finishing opportunity while the villain attempts the personal objective.' },
    ],
    forecast: { headline: 'The villain’s objective should survive a favorable party forecast.', guidance: ['Use the deadliest-foe result to verify that the returning villain, not a minion, owns the scene.', 'If the villain drops early, give it positioning or a contingency—not invisible bonus HP.'], caveat: 'Prepared counters and attacks against a narrative objective are not simulated.' },
    closing: 'The result permanently changes the grudge: ended, inherited, or made more personal.',
  },
};

function roleNames(filled: readonly FilledRecipeSlot[], role: MonsterRole): string {
  const names = [...new Set(filled.filter((slot) => slot.role === role).map((slot) => slot.monster.name))];
  return names.length > 0 ? names.join(' and ') : role.toLowerCase();
}

function renderRecipeText(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/gi, (match, token: string) => tokens[token] ?? match);
}

export function buildRecipePlan(
  recipe: EncounterRecipe,
  filled: readonly FilledRecipeSlot[],
  context: RecipePlanContext,
): EncounterRecipePlan {
  const script = RECIPE_SCRIPTS[recipe.id];
  if (!script) throw new Error(`Recipe ${recipe.id} is missing its playbook script.`);
  const terrain = recipe.terrainSuggestions[Math.abs(context.seed) % recipe.terrainSuggestions.length];
  const tokens: Record<string, string> = {
    environment: context.environment,
    terrain,
    party: `${context.partySize} heroes`,
    level: String(context.partyLevel),
    leader: roleNames(filled, 'Boss'),
    boss: roleNames(filled, 'Boss'),
    minions: roleNames(filled, 'Minion'),
    brutes: roleNames(filled, 'Brute'),
    artillery: roleNames(filled, 'Artillery'),
    skirmishers: roleNames(filled, 'Skirmisher'),
    controllers: roleNames(filled, 'Controller'),
    enemies: [...new Set(filled.map((slot) => slot.monster.name))].join(', '),
  };
  const render = (value: string) => renderRecipeText(value, tokens);
  return {
    version: 1,
    recipeId: recipe.id,
    recipeName: recipe.name,
    objective: {
      title: render(script.objective.title),
      summary: render(script.objective.summary),
      success: render(script.objective.success),
      failure: render(script.objective.failure),
    },
    setup: script.setup.map(render),
    beats: script.beats.map((beat, index) => ({
      id: `${recipe.id}-beat-${index + 1}`,
      title: render(beat.title),
      trigger: beat.trigger,
      guidance: render(beat.guidance),
      effect: render(beat.effect),
    })),
    forecast: {
      headline: render(script.forecast.headline),
      guidance: script.forecast.guidance.map(render),
      caveat: render(script.forecast.caveat),
    },
    terrain: render(terrain),
    closing: render(script.closing),
    ...(script.specialParticipant ? { specialParticipant: script.specialParticipant(context) } : {}),
  };
}

export function describeRecipeTrigger(trigger: EncounterBeatTrigger): string {
  if (trigger.kind === 'round') return `Round ${trigger.round}`;
  if (trigger.kind === 'leader-hp') return `Leader at ${trigger.percent}% HP`;
  if (trigger.kind === 'enemies-remaining') return `${trigger.count} enem${trigger.count === 1 ? 'y' : 'ies'} remaining`;
  if (trigger.kind === 'ally-at-zero') return 'Objective ally at 0 HP';
  return trigger.label;
}

export function getRecipePlaybookPreview(recipeId: string): { objective: string; beats: number } | null {
  const script = RECIPE_SCRIPTS[recipeId];
  return script ? { objective: script.objective.title, beats: script.beats.length } : null;
}

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
): FilledRecipeSlot[] {
  const results: FilledRecipeSlot[] = [];
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
