// ─── Non-Combat Encounter Generator ──────────────────────────────

export type ChallengeType = 'social' | 'exploration' | 'skill-challenge' | 'trap';

export interface SkillCheck {
  skill: string;
  dc: number;
  onSuccess: string;
  onFailure: string;
}

export interface NoncombatEncounter {
  id: string;
  name: string;
  type: ChallengeType;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  readAloud: string;
  situation: string;
  stakes: string;
  skillChecks: SkillCheck[];
  complication: string;
  outcomes: { label: string; description: string }[];
  reward: string;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0x7fffffff; return s / 0x7fffffff; };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function dc(level: number, diff: 'Easy' | 'Medium' | 'Hard'): number {
  const base = 10 + Math.floor(level / 2);
  if (diff === 'Easy') return base - 2;
  if (diff === 'Hard') return base + 3;
  return base;
}

// ─── Social Templates ───────────────────────────────────────────

const SOCIAL_NPCS = [
  { name: 'a desperate merchant', want: 'protection from bandits on the road', secret: 'is actually smuggling contraband in the cargo' },
  { name: 'a grieving noble', want: 'the party to retrieve a family heirloom from a tomb', secret: 'the heirloom is cursed and they know it' },
  { name: 'a nervous city guard', want: 'help investigating disappearances in the slums', secret: 'their captain is involved in the disappearances' },
  { name: 'a traveling bard', want: 'an escort through dangerous territory', secret: 'they\'re a spy carrying coded messages for a rival kingdom' },
  { name: 'a weeping priest', want: 'someone to cleanse a desecrated shrine', secret: 'they accidentally desecrated it themselves during a forbidden ritual' },
  { name: 'a cheerful innkeeper', want: 'help dealing with a "ghost" in the cellar', secret: 'the ghost is their deceased partner, and they don\'t actually want it banished' },
  { name: 'a haughty wizard', want: 'rare spell components the party might have', secret: 'the spell they\'re researching could endanger the entire town' },
  { name: 'a scarred veteran', want: 'recruits for a dangerous but well-paid mission', secret: 'the last group they hired didn\'t come back, and they know why' },
];

const SOCIAL_COMPLICATIONS = [
  'A rival faction is watching the conversation and will intervene if the party agrees.',
  'The NPC is being magically compelled — a DC {dc} Insight check reveals their eyes briefly flash an unnatural color.',
  'Time pressure: the opportunity expires at dawn. There\'s no time to verify the NPC\'s story.',
  'A third party arrives mid-conversation and offers a competing deal.',
  'The NPC\'s bodyguard doesn\'t trust the party and is actively trying to end the conversation.',
  'The meeting place is being raided — guards burst in and everyone must flee or fight.',
];

// ─── Exploration Templates ──────────────────────────────────────

const EXPLORATION_CHALLENGES = [
  { name: 'The Collapsed Passage', desc: 'A cave-in blocks the only route forward. Rubble fills a 30-foot section of tunnel.', skills: ['Athletics', 'Investigation', 'Survival'], creative: 'Shape stone, wildshape into something small, or blast through with magic' },
  { name: 'The Flooded Crossing', desc: 'A subterranean river cuts across the path. The current is swift and the water is chest-deep.', skills: ['Athletics', 'Nature', 'Perception'], creative: 'Freeze the water, tie a rope across, or find a narrow point upstream' },
  { name: 'The Crumbling Bridge', desc: 'A rope bridge spans a 60-foot chasm. It sways dangerously and several planks are missing.', skills: ['Acrobatics', 'Athletics', 'Investigation'], creative: 'Fly across, send the lightest person first with a rope, or find another route' },
  { name: 'The Poisonous Bog', desc: 'Thick purple mist clings to a swamp that must be crossed. The vapors burn the lungs.', skills: ['Survival', 'Nature', 'Constitution'], creative: 'Wet cloth masks, gust of wind to clear a path, or go around (adds 4 hours)' },
  { name: 'The Shifting Maze', desc: 'Dungeon walls rearrange themselves every few minutes. Navigating requires tracking the pattern.', skills: ['Investigation', 'Perception', 'Arcana'], creative: 'Mark walls with chalk, use detect magic to find the mechanism, or break through a wall' },
  { name: 'The Vertical Climb', desc: 'A 100-foot cliff face blocks the way. The stone is slick with moisture and has few handholds.', skills: ['Athletics', 'Perception', 'Survival'], creative: 'Spider climb, pitons and rope, or find a hidden switchback trail' },
];

// ─── Skill Challenge Templates ──────────────────────────────────

