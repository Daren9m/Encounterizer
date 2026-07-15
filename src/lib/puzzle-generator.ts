// ─── Puzzle & Minigame Generator ─────────────────────────────────

import { seededRandom, shuffleArray, pickRandom as pick } from './random';

export type PuzzleCategory = 'logic' | 'word' | 'physical' | 'minigame' | 'environmental';
export type PuzzleDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface Puzzle {
  id: string;
  name: string;
  category: PuzzleCategory;
  difficulty: PuzzleDifficulty;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  playerHandout?: string;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
}

interface PuzzleTemplate {
  category: PuzzleCategory;
  difficulty: PuzzleDifficulty;
  estimatedMinutes: number;
  generate: (partyLevel: number, rng: () => number) => Puzzle;
}

function dcForLevel(level: number, diff: PuzzleDifficulty): number {
  const base = 10 + Math.floor(level / 2);
  if (diff === 'Easy') return base - 2;
  if (diff === 'Hard') return base + 3;
  return base;
}

function goldForLevel(level: number): string {
  if (level <= 4) return `${10 + level * 5} GP`;
  if (level <= 10) return `${50 + level * 20} GP`;
  return `${200 + level * 50} GP`;
}

// ─── Riddle Templates ───────────────────────────────────────────

const RIDDLES: { riddle: string; answer: string }[] = [
  { riddle: 'I have cities but no houses, forests but no trees, water but no fish. What am I?', answer: 'A map' },
  { riddle: 'The more you take, the more you leave behind. What am I?', answer: 'Footsteps' },
  { riddle: 'I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?', answer: 'An echo' },
  { riddle: 'I can be cracked, made, told, and played. What am I?', answer: 'A joke' },
  { riddle: 'What has a head and a tail but no body?', answer: 'A coin' },
  { riddle: 'I am not alive, but I grow; I don\'t have lungs, but I need air; I don\'t have a mouth, but water kills me. What am I?', answer: 'Fire' },
  { riddle: 'The more of me there is, the less you see. What am I?', answer: 'Darkness' },
  { riddle: 'I have keys but no locks. I have space but no room. You can enter but can\'t go inside. What am I?', answer: 'A keyboard (or in D&D: a harpsichord / organ)' },
  { riddle: 'What can travel around the world while staying in a corner?', answer: 'A stamp (or in D&D: a seal / sigil)' },
  { riddle: 'I am always hungry, I must always be fed. The finger I touch will soon turn red. What am I?', answer: 'Fire' },
  { riddle: 'What has roots as nobody sees, is taller than trees, up up it goes, and yet never grows?', answer: 'A mountain' },
  { riddle: 'Voiceless it cries, wingless flutters, toothless bites, mouthless mutters. What is it?', answer: 'The wind' },
];

const CIPHER_ALPHABETS = [
  { name: 'Draconic', flavor: 'angular runes etched in dragonfire' },
  { name: 'Infernal', flavor: 'twisted script that seems to writhe' },
  { name: 'Elvish', flavor: 'flowing script of silver and starlight' },
  { name: 'Dwarvish', flavor: 'blocky runes carved into stone' },
  { name: 'Celestial', flavor: 'luminous glyphs that hover in the air' },
];

const SEQUENCE_ELEMENTS = [
  ['Sun', 'Moon', 'Star', 'Cloud', 'Lightning'],
  ['Dragon', 'Phoenix', 'Griffon', 'Hydra', 'Basilisk'],
  ['Ruby', 'Sapphire', 'Emerald', 'Diamond', 'Amethyst'],
  ['Spring', 'Summer', 'Autumn', 'Winter'],
  ['Earth', 'Water', 'Fire', 'Air', 'Void'],
  ['Crown', 'Sword', 'Shield', 'Scepter', 'Ring'],
];

const MINIGAME_CONTESTS = [
  { name: 'Drinking Contest', skill: 'Constitution', flavor: 'dwarven ale that burns going down' },
  { name: 'Arm Wrestling', skill: 'Athletics', flavor: 'a scarred half-orc who hasn\'t lost in years' },
  { name: 'Knife Throwing', skill: 'Dexterity', flavor: 'a spinning target wheel with a nervous volunteer' },
  { name: 'Riddle Duel', skill: 'Intelligence', flavor: 'a sphinx who wagers secrets' },
  { name: 'Staring Contest', skill: 'Wisdom', flavor: 'a medusa\'s handmaiden (eyes safely covered)' },
  { name: 'Boasting Match', skill: 'Charisma', flavor: 'a crowd of rowdy tavern-goers judging' },
];

