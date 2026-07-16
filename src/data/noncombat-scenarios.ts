// ─── Non-Combat Scenario Pools ────────────────────────────────────
// Content library for the contests (minigame) and hazard-gauntlet
// (environmental) puzzle families in src/lib/puzzle-engines. PR 2
// extends this same file with challenge-framework pools — keep the
// section banners so future additions stay easy to find.
//
// Authoring rule: no dice expressions or DC numbers in these strings
// — the engines attach the numbers. Keep prose vivid and table-ready,
// D&D fantasy register, no anachronisms.

export interface ContestType { name: string; skill: string; flavor: string }
export interface SideEvent { role: string; skill: string; effect: string }
export interface GauntletHazard { name: string; hazard: string; escape: string; skills: string[] }

// ─── Contest Types ─────────────────────────────────────────────────
export const CONTEST_TYPES: ContestType[] = [
  { name: 'Arm Wrestling', skill: 'Athletics', flavor: 'a scarred veteran who has not lost in years' },
  { name: 'Log Rolling', skill: 'Acrobatics', flavor: 'a barrel-chested riverman who seems born standing on water' },
  { name: 'Dart Throwing', skill: 'Sleight of Hand', flavor: 'a one-eyed sharpshooter who never seems to blink' },
  { name: "Liar's Dice", skill: 'Deception', flavor: 'a hollow-cheeked gambler whose smile never reaches the eyes' },
  { name: 'Boasting Contest', skill: 'Performance', flavor: 'a bard who has told the same tale nine hundred times, each grander than the last' },
  { name: 'Dancing Contest', skill: 'Performance', flavor: 'a nimble-footed reveler who has not sat down all night' },
  { name: 'Rowing Race', skill: 'Constitution', flavor: "a weathered ferry captain with forearms like ship's hawsers" },
  { name: 'Climbing Race', skill: 'Acrobatics', flavor: 'a lean roof-runner who scales walls purely for sport' },
  { name: 'Drinking Contest', skill: 'Constitution', flavor: 'a red-nosed innkeep who has already outlasted three apprentices tonight' },
  { name: 'Trivia of the Local Land', skill: 'History', flavor: "a spectacled archivist who corrects everyone's grammar out of habit" },
  { name: 'Staring Contest', skill: 'Intimidation', flavor: 'a stone-faced mercenary whose eyes have not blinked in living memory' },
  { name: 'Face-Reading Duel', skill: 'Insight', flavor: 'a retired bookmaker who reads a room like a ledger' },
];

// ─── Side Events ────────────────────────────────────────────────────
export const SIDE_EVENTS: SideEvent[] = [
  { role: 'Read the rival', skill: 'Insight', effect: 'learn their tell — grant advantage on one round' },
  { role: 'Work the crowd', skill: 'Performance', effect: "turn the room behind the party's contestant — grant advantage on one round" },
  { role: "Scout the rival's crew", skill: 'Perception', effect: 'spot the signal they plan to use — grant advantage on one round' },
  { role: 'Spot the cheat', skill: 'Investigation', effect: 'catch a weighted die or a marked card before it matters — grant advantage on one round' },
  { role: "Steady their nerve", skill: 'Charisma', effect: "keep the party's contestant's confidence from cracking — grant advantage on one round" },
  { role: 'Run the odds', skill: 'Sleight of Hand', effect: 'palm a whispered tip to the contestant between rounds — grant advantage on one round' },
  { role: 'Needle the challenger', skill: 'Deception', effect: 'plant a rumor that rattles their focus — grant advantage on one round' },
  { role: 'Read the terrain', skill: 'Survival', effect: 'note the wind, the slick patch, the uneven plank — grant advantage on one round' },
];

// ─── Gauntlet Hazards ───────────────────────────────────────────────
export const GAUNTLET_HAZARDS: GauntletHazard[] = [
  { name: 'The Flooding Chamber', hazard: 'water rises one foot per round', escape: 'find and wrench open the drain gate', skills: ['Athletics', 'Investigation'] },
  { name: 'The Shrinking Walls', hazard: 'the walls grind inward a pace every round, the ceiling following close behind', escape: 'jam the grinding gears with anything rigid enough to hold', skills: ['Athletics', 'Perception', 'Investigation'] },
  { name: 'The Gas Vault', hazard: 'a hissing vent fills the room with sickly green vapor, thicker with every round', escape: 'seal the vent and force the door before the air turns fatal', skills: ['Constitution', 'Investigation'] },
  { name: 'The Freezing Vault', hazard: 'the air bites colder every round as frost creeps up the walls and seals the seams', escape: 'light the brazier chain before the frost welds the exit shut', skills: ['Constitution', 'Survival', 'Sleight of Hand'] },
  { name: 'The Gravity Well', hazard: 'the pull shifts a quarter-turn each round, dragging loose gear and footing with it', escape: 'reach the anchor stone and brace it before the room fully inverts', skills: ['Acrobatics', 'Athletics'] },
  { name: 'The Sand Cascade', hazard: 'sand pours from cracks in the ceiling, burying the floor a little deeper each round', escape: 'clear the sluice grate before the chamber fills to the rafters', skills: ['Athletics', 'Investigation'] },
  { name: 'The Pendulum Hall', hazard: 'a bank of scythed pendulums swings lower and faster with every round', escape: 'time a dash to the far lever and haul it before being caught mid-swing', skills: ['Acrobatics', 'Perception'] },
  { name: 'The Swarm Nest', hazard: 'a broken seal releases stinging swarms that thicken with every passing round', escape: 'choke the nest opening and bar the inner door', skills: ['Athletics', 'Survival', 'Sleight of Hand'] },
  { name: 'The Collapsing Floor', hazard: 'flagstones crack and drop away, the safe footing shrinking round by round', escape: 'reach the support pillar and jam it before the floor gives out entirely', skills: ['Acrobatics', 'Athletics'] },
  { name: 'The Rising Current', hazard: 'a live current runs through the rising water, growing stronger and colder each round', escape: 'rope off to the anchor ring and crank the sluice shut', skills: ['Athletics', 'Investigation'] },
  { name: 'The Furnace Room', hazard: 'the walls glow hotter each round as unseen bellows stoke a hidden furnace beneath the floor', escape: 'douse the furnace core before the room turns to a kiln', skills: ['Constitution', 'Investigation'] },
  { name: 'The Spike Floor', hazard: 'iron spikes punch up through more of the floor with every round, the safe path narrowing', escape: 'reach the control plinth and reverse the mechanism', skills: ['Acrobatics', 'Perception'] },
];