const SKILL_CHALLENGE_OBJECTIVES = [
  { name: 'Escape the Burning Building', setup: 'The building is ablaze. Smoke fills the corridors. Civilians are trapped on upper floors. You have minutes before it collapses.', primary: ['Athletics', 'Perception', 'Survival'], secondary: ['Arcana', 'Medicine', 'Persuasion'] },
  { name: 'Navigate the Political Gala', setup: 'You must win the support of three noble houses at a grand ball. Each has their own agenda and rivalries.', primary: ['Persuasion', 'Insight', 'Deception'], secondary: ['History', 'Performance', 'Sleight of Hand'] },
  { name: 'Track the Assassin', setup: 'An assassin struck and vanished into the city. The trail is going cold. Every wrong turn gives them more time to escape.', primary: ['Investigation', 'Perception', 'Survival'], secondary: ['Intimidation', 'Stealth', 'Insight'] },
  { name: 'Survive the Storm at Sea', setup: 'A magical tempest batters the ship. Waves crash over the deck. The mast is cracking. The crew looks to you for leadership.', primary: ['Athletics', 'Nature', 'Survival'], secondary: ['Arcana', 'Persuasion', 'Medicine'] },
  { name: 'Win the Crowd', setup: 'You stand before a hostile crowd that wants blood. You must convince them to spare the accused — or at least buy time for an escape.', primary: ['Persuasion', 'Intimidation', 'Performance'], secondary: ['Insight', 'Deception', 'History'] },
  { name: 'Disarm the Magical Ward', setup: 'A layered magical ward protects the vault. Each layer requires a different approach, and failed attempts trigger escalating defenses.', primary: ['Arcana', 'Investigation', 'Thieves\' Tools'], secondary: ['Perception', 'Religion', 'Nature'] },
];

// ─── Trap Templates ─────────────────────────────────────────────

const TRAP_TEMPLATES = [
  { name: 'Pressure Plate Darts', trigger: 'Stepping on a concealed pressure plate', effect: 'Darts fire from hidden wall slots', disarm: 'Thieves\' tools to jam the mechanism', twist: 'The plate also opens a secret door — disarming the trap locks the door permanently' },
  { name: 'Glyph of Warding', trigger: 'Opening the door or container without speaking the passphrase', effect: 'Explosive runes deal thunder/fire damage in a radius', disarm: 'Dispel magic, or find the passphrase in nearby clues', twist: 'The glyph is on the floor, not the door — the obvious door is safe, but the floor in front of it isn\'t' },
  { name: 'Pit Trap with Illusion', trigger: 'Walking over an illusory floor section', effect: 'Fall into a 20-foot pit with spikes at the bottom', disarm: 'Investigation or truesight reveals the illusion', twist: 'The pit contains a locked chest at the bottom — the "trap" is actually the entrance to a hidden vault' },
  { name: 'Collapsing Ceiling', trigger: 'Removing the treasure from its pedestal', effect: 'Ceiling collapses — heavy damage and buried condition', disarm: 'Place equivalent weight on the pedestal before removing the item', twist: 'The ceiling is structural — collapsing it opens the room above, which contains enemies' },
  { name: 'Alarm Runes', trigger: 'Crossing the threshold without the correct token', effect: 'Piercing alarm audible within 300 feet, summons guards in 1d4 rounds', disarm: 'Find or forge the token, or DC check to suppress the runes temporarily', twist: 'The alarm is two-way — it also alerts the trap-setter\'s enemy, creating a three-way situation' },
  { name: 'Polymorph Trap', trigger: 'Touching the enchanted object', effect: 'Target must save or be polymorphed into a harmless creature for 1 hour', disarm: 'Detect magic reveals the enchantment; Dispel Magic removes it', twist: 'The polymorphed form is a specific creature needed to solve another puzzle in the dungeon' },
];

// ─── Generator ───────────────────────────────────────────────────

