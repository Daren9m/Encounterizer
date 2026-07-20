export type RulesReferenceCategoryId =
  | 'checks-saves'
  | 'conditions'
  | 'combat'
  | 'damage-recovery'
  | 'movement-visibility';

export interface RulesReferenceCategory {
  id: RulesReferenceCategoryId;
  label: string;
  description: string;
}

export const SRD_5_2_1_URL =
  'https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf';

export interface RulesReferenceSource {
  document: 'SRD 5.2.1';
  section: string;
  /** Printed page number in the SRD, not the zero-based PDF page index. */
  page: number;
}

export interface RulesReferenceEntry {
  id: string;
  category: RulesReferenceCategoryId;
  title: string;
  summary: string;
  details: string[];
  tags?: string[];
  sources: readonly RulesReferenceSource[];
}

function srdSource(section: string, page: number): RulesReferenceSource {
  return { document: 'SRD 5.2.1', section, page };
}

export const RULES_REFERENCE_CATEGORIES: readonly RulesReferenceCategory[] = [
  { id: 'conditions', label: 'Conditions', description: 'Every SRD 5.2.1 condition at a glance.' },
  { id: 'checks-saves', label: 'Checks & saves', description: 'DCs, save selection, and d20 tests.' },
  { id: 'combat', label: 'Combat', description: 'Actions, cover, reactions, and turn timing.' },
  { id: 'damage-recovery', label: 'Damage & recovery', description: 'Concentration, death saves, healing, and rests.' },
  { id: 'movement-visibility', label: 'Movement & sight', description: 'Terrain, movement, light, and hiding.' },
] as const;