const HAZARD_ROOMS = [
  { name: 'Flooding Chamber', hazard: 'water rises 1 foot per round', escape: 'find and open the drain grate' },
  { name: 'Shrinking Room', hazard: 'walls close in 5 feet per round', escape: 'press the hidden pressure plates in sequence' },
  { name: 'Poison Gas Chamber', hazard: 'CON save each round or take poison damage', escape: 'block the vents with provided stones' },
  { name: 'Freezing Vault', hazard: 'temperature drops — cold damage escalates each round', escape: 'light the four braziers with the correct elements' },
  { name: 'Gravity Flux Room', hazard: 'gravity reverses every 2 rounds', escape: 'reach the keystone on the ceiling (or floor)' },
];

// ─── Template Generators ─────────────────────────────────────────

const TEMPLATES: PuzzleTemplate[] = [
  // ── Logic: Door Riddle ──
  {
    category: 'logic', difficulty: 'Easy', estimatedMinutes: 5,
    generate(level, rng) {
      const r = pick(RIDDLES, rng);
      const dc = dcForLevel(level, 'Easy');
      return {
        id: `puzzle-${Date.now()}`, name: 'The Riddle Door', category: 'logic', difficulty: 'Easy', estimatedMinutes: 5,
        dmBrief: `A door with a carved face speaks a riddle. Answer: "${r.answer}". If stuck, DC ${dc} Intelligence (Investigation) check reveals a clue.`,
        readAloud: `A massive stone door blocks the passage. A carved face in its center opens its eyes as you approach and speaks in a rumbling voice:\n\n"${r.riddle}"`,
        playerHandout: `"${r.riddle}"`,
        hints: [`DC ${dc} Investigation: The carvings around the door depict scenes related to the answer.`, `DC ${dc - 2} History: This type of riddle is common in ${pick(['dwarven', 'elven', 'ancient'], rng)} tombs.`, `The face repeats the riddle with emphasis on the key phrase.`],
        solution: `The answer is "${r.answer}". Speaking it aloud causes the door to open.`,
        failureConsequence: `After 3 wrong answers, the face breathes a gust of wind dealing ${level}d4 force damage (DC ${dc} DEX save for half) and resets.`,
        reward: `The passage beyond contains ${goldForLevel(level)} and a clue to the dungeon's deeper secrets.`,
      };
    },
  },
  // ── Logic: Sequence Lock ──
  {
    category: 'logic', difficulty: 'Medium', estimatedMinutes: 15,
    generate(level, rng) {
      const elements = pick(SEQUENCE_ELEMENTS, rng);
      const sequence = shuffleArray(elements, rng).slice(0, 4);
      const dc = dcForLevel(level, 'Medium');
      return {
        id: `puzzle-${Date.now()}`, name: 'The Sequence Lock', category: 'logic', difficulty: 'Medium', estimatedMinutes: 15,
        dmBrief: `Five pedestals with symbols. Four must be activated in the correct order: ${sequence.join(' → ')}. Clues are murals on the walls depicting the sequence.`,
        readAloud: `The chamber contains five stone pedestals, each bearing a glowing symbol: ${elements.join(', ')}. On the far wall, faded murals depict a story — and in the corners of each scene, you notice the same symbols appear in a specific order.`,
        playerHandout: `Symbols: ${elements.join(' · ')}\n\nMural scenes depict: ${sequence.map((s, i) => `Scene ${i + 1}: ${s} is prominent`).join('. ')}.`,
        hints: [`DC ${dc} Perception: The murals clearly show the order.`, `DC ${dc - 2} Arcana: The symbols pulse faintly in the correct order if you watch long enough.`, `Pressing a wrong symbol resets the sequence with an audible chime.`],
        solution: `Activate the pedestals in order: ${sequence.join(' → ')}. The exit opens.`,
        failureConsequence: `Each wrong attempt triggers a magical trap: ${Math.ceil(level / 2)}d6 lightning damage to whoever pressed it (DC ${dc} DEX save for half).`,
        reward: `A hidden compartment reveals a ${pick(['Potion of Greater Healing', 'spell scroll', 'enchanted weapon', 'ancient tome'], rng)} and ${goldForLevel(level)}.`,
      };
    },
  },
  // ── Word: Cipher Message ──
  {
    category: 'word', difficulty: 'Medium', estimatedMinutes: 10,
    generate(level, rng) {
      const alphabet = pick(CIPHER_ALPHABETS, rng);
      const shift = 1 + Math.floor(rng() * 5);
      const phrases = ['THE KEY IS HIDDEN IN THE SHADOW', 'SPEAK THE NAME OF THE FALLEN KING', 'TURN BACK OR FACE THE GUARDIAN', 'THE TREASURE LIES BENEATH THE ALTAR', 'TRUST NOT THE DOOR THAT OPENS FREELY'];
      const phrase = pick(phrases, rng);
      const cipher = phrase.split('').map(c => {
        if (c === ' ') return ' ';
        const code = c.charCodeAt(0);
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      }).join('');
      const dc = dcForLevel(level, 'Medium');
      return {
        id: `puzzle-${Date.now()}`, name: 'The Cipher', category: 'word', difficulty: 'Medium', estimatedMinutes: 10,
        dmBrief: `A Caesar cipher (shift ${shift}) in ${alphabet.name} script. Plain text: "${phrase}". Players receive the cipher text as a handout.`,
        readAloud: `You find a stone tablet covered in ${alphabet.flavor}. The ${alphabet.name} script is recognizable, but the words make no sense — they've been encoded.`,
        playerHandout: `Encoded message (${alphabet.name} script):\n\n${cipher}\n\n(Each letter has been shifted by a consistent amount)`,
        hints: [`DC ${dc} Arcana: This is a substitution cipher — each letter represents a different letter.`, `DC ${dc - 3} Intelligence: The word pattern suggests common phrases. Short words like "THE" or "IS" are good starting points.`, `A character who speaks ${alphabet.name} gets advantage on deciphering.`],
        solution: `Shift each letter back by ${shift} positions. The message reads: "${phrase}"`,
        failureConsequence: `Without the message, the party misses the clue and must take the longer, more dangerous route.`,
        reward: `The decoded message reveals ${pick(['the location of a hidden passage', 'the weakness of the dungeon boss', 'where the treasure vault key is hidden', 'the true name of the guardian (advantage on persuasion)'], rng)}.`,
      };
    },
  },
  // ── Physical: Tile Floor ──
  {
    category: 'physical', difficulty: 'Hard', estimatedMinutes: 20,
    generate(level, rng) {
      const dc = dcForLevel(level, 'Hard');
      const gridSize = 4 + Math.floor(rng() * 2);
      const safePath = Math.floor(rng() * 3) + 3;
      return {
        id: `puzzle-${Date.now()}`, name: 'The Deadly Floor', category: 'physical', difficulty: 'Hard', estimatedMinutes: 20,
        dmBrief: `A ${gridSize}x${gridSize} tiled floor. ${safePath} tiles are safe (marked with a subtle pattern). Wrong tiles trigger dart traps (${Math.ceil(level / 2)}d6 piercing, DC ${dc} DEX save for half). Pattern: safe tiles form a path matching the constellation painted on the ceiling.`,
        readAloud: `A ${gridSize * 5}-foot square room stretches before you. The floor is a grid of ornate tiles, each bearing a different astronomical symbol. On the ceiling, a painted constellation gleams faintly. At the far end: a locked door with no visible mechanism.`,
        playerHandout: `Floor Grid: ${gridSize}x${gridSize} tiles with symbols (stars, moons, suns, comets, planets).\nCeiling: A constellation pattern connecting ${safePath} specific stars.`,
        hints: [`DC ${dc} Perception: The constellation on the ceiling matches ${safePath} specific tiles on the floor.`, `DC ${dc - 2} Survival: Dust on certain tiles is undisturbed — no one has stepped on them (those are the TRAP tiles, not safe ones).`, `Tossing a coin onto a wrong tile triggers the trap harmlessly — the dart hits the coin.`],
        solution: `Step only on tiles matching the constellation pattern. The path is ${safePath} tiles long. Reaching the far wall deactivates the traps and unlocks the door.`,
        failureConsequence: `Each wrong tile: ${Math.ceil(level / 2)}d6 piercing damage (DC ${dc} DEX save for half). After 3 failures, the room locks and fills with gas (${level}d4 poison damage per round, DC ${dc} CON save for half).`,
        reward: `Beyond the door: ${goldForLevel(level)}, a ${pick(['rare magic item', 'map to a hidden vault', 'key to the next level', 'legendary weapon fragment'], rng)}.`,
      };
    },
  },
  // ── Minigame: Tavern Contest ──
  {
    category: 'minigame', difficulty: 'Easy', estimatedMinutes: 10,
    generate(level, rng) {
      const contest = pick(MINIGAME_CONTESTS, rng);
      const dc = dcForLevel(level, 'Easy');
      const rounds = 3 + Math.floor(rng() * 3);
      return {
        id: `puzzle-${Date.now()}`, name: contest.name, category: 'minigame', difficulty: 'Easy', estimatedMinutes: 10,
        dmBrief: `A ${contest.name.toLowerCase()} in ${rounds} rounds. Each round: opposed ${contest.skill} checks (NPC bonus = +${level + 2}). Best of ${rounds} rounds wins. Stakes: gold and information.`,
        readAloud: `The tavern erupts in cheers as a challenger steps forward — ${contest.flavor}. "Care for a friendly wager?" they grin. "${contest.name}. ${rounds} rounds. Loser buys drinks for the house."`,
        hints: [`Players can use other skills to gain advantage: Insight to read the opponent, Sleight of Hand to cheat, Intimidation to rattle them.`, `Cheating: DC ${dc + 3} Sleight of Hand. If caught, the crowd turns hostile.`, `Other party members can Help (DC ${dc} appropriate skill to give advantage).`],
        solution: `Win ${Math.ceil(rounds / 2)} of ${rounds} rounds of opposed ${contest.skill} checks. NPC has +${level + 2} bonus.`,
        failureConsequence: `Lose: pay ${Math.floor(level * 5)} GP for drinks. The NPC gloats but respects a good sport — they'll still share information, just less of it.`,
        reward: `Win: ${goldForLevel(level)} from the wager, plus the NPC shares a rumor: ${pick(['the location of a hidden dungeon', 'the weakness of a local monster', 'a secret about the local lord', 'where to find a rare spell component', 'that someone in town is a shapechanger'], rng)}.`,
      };
    },
  },
  // ── Environmental: Hazard Room ──
  {
    category: 'environmental', difficulty: 'Hard', estimatedMinutes: 15,
    generate(level, rng) {
      const room = pick(HAZARD_ROOMS, rng);
      const dc = dcForLevel(level, 'Hard');
      const rounds = 4 + Math.floor(rng() * 4);
      return {
        id: `puzzle-${Date.now()}`, name: room.name, category: 'environmental', difficulty: 'Hard', estimatedMinutes: 15,
        dmBrief: `${room.name}: ${room.hazard}. Party has ${rounds} rounds to ${room.escape}. After ${rounds} rounds, the hazard becomes lethal. Requires Investigation (DC ${dc}) to find the mechanism and a group skill check to activate it.`,
        readAloud: `The door slams shut behind you with a thunderous boom. A grinding noise fills the chamber — ${room.hazard}. The walls are lined with strange mechanisms, and you have moments to act.`,
        hints: [`DC ${dc} Investigation: You spot the mechanism — ${room.escape}.`, `DC ${dc - 3} Perception: There's a pattern to the hazard that reveals a timing window.`, `Brute force (DC ${dc + 5} Athletics) can delay the hazard by 2 rounds but won't stop it.`],
        solution: `Find the mechanism (DC ${dc} Investigation), then ${room.escape}. Requires a DC ${dc} group check (Athletics, Arcana, or Thieves' Tools depending on approach).`,
        failureConsequence: `If not solved in ${rounds} rounds: ${level}d6 damage per round (appropriate type) with no save. The room can still be escaped by breaking the door (AC 18, HP ${level * 10}, immune to the hazard's damage type).`,
        reward: `The mechanism, once solved, reveals a hidden compartment containing ${goldForLevel(level)} and a ${pick(['Potion of Resistance', 'Immovable Rod', 'Bag of Holding', 'Decanter of Endless Water'], rng)}.`,
      };
    },
  },
];

// ─── Public API ──────────────────────────────────────────────────

export function generatePuzzle(
  options: {
    category?: PuzzleCategory;
    difficulty?: PuzzleDifficulty;
    partyLevel?: number;
    seed?: number;
  } = {}
): Puzzle {
  const {
    category,
    difficulty,
    partyLevel = 5,
    seed = Date.now(),
  } = options;

  const rng = seededRandom(seed);

  let candidates = TEMPLATES;
  if (category) candidates = candidates.filter(t => t.category === category);
  if (difficulty) candidates = candidates.filter(t => t.difficulty === difficulty);
  if (candidates.length === 0) candidates = TEMPLATES;

  const template = pick(candidates, rng);
  return template.generate(partyLevel, rng);
}

export function getPuzzleCategories(): { value: PuzzleCategory; label: string }[] {
  return [
    { value: 'logic', label: 'Logic & Riddles' },
    { value: 'word', label: 'Word & Cipher' },
    { value: 'physical', label: 'Physical / Spatial' },
    { value: 'minigame', label: 'Minigames & Contests' },
    { value: 'environmental', label: 'Environmental Hazards' },
  ];
}