function generateSocial(level: number, difficulty: 'Easy' | 'Medium' | 'Hard', rng: () => number): NoncombatEncounter {
  const npc = pick(SOCIAL_NPCS, rng);
  const comp = pick(SOCIAL_COMPLICATIONS, rng).replace('{dc}', String(dc(level, difficulty)));
  const d = dc(level, difficulty);
  return {
    id: `nc-${Date.now()}`, name: `The ${pick(['Proposition', 'Request', 'Plea', 'Offer', 'Demand', 'Confession'], rng)}`,
    type: 'social', difficulty,
    readAloud: `You are approached by ${npc.name}. Their expression is earnest, though something about their manner gives you pause.`,
    situation: `${npc.name.charAt(0).toUpperCase() + npc.name.slice(1)} wants: ${npc.want}.`,
    stakes: `If the party helps: they gain an ally and a reward. If they refuse: the NPC becomes desperate and may take matters into their own hands — creating a future problem. Secret: ${npc.secret}.`,
    skillChecks: [
      { skill: 'Insight', dc: d, onSuccess: 'You sense the NPC is hiding something — their story doesn\'t fully add up.', onFailure: 'The NPC seems completely sincere.' },
      { skill: 'Persuasion', dc: d, onSuccess: 'You negotiate better terms — double the reward or key information upfront.', onFailure: 'The NPC won\'t budge on terms. Take it or leave it.' },
      { skill: 'Intimidation', dc: d + 2, onSuccess: 'The NPC reveals their secret out of fear.', onFailure: 'The NPC shuts down and refuses to deal with you.' },
      { skill: 'Investigation', dc: d + 1, onSuccess: 'You notice physical evidence that corroborates — or contradicts — their story.', onFailure: 'Nothing seems out of place.' },
    ],
    complication: comp,
    outcomes: [
      { label: 'Accept the deal', description: 'The party gains the stated reward but becomes entangled in the NPC\'s secret complications.' },
      { label: 'Refuse', description: 'The NPC seeks help elsewhere — their actions may cause problems the party encounters later.' },
      { label: 'Uncover the secret', description: 'Confronting the NPC with the truth opens a third path: they offer a bigger reward for discretion, or the party can leverage the information.' },
    ],
    reward: `${pick(['50', '100', '200', '500'], rng)} GP, plus the NPC owes the party a favor. If the secret is uncovered, add ${pick(['a rare magic item', 'a valuable piece of information', 'a political alliance', 'a map to a hidden location'], rng)}.`,
  };
}

function generateExploration(level: number, difficulty: 'Easy' | 'Medium' | 'Hard', rng: () => number): NoncombatEncounter {
  const ch = pick(EXPLORATION_CHALLENGES, rng);
  const d = dc(level, difficulty);
  return {
    id: `nc-${Date.now()}`, name: ch.name, type: 'exploration', difficulty,
    readAloud: ch.desc,
    situation: `The party must find a way past this obstacle to continue their journey.`,
    stakes: `Success: continue on the intended path. Failure: take damage, gain exhaustion, or lose time (${pick(['2 hours', '4 hours', 'half a day'], rng)} detour).`,
    skillChecks: ch.skills.map(s => ({
      skill: s, dc: d,
      onSuccess: `You successfully navigate the obstacle using ${s}.`,
      onFailure: `Your attempt fails — ${pick(['you take 2d6 damage', 'you gain 1 level of exhaustion', 'you lose equipment', 'the obstacle worsens'], rng)}.`,
    })),
    complication: pick([
      'Hostile creatures are attracted by the noise of your attempts.',
      'The obstacle is getting worse — the DC increases by 2 each failed attempt.',
      'One party member gets separated on the other side.',
      'A hidden passage is revealed, but it leads somewhere unexpected.',
    ], rng),
    outcomes: [
      { label: 'Overcome directly', description: 'The party pushes through with skill checks and continues.' },
      { label: 'Find a creative solution', description: ch.creative },
      { label: 'Go around', description: 'Costs significant time but avoids the risk entirely.' },
    ],
    reward: `Past the obstacle, the party finds ${pick(['a sheltered campsite (safe long rest)', 'a forgotten cache of supplies', 'ancient carvings that provide a clue', 'a shortcut that saves hours of travel'], rng)}.`,
  };
}

function generateSkillChallenge(level: number, difficulty: 'Easy' | 'Medium' | 'Hard', rng: () => number): NoncombatEncounter {
  const obj = pick(SKILL_CHALLENGE_OBJECTIVES, rng);
  const d = dc(level, difficulty);
  const needed = difficulty === 'Easy' ? 3 : difficulty === 'Medium' ? 5 : 7;
  return {
    id: `nc-${Date.now()}`, name: obj.name, type: 'skill-challenge', difficulty,
    readAloud: obj.setup,
    situation: `Skill challenge: ${needed} successes before 3 failures. Each party member acts in turn.`,
    stakes: `Success: the party achieves the objective cleanly. Failure: partial success with consequences, or outright failure depending on how many successes were earned.`,
    skillChecks: [
      ...obj.primary.map(s => ({ skill: s, dc: d, onSuccess: `A primary success — ${s} directly advances the objective.`, onFailure: `The approach backfires — one failure recorded and the situation escalates.` })),
      ...obj.secondary.map(s => ({ skill: s, dc: d - 2, onSuccess: `A supporting success — ${s} gives advantage on the next primary check.`, onFailure: `No progress, but no failure recorded either.` })),
    ],
    complication: pick([
      `At 2 failures, the situation escalates dramatically — the DC increases by 2 for all remaining checks.`,
      `After the 3rd success, a new obstacle appears that requires a different approach.`,
      `One party member is forced out of the challenge (injured, separated, captured) — the rest must continue without them.`,
      `A moral choice: one easy path guarantees success but requires sacrificing something important.`,
    ], rng),
    outcomes: [
      { label: `${needed}+ successes`, description: 'Complete success — the party achieves everything they set out to do.' },
      { label: `${Math.ceil(needed / 2)}-${needed - 1} successes`, description: 'Partial success — objective achieved but with a cost (injury, lost time, compromised position).' },
      { label: `Fewer than ${Math.ceil(needed / 2)} successes`, description: 'Failure — the objective is lost. The party must deal with the consequences and find another way.' },
    ],
    reward: `On full success: ${pick(['key information', 'a powerful ally', 'safe passage', 'a magic item', 'significant gold'], rng)}. On partial: half reward plus a complication.`,
  };
}