export const RULES_REFERENCE_ENTRIES: readonly RulesReferenceEntry[] = [
  {
    id: 'saving-throws',
    category: 'checks-saves',
    title: 'Saving Throws',
    summary: 'Roll d20 + the named ability modifier + proficiency when proficient; meet or beat the DC.',
    details: [
      'Strength: resist direct physical force.',
      'Dexterity: dodge out of harm’s way.',
      'Constitution: endure poison, disease, or another bodily hazard.',
      'Intelligence: recognize an illusion or resist an assault on reasoning.',
      'Wisdom: resist fear, charm, or another mental assault.',
      'Charisma: assert identity or presence against displacement or possession.',
      'A creature can choose to fail a save if it doesn’t want to resist the effect.',
    ],
    tags: ['save', 'saving throw', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    sources: [srdSource('Playing the Game: Saving Throws', 7)],
  },
  {
    id: 'typical-dcs',
    category: 'checks-saves',
    title: 'Typical Difficulty Classes',
    summary: 'Very easy 5 · Easy 10 · Medium 15 · Hard 20 · Very hard 25 · Nearly impossible 30.',
    details: [
      'Use a check only when failure is meaningful and the outcome is uncertain.',
      'The rules set some DCs; otherwise the DM chooses the DC that fits the task.',
      'A spell save DC is normally 8 + spellcasting ability modifier + Proficiency Bonus.',
    ],
    tags: ['dc', 'difficulty class', 'spell save dc', 'ability check'],
    sources: [
      srdSource('Playing the Game: D20 Tests and Ability Checks', 6),
      srdSource('Spells: Saving Throws', 106),
    ],
  },
  {
    id: 'advantage-disadvantage',
    category: 'checks-saves',
    title: 'Advantage & Disadvantage',
    summary: 'Roll two d20s: use the higher for Advantage or the lower for Disadvantage.',
    details: [
      'Multiple sources of the same type don’t add more dice.',
      'If both Advantage and Disadvantage apply, they cancel, regardless of how many sources grant each.',
    ],
    tags: ['d20 test', 'attack roll', 'ability check', 'save'],
    sources: [srdSource('Playing the Game: Advantage/Disadvantage', 7)],
  },
  {
    id: 'blinded', category: 'conditions', title: 'Blinded',
    summary: 'Can’t see; automatically fails checks requiring sight.',
    details: ['Attack rolls against the creature have Advantage.', 'The creature’s attack rolls have Disadvantage.'],
    sources: [srdSource('Rules Glossary: Blinded [Condition]', 177)],
  },
  {
    id: 'charmed', category: 'conditions', title: 'Charmed',
    summary: 'Can’t attack the charmer or target the charmer with damaging abilities or magical effects.',
    details: ['The charmer has Advantage on ability checks to interact socially with the creature.'],
    sources: [srdSource('Rules Glossary: Charmed [Condition]', 178)],
  },
  {
    id: 'deafened', category: 'conditions', title: 'Deafened',
    summary: 'Can’t hear; automatically fails checks requiring hearing.',
    details: [],
    sources: [srdSource('Rules Glossary: Deafened [Condition]', 181)],
  },
  {
    id: 'exhaustion', category: 'conditions', title: 'Exhaustion',
    summary: 'Each level gives −2 to d20 tests and −5 feet of Speed; level 6 causes death.',
    details: ['Exhaustion is cumulative, unlike other conditions.', 'Finishing a Long Rest removes 1 level; reaching level 0 ends the condition.'],
    tags: ['long rest', 'speed', 'd20 test'],
    sources: [srdSource('Rules Glossary: Exhaustion [Condition]', 181)],
  },
  {
    id: 'frightened', category: 'conditions', title: 'Frightened',
    summary: 'Disadvantage on ability checks and attacks while the source of fear is in line of sight.',
    details: ['The creature can’t willingly move closer to the source of fear.'],
    sources: [srdSource('Rules Glossary: Frightened [Condition]', 182)],
  },
  {
    id: 'grappled', category: 'conditions', title: 'Grappled',
    summary: 'Speed is 0 and can’t increase; attacks against anyone but the grappler have Disadvantage.',
    details: [
      'The grappler can drag or carry the target, but each foot costs 1 extra foot unless the target is Tiny or at least two sizes smaller.',
      'Escape: action to make Strength (Athletics) or Dexterity (Acrobatics) against the escape DC.',
      'Ends if the grappler is Incapacitated, the target leaves the grapple’s range, or the grappler releases it.',
    ],
    tags: ['grapple', 'escape dc', 'athletics', 'acrobatics'],
    sources: [
      srdSource('Rules Glossary: Grappled [Condition]', 182),
      srdSource('Rules Glossary: Grappling', 182),
    ],
  },
  {
    id: 'incapacitated', category: 'conditions', title: 'Incapacitated',
    summary: 'Can’t take an action, Bonus Action, or Reaction; can’t speak; concentration ends.',
    details: ['Initiative is rolled with Disadvantage while Incapacitated.'],
    tags: ['concentration', 'initiative'],
    sources: [srdSource('Rules Glossary: Incapacitated [Condition]', 184)],
  },
  {
    id: 'invisible', category: 'conditions', title: 'Invisible',
    summary: 'Can’t be affected by effects that require sight unless the source can somehow see the creature.',
    details: [
      'Roll Initiative with Advantage.',
      'Attacks against the creature have Disadvantage; its attacks have Advantage.',
      'The attack benefits vanish against a creature that can somehow see it.',
    ],
    tags: ['unseen', 'initiative', 'sight'],
    sources: [srdSource('Rules Glossary: Invisible [Condition]', 184)],
  },
  {
    id: 'paralyzed', category: 'conditions', title: 'Paralyzed',
    summary: 'Incapacitated; Speed 0; automatically fails Strength and Dexterity saves.',
    details: ['Attacks against the creature have Advantage.', 'A hit from an attacker within 5 feet is a Critical Hit.'],
    sources: [srdSource('Rules Glossary: Paralyzed [Condition]', 186)],
  },
  {
    id: 'petrified', category: 'conditions', title: 'Petrified',
    summary: 'Transformed into solid substance; Incapacitated; Speed 0; weight ×10; aging stops.',
    details: [
      'Attacks against the creature have Advantage.',
      'The creature automatically fails Strength and Dexterity saves.',
      'The creature has Resistance to all damage and Immunity to the Poisoned condition.',
    ],
    sources: [srdSource('Rules Glossary: Petrified [Condition]', 186)],
  },
  {
    id: 'poisoned', category: 'conditions', title: 'Poisoned',
    summary: 'Disadvantage on attack rolls and ability checks.',
    details: [],
    sources: [srdSource('Rules Glossary: Poisoned [Condition]', 186)],
  },
  {
    id: 'prone', category: 'conditions', title: 'Prone',
    summary: 'Crawl or spend movement equal to half Speed to stand; can’t stand with Speed 0.',
    details: [
      'The creature’s attacks have Disadvantage.',
      'Attacks from within 5 feet have Advantage; attacks from farther away have Disadvantage.',
    ],
    sources: [srdSource('Rules Glossary: Prone [Condition]', 186)],
  },
  {
    id: 'restrained', category: 'conditions', title: 'Restrained',
    summary: 'Speed 0; attacks against the creature have Advantage; its attacks have Disadvantage.',
    details: ['The creature has Disadvantage on Dexterity saving throws.'],
    sources: [srdSource('Rules Glossary: Restrained [Condition]', 187)],
  },
  {
    id: 'stunned', category: 'conditions', title: 'Stunned',
    summary: 'Incapacitated and automatically fails Strength and Dexterity saves.',
    details: ['Attacks against the creature have Advantage.'],
    sources: [srdSource('Rules Glossary: Stunned [Condition]', 189)],
  },
  {
    id: 'unconscious', category: 'conditions', title: 'Unconscious',
    summary: 'Incapacitated and Prone; drops held items; Speed 0; unaware of surroundings.',
    details: [
      'Attacks against the creature have Advantage.',
      'The creature automatically fails Strength and Dexterity saves.',
      'A hit from an attacker within 5 feet is a Critical Hit.',
      'When Unconscious ends, the creature remains Prone.',
    ],
    sources: [srdSource('Rules Glossary: Unconscious [Condition]', 191)],
  },
  {
    id: 'common-actions', category: 'combat', title: 'Common Actions',
    summary: 'Attack · Dash · Disengage · Dodge · Help · Hide · Influence · Magic · Ready · Search · Study · Utilize.',
    details: [
      'Dash: gain extra movement equal to Speed for the turn.',
      'Disengage: movement doesn’t provoke Opportunity Attacks for the turn.',
      'Dodge: attacks against you have Disadvantage if you can see the attacker, and your Dexterity saves have Advantage until your next turn; ends if Incapacitated or Speed 0.',
      'Help: aid an ability check or attack, or attempt first aid.',
      'Hide: make a Dexterity (Stealth) check.',
      'Ready: name a perceivable trigger, then prepare an action or movement up to your Speed; use a Reaction after the trigger. Readying a spell requires Concentration.',
      'Search uses Wisdom; Study uses Intelligence; Utilize operates an object that requires an action.',
    ],
    tags: ['attack', 'dash', 'disengage', 'dodge', 'help', 'hide', 'influence', 'magic', 'ready', 'search', 'study', 'utilize'],
    sources: [
      srdSource('Playing the Game: Actions', 9),
      srdSource('Playing the Game: Actions', 10),
      srdSource('Rules Glossary: Ready [Action]', 187),
    ],
  },
  {
    id: 'cover', category: 'combat', title: 'Cover',
    summary: 'Half: +2 AC/Dex saves · Three-quarters: +5 AC/Dex saves · Total: can’t be targeted directly.',
    details: ['Use only the most protective degree when multiple sources of cover apply.'],
    tags: ['armor class', 'dexterity save', 'half cover', 'total cover'],
    sources: [srdSource('Playing the Game: Cover', 14)],
  },
  {
    id: 'opportunity-attacks', category: 'combat', title: 'Opportunity Attacks',
    summary: 'Reaction: make one melee weapon attack or Unarmed Strike just before a visible creature leaves your reach.',
    details: [
      'The movement must use the creature’s action, Bonus Action, Reaction, or one of its speeds.',
      'Disengage prevents Opportunity Attacks for the rest of the turn.',
      'Teleportation and movement that doesn’t use action economy or Speed don’t provoke.',
    ],
    tags: ['reaction', 'reach', 'disengage'],
    sources: [srdSource('Playing the Game: Opportunity Attacks', 15)],
  },
  {
    id: 'surprise-initiative', category: 'combat', title: 'Surprise & Initiative',
    summary: 'A creature caught unaware rolls Initiative with Disadvantage; it doesn’t lose its first turn.',
    details: ['Initiative is normally a Dexterity check.', 'Initiative score: 10 + Dexterity modifier; add 5 for Advantage or subtract 5 for Disadvantage.'],
    tags: ['initiative', 'surprised', 'dexterity'],
    sources: [
      srdSource('Playing the Game: The Order of Combat', 13),
      srdSource('Rules Glossary: Initiative', 184),
    ],
  },
  {
    id: 'unarmed-strike', category: 'combat', title: 'Unarmed Strike Options',
    summary: 'When you make an Unarmed Strike, choose Damage, Grapple, or Shove; only Damage uses an attack roll.',
    details: [
      'Damage: 1 + Strength modifier Bludgeoning damage.',
      'Grapple: target makes Strength or Dexterity save (its choice) against DC 8 + Strength modifier + PB; target must be no more than one size larger.',
      'Shove: same save and size limit; push 5 feet away or give the target Prone.',
    ],
    tags: ['grapple', 'shove', 'escape dc'],
    sources: [srdSource('Rules Glossary: Unarmed Strike', 190)],
  },
  {
    id: 'concentration', category: 'damage-recovery', title: 'Concentration',
    summary: 'Damage triggers a Constitution save: DC 10 or half damage (round down), whichever is higher; maximum DC 30.',
    details: [
      'Make a separate save for each source of damage.',
      'Starting another Concentration effect ends the current one.',
      'Concentration ends when Incapacitated or dead; it can also be ended at any time without an action.',
    ],
    tags: ['constitution save', 'spell', 'damage'],
    sources: [srdSource('Rules Glossary: Concentration', 179)],
  },
  {
    id: 'death-saves', category: 'damage-recovery', title: 'Death Saving Throws',
    summary: 'At 0 HP, roll at the start of each turn: 10+ succeeds; three successes stabilize; three failures kill.',
    details: [
      'Natural 1: two failures. Natural 20: regain 1 HP.',
      'Damage at 0 HP: one failure; a Critical Hit causes two. Damage at least equal to HP maximum causes death.',
      'Successes and failures reset when the creature regains HP or becomes Stable.',
      'First aid: Help action and DC 10 Wisdom (Medicine) to stabilize.',
      'A Stable creature at 0 HP regains 1 HP after 1d4 hours if it isn’t healed first.',
    ],
    tags: ['death save', 'stable', 'medicine', 'zero hp', '0 hp'],
    sources: [
      srdSource('Playing the Game: Dropping to 0 Hit Points', 17),
      srdSource('Playing the Game: Dropping to 0 Hit Points', 18),
    ],
  },
  {
    id: 'damage-resistance-vulnerability', category: 'damage-recovery', title: 'Resistance, Vulnerability & Immunity',
    summary: 'Resistance halves damage; Vulnerability doubles it; Immunity prevents it.',
    details: ['Round down after halving.', 'Apply Resistance or Vulnerability only once to one instance of damage.', 'Apply other damage adjustments first, Resistance second, and Vulnerability third.'],
    tags: ['damage', 'resistance', 'vulnerability', 'immunity'],
    sources: [srdSource('Playing the Game: Resistance and Vulnerability', 17)],
  },
  {
    id: 'temporary-hit-points', category: 'damage-recovery', title: 'Temporary Hit Points',
    summary: 'Lose Temp HP before normal HP; they don’t stack, heal, or wake a creature at 0 HP.',
    details: ['When receiving new Temp HP, keep either the old amount or the new amount.', 'Temp HP lasts until depleted or the creature finishes a Long Rest.'],
    tags: ['temp hp', 'healing', 'long rest'],
    sources: [srdSource('Playing the Game: Temporary Hit Points', 18)],
  },
  {
    id: 'rests', category: 'damage-recovery', title: 'Short & Long Rests',
    summary: 'Short Rest: 1 hour. Long Rest: at least 8 hours, including at least 6 hours of sleep.',
    details: [
      'Short Rest: spend one or more Hit Point Dice to regain HP; add Constitution modifier to each die (minimum 1 HP regained).',
      'Long Rest: regain all HP and spent Hit Point Dice, restore reduced ability scores, and remove 1 Exhaustion level.',
      'A creature needs at least 1 HP to start a Long Rest and must wait 16 hours after finishing one before starting another.',
    ],
    tags: ['hit dice', 'healing', 'exhaustion'],
    sources: [
      srdSource('Rules Glossary: Long Rest', 185),
      srdSource('Rules Glossary: Short Rest', 187),
    ],
  },
  {
    id: 'difficult-terrain', category: 'movement-visibility', title: 'Difficult Terrain & Creatures',
    summary: 'Each foot moved through Difficult Terrain costs 1 extra foot.',
    details: ['A creature’s space is Difficult Terrain unless the creature is Tiny or your ally.', 'Multiple sources of Difficult Terrain don’t add together.'],
    tags: ['movement', 'speed'],
    sources: [srdSource('Rules Glossary: Difficult Terrain', 181)],
  },
  {
    id: 'climb-swim-crawl', category: 'movement-visibility', title: 'Climbing, Swimming & Crawling',
    summary: 'Each foot costs 1 extra foot unless using the matching Climb or Swim Speed; crawling uses the same extra cost.',
    details: ['In Difficult Terrain, each foot costs 2 extra feet instead.', 'The DM may call for a DC 15 Strength (Athletics) check when climbing a difficult surface or swimming through rough water.'],
    tags: ['movement', 'athletics'],
    sources: [
      srdSource('Rules Glossary: Climbing', 178),
      srdSource('Rules Glossary: Crawling', 179),
      srdSource('Rules Glossary: Swimming', 189),
    ],
  },
  {
    id: 'jumping-falling', category: 'movement-visibility', title: 'Jumping & Falling',
    summary: 'Running long jump: up to Strength score in feet; standing long jump: half. Falling: 1d6 per 10 feet, max 20d6.',
    details: [
      'A jump needs 10 feet of movement immediately beforehand to use the full distance; jumping still spends movement.',
      'After taking falling damage, a creature lands Prone.',
      'Falling into water: Reaction and DC 15 Strength (Athletics) or Dexterity (Acrobatics) can halve the falling damage.',
    ],
    tags: ['movement', 'prone', 'fall damage'],
    sources: [
      srdSource('Rules Glossary: Falling', 182),
      srdSource('Rules Glossary: Long Jump', 185),
    ],
  },
  {
    id: 'light-obscurement', category: 'movement-visibility', title: 'Light & Obscurement',
    summary: 'Lightly Obscured: Disadvantage on sight-based Perception. Heavily Obscured: effectively Blinded when trying to see through it.',
    details: ['Dim Light is Lightly Obscured.', 'Darkness is Heavily Obscured for creatures without a sense that overcomes it.'],
    tags: ['vision', 'perception', 'darkness', 'dim light', 'blinded'],
    sources: [srdSource('Playing the Game: Vision and Light', 11)],
  },
  {
    id: 'hiding', category: 'movement-visibility', title: 'Hiding',
    summary: 'Take the Hide action and make a DC 15 Dexterity (Stealth) check while Heavily Obscured or behind Three-Quarters or Total Cover.',
    details: [
      'You must be out of an enemy’s line of sight and unable to be clearly seen.',
      'On success, note the check total and gain Invisible while hidden.',
      'The condition ends when you make a sound louder than a whisper, an enemy finds you, you make an attack roll, or you cast a spell with a Verbal component.',
    ],
    tags: ['stealth', 'invisible', 'cover', 'line of sight'],
    sources: [srdSource('Rules Glossary: Hide [Action]', 183)],
  },
] as const;

export function filterRulesReference(
  query: string,
  category: RulesReferenceCategoryId | 'all' = 'all',
): RulesReferenceEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  return RULES_REFERENCE_ENTRIES.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (!normalized) return true;
    return [entry.title, entry.summary, ...entry.details, ...(entry.tags ?? [])]
      .some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

export function rulesReferenceToMarkdown(): string {
  return RULES_REFERENCE_CATEGORIES.flatMap((category) => {
    const entries = RULES_REFERENCE_ENTRIES.filter((entry) => entry.category === category.id);
    return [
      `## ${category.label}`,
      '',
      ...entries.flatMap((entry) => [
        `### ${entry.title}`,
        '',
        entry.summary,
        ...entry.details.map((detail) => `- ${detail}`),
        '',
        `_Source${entry.sources.length === 1 ? '' : 's'}: ${entry.sources
          .map((source) => `[${source.document} p. ${source.page}](${SRD_5_2_1_URL}) — ${source.section}`)
          .join(' · ')}_`,
        '',
      ]),
    ];
  }).join('\n').trimEnd();
}