function generateTrap(level: number, difficulty: 'Easy' | 'Medium' | 'Hard', rng: () => number): NoncombatEncounter {
  const trap = pick(TRAP_TEMPLATES, rng);
  const d = dc(level, difficulty);
  const dmg = difficulty === 'Easy' ? `${Math.ceil(level / 2)}d6` : difficulty === 'Medium' ? `${Math.ceil(level / 2)}d8` : `${level}d6`;
  return {
    id: `nc-${Date.now()}`, name: trap.name, type: 'trap', difficulty,
    readAloud: `The passage ahead seems unremarkable — ${pick(['almost too quiet', 'but dust motes dance in the still air', 'though the walls bear faint scratches at ankle height', 'but you notice a faint clicking sound'], rng)}.`,
    situation: `Trigger: ${trap.trigger}. Effect: ${trap.effect} (${dmg} damage, DC ${d} save for half).`,
    stakes: `Detection avoids it entirely. Failure to detect means full effect. Disarming opens new possibilities.`,
    skillChecks: [
      { skill: 'Perception', dc: d, onSuccess: `You spot the trap before triggering it: ${trap.trigger.toLowerCase()}.`, onFailure: 'You don\'t notice anything unusual.' },
      { skill: 'Investigation', dc: d - 2, onSuccess: 'You deduce the trap mechanism and how to safely bypass it.', onFailure: 'You suspect something but can\'t pinpoint it.' },
      { skill: 'Thieves\' Tools', dc: d + 1, onSuccess: `You successfully disarm the trap. ${trap.disarm}.`, onFailure: `The trap triggers during your attempt — ${dmg} damage (DC ${d} DEX save for half).` },
    ],
    complication: `Twist: ${trap.twist}`,
    outcomes: [
      { label: 'Detected and disarmed', description: 'No damage taken. The party may gain additional benefits from the twist.' },
      { label: 'Detected but not disarmed', description: 'The party can avoid the trap or deliberately trigger it from a safe distance.' },
      { label: 'Triggered', description: `Full effect: ${dmg} damage. The twist adds an additional complication.` },
    ],
    reward: `The trap guards ${pick(['a treasure cache', 'a secret passage', 'an important clue', 'a magic item', 'the entrance to the next area'], rng)}.`,
  };
}

// ─── Public API ──────────────────────────────────────────────────

export function generateNoncombatEncounter(
  options: {
    type?: ChallengeType;
    difficulty?: 'Easy' | 'Medium' | 'Hard';
    partyLevel?: number;
    seed?: number;
  } = {}
): NoncombatEncounter {
  const { type, difficulty = 'Medium', partyLevel = 5, seed = Date.now() } = options;
  const rng = seededRandom(seed);

  const chosen = type ?? pick(['social', 'exploration', 'skill-challenge', 'trap'] as ChallengeType[], rng);

  switch (chosen) {
    case 'social': return generateSocial(partyLevel, difficulty, rng);
    case 'exploration': return generateExploration(partyLevel, difficulty, rng);
    case 'skill-challenge': return generateSkillChallenge(partyLevel, difficulty, rng);
    case 'trap': return generateTrap(partyLevel, difficulty, rng);
  }
}

export function getChallengeTypes(): { value: ChallengeType; label: string; description: string }[] {
  return [
    { value: 'social', label: 'Social Encounter', description: 'NPC interactions with stakes, secrets, and skill checks' },
    { value: 'exploration', label: 'Exploration Challenge', description: 'Environmental obstacles and survival scenarios' },
    { value: 'skill-challenge', label: 'Skill Challenge', description: 'Multi-check structured encounters (4e-style)' },
    { value: 'trap', label: 'Trap Encounter', description: 'Detection, disarming, and consequences with a twist' },
  ];
}
