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
export interface GauntletHazard {
  name: string;
  /** DM-side mechanical description — carries the per-round cadence. */
  hazard: string;
  /** The hazard as characters experience it — player surfaces only. */
  felt: string;
  escape: string;
  /** Perceivable detail gesturing at the escape — player surfaces only. */
  omen: string;
  skills: string[];
}

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
  { name: 'The Flooding Chamber', hazard: 'water rises one foot per round', felt: 'the flood climbs the walls faster than a held breath', escape: 'find and wrench open the drain gate', omen: 'beneath the churn, water gurgles somewhere low — something down there is swallowing it', skills: ['Athletics', 'Investigation'] },
  { name: 'The Shrinking Walls', hazard: 'the walls grind inward a pace every round, the ceiling following close behind', felt: 'both walls creep inward with a low stone growl, the ceiling stooping to follow', escape: 'jam the grinding gears with anything rigid enough to hold', omen: 'the grinding is not smooth — somewhere in the wall, gears catch and complain', skills: ['Athletics', 'Perception', 'Investigation'] },
  { name: 'The Gas Vault', hazard: 'a hissing vent fills the room with sickly green vapor, thicker with every round', felt: 'a sickly green haze crowds the air, searing eyes and throat', escape: 'seal the vent and force the door before the air turns fatal', omen: 'the vapor pours thickest from a single hissing vent near the floor', skills: ['Constitution', 'Investigation'] },
  { name: 'The Freezing Vault', hazard: 'the air bites colder every round as frost creeps up the walls and seals the seams', felt: 'frost crawls up the walls and each breath burns worse than the last', escape: 'light the brazier chain before the frost welds the exit shut', omen: 'along one wall, a chain of cold braziers stands waiting, wicks still tarred', skills: ['Constitution', 'Survival', 'Sleight of Hand'] },
  { name: 'The Gravity Well', hazard: 'the pull shifts a quarter-turn each round, dragging loose gear and footing with it', felt: 'the world tips further and further sideways, dragging loose gear and boots with it', escape: 'reach the anchor stone and brace it before the room fully inverts', omen: 'one block of the floor never shifts — a single stone the pull cannot touch', skills: ['Acrobatics', 'Athletics'] },
  { name: 'The Sand Cascade', hazard: 'sand pours from cracks in the ceiling, burying the floor a little deeper each round', felt: 'the ceiling sifts itself onto your boots, dry and endless, swallowing the floor by inches', escape: 'clear the sluice grate before the chamber fills to the rafters', omen: 'beneath the pouring sand, something metal rattles — a grate, half-buried', skills: ['Athletics', 'Investigation'] },
  { name: 'The Pendulum Hall', hazard: 'a bank of scythed pendulums swings lower and faster with every round', felt: 'scythes sweep the air in quickening arcs, each pass lower than the last', escape: 'time a dash to the far lever and haul it before being caught mid-swing', omen: 'past the swinging blades, at the far end, a lever juts from the wall', skills: ['Acrobatics', 'Perception'] },
  { name: 'The Swarm Nest', hazard: 'a broken seal releases stinging swarms that thicken with every passing round', felt: 'stinging clouds thicken the air, crawling into collar and cuff', escape: 'choke the nest opening and bar the inner door', omen: 'the swarms boil out of one cracked seam above the inner door', skills: ['Athletics', 'Survival', 'Sleight of Hand'] },
  { name: 'The Collapsing Floor', hazard: 'flagstones crack and drop away, the safe footing shrinking round by round', felt: 'the floor sheds itself into the dark below, safe footing shrinking by the heartbeat', escape: 'reach the support pillar and jam it before the floor gives out entirely', omen: 'the flagstones nearest the central pillar have not cracked — not one', skills: ['Acrobatics', 'Athletics'] },
  { name: 'The Rising Current', hazard: 'a live current runs through the rising water, growing stronger and colder each round', felt: 'the rising water carries a lightning sting that grows crueler as it climbs', escape: 'rope off to the anchor ring and crank the sluice shut', omen: 'an iron ring is set into the wall above the waterline, rope-worn smooth', skills: ['Athletics', 'Investigation'] },
  { name: 'The Furnace Room', hazard: 'the walls glow hotter each round as unseen bellows stoke a hidden furnace beneath the floor', felt: 'the walls glow ember-red and the air shimmers, hotter by the minute', escape: 'douse the furnace core before the room turns to a kiln', omen: 'heat breathes up through a grate in the floor, in rhythm, like a bellows', skills: ['Constitution', 'Investigation'] },
  { name: 'The Spike Floor', hazard: 'iron spikes punch up through more of the floor with every round, the safe path narrowing', felt: 'iron points punch up through the flagstones, more of them with every breath', escape: 'reach the control plinth and reverse the mechanism', omen: 'on a raised plinth across the hall, something clicks in time with the spikes', skills: ['Acrobatics', 'Perception'] },
];

// ─── PR 2: Challenge Framework Pools ─────────────────────────────────
// Content library for the six challenge frameworks in
// src/lib/challenge-frameworks/. Skill objectives and trap frames feed
// the skill-challenge and trap frameworks directly; obstacles and
// weather feed exploration; quarries and waypoints feed chase;
// investigation frames feed investigation. Same authoring rule as
// above: no dice expressions or DC numbers, vivid table-ready prose,
// D&D fantasy register, no anachronisms.

export interface SkillObjective {
  name: string; setup: string;
  phaseTitles: [string, string, string];
  primarySkills: string[]; secondarySkills: string[];
}
export interface Obstacle { name: string; desc: string; skills: string[]; creative: string }
export interface TrapFrame {
  name: string; trigger: string; effect: string; escalation: string;
  countermeasures: { skill: string; action: string }[];
  clues: string[]; reset: string; twist: string;
}
export interface Quarry { archetype: string; speedNote: string; trick: string; desperation: string }
export interface Waypoint { text: string; skill: string }
export interface InvestigationFrame { crime: string; methods: string[]; motives: string[] }

// ─── Skill Objectives ────────────────────────────────────────────────
export const SKILL_OBJECTIVES: SkillObjective[] = [
  {
    name: 'Escape the Burning Granary',
    setup: 'Smoke fills the rafters and the only stair is already alight; the harvest — and the workers — are still inside.',
    phaseTitles: ['Raise the alarm', 'Clear a path', 'The last dash'],
    primarySkills: ['Athletics', 'Perception', 'Investigation', 'Persuasion'],
    secondarySkills: ['Arcana', 'Survival', 'Sleight of Hand'],
  },
  {
    name: 'Break the Fever Ward',
    setup: 'The infirmary is one bad hour from a riot; three wards worth of frightened patients, a locked apothecary, and a healer who has not slept in two days need managing before dawn.',
    phaseTitles: ['Calm the wards', 'Break the apothecary seal', 'Hold the line until the healer wakes'],
    primarySkills: ['Medicine', 'Persuasion', 'Athletics', 'Investigation'],
    secondarySkills: ['Insight', 'Sleight of Hand', 'Intimidation'],
  },
  {
    name: 'Steal the Bell Before the Ninth Toll',
    setup: 'The tower bell has rung eight times since dusk — one more toll and whatever the cult bound to its peal wakes for good; the stair is watched, the ropes are frayed, and the guild that keeps the bell has no idea what they have been ringing for.',
    phaseTitles: ['Reach the belfry unseen', 'Silence the mechanism', 'Talk the guild down from finishing the ritual'],
    primarySkills: ['Stealth', 'Athletics', 'Arcana', 'Persuasion'],
    secondarySkills: ['Perception', 'Religion', 'Acrobatics'],
  },
  {
    name: 'Outrun the Landslide',
    setup: 'A groaning slope above the terraced village has started to shift, and the only warning bell is a mile upriver — someone has to reach it, someone has to move the bedridden, and someone has to hold the packed footbridge steady long enough for both.',
    phaseTitles: ['Sound the warning', 'Move what cannot move itself', 'Hold the bridge'],
    primarySkills: ['Athletics', 'Survival', 'Persuasion', 'Investigation'],
    secondarySkills: ['Animal Handling', 'Acrobatics', 'Insight'],
  },
  {
    name: 'Talk the Jury Back From the Noose',
    setup: 'The magistrate has already called for the rope; the accused is innocent, the true witness is terrified into silence, and the only window left is the time it takes the court to file back in after recess.',
    phaseTitles: ['Unsettle the false witness', 'Surface the hidden proof', 'Win the room before the verdict'],
    primarySkills: ['Insight', 'Investigation', 'Persuasion', 'Sleight of Hand'],
    secondarySkills: ['Deception', 'Intimidation', 'History'],
  },
  {
    name: 'Clear the Stampede Before the Square Floods With Bodies',
    setup: 'Something has spooked the whole string of draft teams waiting outside the granary, and the market square ahead is shoulder to shoulder with festival crowds who have no idea what is about to come around the corner.',
    phaseTitles: ['Turn the herd', 'Clear the square', 'Block the alley before they double back'],
    primarySkills: ['Animal Handling', 'Athletics', 'Persuasion', 'Acrobatics'],
    secondarySkills: ['Perception', 'Intimidation', 'Survival'],
  },
  {
    name: 'Sink or Swim the Longboat',
    setup: 'A reef has opened a long gash below the waterline, the crew is one bad wave from open panic, and the rocks ahead will finish what the storm started unless someone reads the current in time.',
    phaseTitles: ['Patch the hull', 'Steady the crew', 'Steer the reef'],
    primarySkills: ['Athletics', 'Persuasion', 'Survival', 'Investigation'],
    secondarySkills: ['Acrobatics', 'Perception', 'Sleight of Hand'],
  },
  {
    name: 'Break the Siege Gate From Within',
    setup: 'The postern gate of the keep is barred from the inside by a mechanism no one alive remembers building, the garrison patrols the wall walk every few minutes, and the relief column outside will not wait past first light.',
    phaseTitles: ['Slip past the wall watch', 'Break the old barring mechanism', 'Hold the gate open long enough'],
    primarySkills: ['Stealth', 'Investigation', 'Athletics', 'Perception'],
    secondarySkills: ["Thieves' Tools", 'History', 'Intimidation'],
  },
  {
    name: 'Dig Free of the Collapsed Tunnel',
    setup: 'The tunnel roof came down two turns back, sealing the only way out behind a wall of rubble, the air is already going stale, and something in the dark keeps knocking back when the party knocks first.',
    phaseTitles: ['Find the air', 'Shore the ceiling', 'Dig for daylight'],
    primarySkills: ['Survival', 'Athletics', 'Investigation', 'Persuasion'],
    secondarySkills: ['Perception', 'Constitution', 'Insight'],
  },
  {
    name: 'Break the Prisoner Out Before the Transfer',
    setup: 'The wagon that will carry the prisoner to the capital leaves at dawn, the night warden is one coin short of looking the other way, and the only blind corner in the cell block is watched by a guard who has never once left his post early.',
    phaseTitles: ['Buy the silence of the warden', 'Forge the transfer papers', 'Walk out the front gate'],
    primarySkills: ['Deception', 'Sleight of Hand', 'Investigation', 'Athletics'],
    secondarySkills: ['Persuasion', 'Stealth', 'Intimidation'],
  },
  {
    name: 'Hold the Masquerade Together',
    setup: 'Somewhere among a hundred masked guests, someone plans to kill the host before the final dance, and unmasking the wrong person in front of this crowd would end any welcome the party has left in this city.',
    phaseTitles: ['Read the room behind the masks', 'Corner a suspect without a scene', 'Stop the strike in plain sight'],
    primarySkills: ['Insight', 'Performance', 'Investigation', 'Acrobatics'],
    secondarySkills: ['Deception', 'Perception', 'Sleight of Hand'],
  },
  {
    name: 'Escape the Ambushed Caravan',
    setup: 'Arrows are already falling on the lead wagon, half the drovers have scattered, and the only way out is a service track through the woods that no one has driven after dark in years.',
    phaseTitles: ['Cut the panicked teams free', 'Find the service track', 'Outrun what is chasing you'],
    primarySkills: ['Animal Handling', 'Athletics', 'Stealth', 'Persuasion'],
    secondarySkills: ['Survival', 'Perception', 'Investigation'],
  },
  {
    name: 'Contain the Ritual Before It Completes',
    setup: 'The cultists have already begun the third and final verse at the altar of the shrine, the wards meant to contain whatever answers are cracking at the edges, and stopping the chant outright risks releasing the very thing the ritual was meant to bind.',
    phaseTitles: ['Break the summoning circle', 'Silence the chant', 'Rebind the ward before it fails'],
    primarySkills: ['Arcana', 'Athletics', 'Intimidation', 'Perception'],
    secondarySkills: ['Religion', 'Stealth', 'Investigation'],
  },
  {
    name: 'Talk the Mob Down From the Gallows',
    setup: 'A crowd three streets deep has already dragged a suspect to the market gallows, the town watch is nowhere in sight, and the only rope long enough to stall them is the truth — if it can be found before the crate gets kicked out.',
    phaseTitles: ['Hold the crowd back', 'Find the truth fast', 'Turn the fury of the mob elsewhere'],
    primarySkills: ['Intimidation', 'Athletics', 'Investigation', 'Insight'],
    secondarySkills: ['Persuasion', 'Perception', 'History'],
  },
];

// ─── Obstacles ────────────────────────────────────────────────────────
export const OBSTACLES: Obstacle[] = [
  { name: 'The Sagging Rope Bridge', desc: 'a fraying rope bridge spans a gorge, more gap than plank in places', skills: ['Acrobatics', 'Athletics'], creative: 'anchor a line across first and let the lightest climber test the crossing' },
  { name: 'The Quicksand Bog', desc: 'a stretch of bog swallows anything that stands still too long', skills: ['Athletics', 'Survival', 'Investigation'], creative: 'lay a corduroy of cut branches to spread the weight across the surface' },
  { name: 'The Bramble Maze', desc: 'a wall of thorned bramble has grown wild across the only trail', skills: ['Survival', 'Athletics'], creative: 'burn a narrow path through with a controlled, well-tended fire' },
  { name: 'The Flooded Cellar Stair', desc: 'dark water has swallowed the stair down into the old cellar, its depth impossible to judge from the top', skills: ['Athletics', 'Perception', 'Investigation'], creative: 'sound the depth of the water with a weighted rope before anyone commits to the dive' },
  { name: 'The Ice-Slicked Ridge', desc: 'a knife-edge ridge coated in black ice offers no honest footing', skills: ['Acrobatics', 'Athletics'], creative: 'rope the party together so a single slip does not become a fall' },
  { name: 'The Sinkhole Field', desc: 'the ground here gives way without warning, swallowing careless footsteps whole', skills: ['Perception', 'Investigation', 'Survival'], creative: 'probe ahead with a long pole before every step across the field' },
  { name: 'The Whirlpool Ford', desc: 'a river crossing here churns into a slow, deceptive whirlpool at its center', skills: ['Athletics', 'Survival'], creative: 'time the crossing to the lull in the current, which returns every so often' },
  { name: 'The Sheer Cliff Face', desc: 'a stretch of trail has crumbled away entirely, leaving only a bare rock face to climb', skills: ['Athletics', 'Acrobatics'], creative: 'find the old pilgrim handholds cut into the stone generations ago' },
  { name: 'The Storm-Lashed Headland', desc: 'wind off the cliffs here is strong enough to lift an unwary traveler clean off their feet', skills: ['Athletics', 'Perception'], creative: 'time the crossing between gusts by watching the grass for the pattern' },
  { name: 'The Buried Barrow Door', desc: 'a stone door sealing the old barrow has settled and jammed, half swallowed by roots and earth', skills: ['Athletics', 'Investigation'], creative: 'dig out the hinge side rather than force the door itself' },
  { name: 'The Tar Seep', desc: 'a black seep of ancient tar has spread across the low ground, thick enough to trap a boot for good', skills: ['Athletics', 'Survival', 'Investigation'], creative: 'lay a plank bridge across the firmest crust of the seep' },
  { name: 'The Avalanche Chute', desc: 'a steep, snow-loaded slope threatens to slide at the wrong footstep or the wrong sound', skills: ['Survival', 'Athletics', 'Perception'], creative: 'cross one at a time along the ridge line where the snow sits thinnest' },
  { name: 'The Collapsed Aqueduct', desc: 'an old stone aqueduct spans a ravine, its central span long since fallen away', skills: ['Acrobatics', 'Athletics'], creative: 'rig a rope swing from the standing pillar to the far ledge' },
  { name: 'The Fogbound Marsh', desc: 'a thick, unnatural fog swallows the trail markers and every sense of direction', skills: ['Survival', 'Perception'], creative: 'follow the flow of the marsh water rather than trust the eye' },
  { name: 'The Sun-Cracked Salt Flat', desc: 'a vast salt flat shimmers with heat, and the trail across it vanishes in every direction', skills: ['Survival', 'Investigation'], creative: 'navigate by the old cairns half-buried at the edge of the flat' },
  { name: 'The Rope-Ladder Descent', desc: 'the only way down into the ravine is a rope ladder lashed to a stake that has clearly seen better years', skills: ['Athletics', 'Acrobatics', 'Investigation'], creative: 'test and re-stake the anchor before committing full weight to it' },
  { name: 'The Windfall Deadfall', desc: 'a tangle of storm-felled trees blocks the trail, unstable and groaning underfoot', skills: ['Athletics', 'Perception'], creative: 'find the load-bearing trunk and clear a path around it rather than over it' },
];

// ─── Weather ────────────────────────────────────────────────────────
export const WEATHER: string[] = [
  'a sideways sleet that erases tracks within minutes',
  'a bone-dry wind that cracks lips and rattles loose shutters for miles',
  'a low, rolling fog that swallows sound as readily as sight',
  'an early frost that glazes every stone and root in treacherous silver',
  'a warm rain that turns the trail to ankle-deep clinging mud',
  'a sky bruised the color of a healing wound, thunder rolling somewhere just out of sight',
  'a still, oppressive heat that makes even the insects too tired to fly',
  'a hard-driving hail that hammers exposed skin and spooks every mount in earshot',
  'a bitter crosswind that shifts direction without warning, scattering scent and sound alike',
  'a heavy, wet snow that piles fast enough to bury a trail before midday',
];

// ─── Trap Frames ──────────────────────────────────────────────────────
export const TRAP_FRAMES: TrapFrame[] = [
  {
    name: 'The Tithing Scale',
    trigger: 'lifting the offering bowl without leaving equal weight',
    effect: 'the dais tilts and a ring of blades sweeps the platform',
    escalation: 'each round the ring tightens, shrinking the safe center',
    countermeasures: [
      { skill: 'Sleight of Hand', action: 'feed coins onto the pan as the bowl lifts, keeping the balance true' },
      { skill: 'Athletics', action: 'jam the dais gears with a pry bar and hold them' },
      { skill: 'Arcana', action: 'still the counterweight enchantment at its rune cluster' },
    ],
    clues: ['the platform edge is scarred in a perfect circle', 'old coins lie fused to the pan in a thin wax of dried blood'],
    reset: 'the ring retracts and the scale rebalances one minute after weight is restored',
    twist: 'the counterweight vault below holds the previous offerings — and a way down',
  },
  {
    name: "The Widow's Loom",
    trigger: 'lifting a thread from the loom without first finding the working shuttle',
    effect: 'the frame flexes shut, and the threads lash out to bind whoever pulled free',
    escalation: 'each round the threads cinch tighter, forcing the air from bound lungs',
    countermeasures: [
      { skill: 'Sleight of Hand', action: 'work the true shuttle free and let it run the pattern out on its own' },
      { skill: 'Athletics', action: 'brace the frame open and tear the warp threads by main force' },
      { skill: 'Investigation', action: 'trace the pattern to its origin knot and unpick it there' },
    ],
    clues: ['one thread on the loom is a different color from all the rest', 'the floor beneath the loom is worn in a perfect oval, not a footpath'],
    reset: 'the loom rewinds itself to its resting pattern within a minute of the threads releasing',
    twist: 'the pattern, followed to its end, is a map of the other hidden doors in the house',
  },
  {
    name: 'The Confessional Screen',
    trigger: 'speaking a lie within the confessional booth',
    effect: 'the iron lattice of the screen snaps forward, pinning the speaker at the throat',
    escalation: 'each round the lattice tightens further, and the booth fills with choking incense smoke',
    countermeasures: [
      { skill: 'Insight', action: 'read the tell in the mechanism and speak only sentences it cannot parse as false' },
      { skill: 'Athletics', action: 'brace the lattice apart with raw strength before it locks fully closed' },
      { skill: "Thieves' Tools", action: 'pick the release catch hidden beneath the kneeler before the lattice seats' },
    ],
    clues: ['the kneeler cushion is worn through in an unusual spot, as if something beneath it sees frequent use', 'the other three confessional booths nearby are dusty with disuse'],
    reset: 'the lattice retracts and resets a minute after the booth empties',
    twist: 'the priest keeping this confessional already knows every secret it has ever caught, and sells them',
  },
  {
    name: 'The Granary Auger',
    trigger: 'drawing grain from the lower bins without first releasing the counter-latch',
    effect: 'a hidden auger blade engages within the grain, churning anyone pulled under',
    escalation: 'each round more grain shifts loose above, burying deeper and slowing every motion',
    countermeasures: [
      { skill: 'Athletics', action: 'fight upward through the shifting grain toward the surface' },
      { skill: 'Investigation', action: 'locate and throw the counter-latch buried in the bin wall' },
      { skill: 'Animal Handling', action: 'calm and redirect the yoked oxen still hitched to the auger crank outside' },
    ],
    clues: ['the grain in this bin is packed unnaturally smooth, as if turned recently', 'a service latch, half-hidden, is bolted into the bin wall at knee height'],
    reset: 'the auger disengages and the grain resettles within a few minutes of the latch throwing',
    twist: 'the bin floor conceals a second, older grain store that was sealed off generations ago for good reason',
  },
  {
    name: 'The Reliquary Cage',
    trigger: 'removing the relic from its cage without matching the correct hymn',
    effect: 'the cage bars snap shut around the reliquary and anyone still reaching inside',
    escalation: 'each round the bars glow hotter, scorching whatever remains within reach',
    countermeasures: [
      { skill: 'Religion', action: 'hum the correct hymn from memory to still the cage wards' },
      { skill: 'Sleight of Hand', action: 'slip a counterweight into the cradle before the missing weight of the relic is noticed' },
      { skill: 'Arcana', action: 'unravel the warding glyph etched along the base of the cage' },
    ],
    clues: ['a faded hymn sheet is tucked just out of sight behind the altar', 'the cage bars bear scorch marks in a pattern that repeats exactly'],
    reset: 'the cage bars cool and reopen a minute after the correct hymn is sung',
    twist: 'the relic inside is a clever forgery — the true one was moved months ago',
  },
  {
    name: 'The Millrace Sluice',
    trigger: 'forcing the sluice gate open out of sequence',
    effect: 'the millrace surges through, dragging anyone at the gate into the wheel below',
    escalation: 'each round the current strengthens as more of the race floods open',
    countermeasures: [
      { skill: 'Athletics', action: 'wrestle the gate back into its housing against the full force of the current' },
      { skill: 'Investigation', action: 'find and throw the proper sequence of the three hidden pins first' },
      { skill: 'Acrobatics', action: 'ride the surge to the safety grate before the wheel intake' },
    ],
    clues: ['three worn pins, out of easy reach, sit along the gate housing', 'a ledger kept by the miller notes a strict opening order for the sluice, never explained'],
    reset: 'the sluice reseals and the race drains within a couple of minutes once the pins are reset',
    twist: 'the millrace hides a second channel leading somewhere the miller never mentioned',
  },
  {
    name: 'The Sarcophagus Latch',
    trigger: 'lifting the sarcophagus lid without disarming the seal beneath the carved hands',
    effect: 'twin stone arms swing shut across the opening, crushing inward',
    escalation: 'each round the arms grind closer together, narrowing the gap to escape',
    countermeasures: [
      { skill: 'Athletics', action: 'brace the stone arms apart long enough for everyone to clear the sarcophagus' },
      { skill: 'Arcana', action: 'still the binding rune hidden beneath the carved hands' },
      { skill: 'History', action: 'recall the old burial rite and speak the release words in the correct order' },
    ],
    clues: ['the carved hands on the lid are worn smooth exactly where a rune would sit', 'an old burial inscription nearby hints at the correct order of the release words'],
    reset: 'the arms retract and the seal resets an hour after closing, giving no second chance tonight',
    twist: 'the sarcophagus is empty — whatever it once held left through a passage below',
  },
  {
    name: 'The Counting House Floor',
    trigger: 'stepping onto the counting floor without first weighing in at the scale by the door',
    effect: 'the floor tiles drop away in sequence, dumping the unweighed into the strongroom below',
    escalation: 'each round the strongroom below floods with the coin overflow from the chute above, threatening to bury and suffocate',
    countermeasures: [
      { skill: 'Acrobatics', action: 'leap tile to tile along the pattern that never drops' },
      { skill: 'Investigation', action: 'find and jam the release lever hidden beneath the desk of the head clerk' },
      { skill: 'Athletics', action: 'hold the last stable tile in place while others climb free' },
    ],
    clues: ['the safe tiles show faint wear in a repeating pattern', 'a lever disguised as a foot rest is bolted beneath the desk of the head clerk'],
    reset: 'the tiles reseat and the chute seals itself an hour after the last coin settles',
    twist: 'the strongroom below holds far less coin than the ledgers of the counting house claim',
  },
  {
    name: "The Herbalist's Cabinet",
    trigger: 'opening any drawer out of the correct planting-season order',
    effect: 'a fine spore cloud bursts from the drawer, choking the lungs of whoever opened it',
    escalation: 'each round the spores spread further through the room, thickening the air',
    countermeasures: [
      { skill: 'Nature', action: 'identify the correct planting-season order and open the remaining drawers safely' },
      { skill: 'Constitution', action: 'hold breath and steady hands long enough to seal the drawer shut again' },
      { skill: 'Medicine', action: 'brew a quick counter-draught from herbs already on the shelf' },
    ],
    clues: ['the drawer labels are worn according to a seasonal calendar, not alphabetical order', 'a faint dusting of old spores clings to the edges of the cabinet'],
    reset: 'the spore cloud settles and the cabinet reseals itself within a few minutes',
    twist: 'the bottom drawer, correctly opened, holds a cure for something the party has not yet caught',
  },
  {
    name: 'The Drawbridge Counterweight',
    trigger: 'crossing the drawbridge before the counterweight chain is locked',
    effect: 'the counterweight releases, and the bridge folds upward beneath moving feet',
    escalation: 'each round the chain grinds the bridge further upright, and loose footing slides toward the edge',
    countermeasures: [
      { skill: 'Athletics', action: 'grab the counterweight chain and hold the bridge level by main force' },
      { skill: 'Investigation', action: 'find and set the locking pin at the winch housing' },
      { skill: 'Acrobatics', action: 'scramble up the tilting boards to the safety of the gatehouse ledge' },
    ],
    clues: ['the winch housing shows fresh grease where an old pin should sit', 'chain links along the counterweight are worn thin in one telling spot'],
    reset: 'the bridge lowers and the chain reseats itself an hour after the pin is set',
    twist: 'the gatehouse ledge above holds a store of supplies left by whoever last maintained this crossing',
  },
  {
    name: 'The Orrery Vault',
    trigger: 'turning any orrery arm out of its correct celestial order',
    effect: 'the vault ceiling begins a slow, grinding rotation, and the floor tilts with it',
    escalation: 'each round the tilt steepens, sliding loose footing and gear toward the widening gap at the wall',
    countermeasures: [
      { skill: 'Arcana', action: 'read the correct celestial order from the star markings on the orrery itself' },
      { skill: 'Acrobatics', action: 'keep footing on the tilting floor long enough to reach the control arm' },
      { skill: 'Investigation', action: 'trace the gear train to the override lever and throw it' },
    ],
    clues: ['the arms of the orrery are etched with faint numerals in an old astronomical script', 'scuff marks on the floor trace the same widening arc every time'],
    reset: 'the floor levels and the ceiling stills a minute after the arms are set correctly',
    twist: 'the correct alignment, once found, also opens a hidden star chart of a place none of the party recognizes',
  },
  {
    name: "The Beekeeper's Wall",
    trigger: 'disturbing the false stones in the wall without smoking the hive first',
    effect: 'the hidden hive inside the wall bursts open, and a furious swarm pours out',
    escalation: 'each round the swarm grows angrier and spreads further into the room',
    countermeasures: [
      { skill: 'Survival', action: 'smoke the hive with anything smoldering close at hand to calm it' },
      { skill: 'Constitution', action: 'push through the stings to reach and reseal the hive opening' },
      { skill: "Thieves' Tools", action: 'work the false stones back into place without disturbing the hive further' },
    ],
    clues: ['a faint hum comes from behind a suspiciously clean patch of wall', 'old smoke stains mark the floor just below the false stones'],
    reset: 'the swarm calms and returns to the hive within a few minutes of smoking',
    twist: 'the hive has been built around a small cache someone hid there long before the bees arrived',
  },
  {
    name: 'The Puppet Stage',
    trigger: 'stepping onto the stage without first cutting the correct marionette string',
    effect: 'the stage strings snap taut and hoist the intruder aloft like a puppet',
    escalation: 'each round the strings twist tighter, and hidden blades built into the stage begin to swing in time',
    countermeasures: [
      { skill: 'Sleight of Hand', action: 'cut the one correct string among a dozen identical others' },
      { skill: 'Perception', action: 'spot the single string that moves out of rhythm with the rest' },
      { skill: 'Acrobatics', action: 'ride the hoist and swing clear before the blades cycle back' },
    ],
    clues: ['one string among the rack is very slightly frayed, unlike all the others', 'the stage floor is worn only where a puppeteer would once have stood, not where visitors walk'],
    reset: 'the strings slacken and the stage resets automatically once the show would have ended',
    twist: 'the puppeteer who built this stage is still watching from a hidden gallery above',
  },
  {
    name: "The Tanner's Vat",
    trigger: 'reaching into the vat without draining it through the correct valve first',
    effect: 'the contents of the vat surge, pulling the victim under the caustic soak',
    escalation: 'each round submerged burns deeper, and the fumes thicken enough to choke anyone standing too close',
    countermeasures: [
      { skill: 'Athletics', action: 'haul the submerged free of the vat before the soak does lasting harm' },
      { skill: 'Investigation', action: 'find and turn the correct drain valve among several identical ones' },
      { skill: 'Constitution', action: 'hold breath and steady footing long enough to work the valve by feel alone' },
    ],
    clues: ['one drain valve is worn shinier than the others from frequent, careful use', 'the fumes here are stronger than in any other vat in the tannery'],
    reset: 'the vat drains and refills naturally over the course of the following day',
    twist: 'something long dissolved in the vat has left a ring that is, unmistakably, a piece of old jewelry',
  },
  {
    name: "The Astronomer's Floor",
    trigger: 'crossing the star-mapped floor on a night when the wrong constellation is underfoot',
    effect: 'the floor tile beneath the misstep drops away into the lower works of the observatory',
    escalation: 'each round trapped in the lower works, grinding gears close in from every side',
    countermeasures: [
      { skill: 'Arcana', action: 'read the true constellation for tonight and call out the safe path across the floor' },
      { skill: 'Athletics', action: 'brace the grinding gears apart long enough to climb free' },
      { skill: 'Acrobatics', action: 'leap the safe tiles blind, trusting rhythm over sight' },
    ],
    clues: ['a star chart nearby is annotated with the date of tonight in a careful hand', 'scorch marks under the floor grating trace the shape of an old constellation'],
    reset: 'the tile reseats and the gears fall still an hour after the correct constellation passes',
    twist: 'the lower works are not machinery at all, but the bones of something built long before the observatory',
  },
];

// ─── Quarries ─────────────────────────────────────────────────────────
export const QUARRIES: Quarry[] = [
  { archetype: 'a cutpurse who knows every alley shortcut', speedNote: 'quick over short distances but tires fast in the open', trick: 'ducks through market stalls to break line of sight', desperation: 'throws the stolen goods at the feet of the nearest pursuer to slow them down' },
  { archetype: 'a smuggler mounted on a sure-footed mule', speedNote: 'steady and tireless but never fast', trick: 'cuts through a narrow drainage culvert too tight for a horse', desperation: 'cuts the mule loose and continues on foot through the crowd' },
  { archetype: 'a spy fluent in three tongues and twice as many disguises', speedNote: 'no faster than average but excellent at vanishing into a crowd', trick: 'swaps cloaks with a bystander mid-stride', desperation: 'starts shouting accusations at an innocent bystander to buy confusion' },
  { archetype: 'a poacher who knows this stretch of woods better than the party ever will', speedNote: 'fast and sure over rough terrain, clumsy on open road', trick: 'doubles back through a game trail invisible from the main path', desperation: 'sets a snare trap behind them without breaking stride' },
  { archetype: 'a hired blade running for a client who pays for silence', speedNote: 'strong and fast in short bursts, but favors one bad leg over distance', trick: 'kicks over a stall or cart to block the path behind', desperation: 'turns to fight rather than be taken alive' },
  { archetype: 'a courier riding a horse bred for exactly this', speedNote: 'faster than anything the party can match on foot', trick: 'cuts across a field to shave distance off the road', desperation: 'rides the horse to exhaustion, abandoning it the moment it falters' },
  { archetype: 'a street orphan who has outrun the watch a hundred times', speedNote: 'small, quick, and able to fit through gaps no adult could manage', trick: 'squeezes through a gap in a fence or wall too narrow to follow', desperation: 'scatters a satchel of stolen trinkets to draw a crowd of grabbing hands' },
  { archetype: 'a cultist fleeing with a stolen relic clutched to their chest', speedNote: 'unremarkable pace, but reckless and willing to take dangerous shortcuts', trick: 'leaps a gap or ledge the party will have to find another way around', desperation: 'threatens to destroy the relic rather than surrender it' },
  { archetype: 'a debt-ridden gambler who knows this quarter like the back of a marked deck', speedNote: 'average speed but uncanny timing through crowds', trick: 'times a crossing through a busy intersection to leave the party stranded on the wrong side', desperation: 'offers a bribe mid-chase, shouted over one shoulder, to end the pursuit' },
  { archetype: 'a beastmaster fleeing with a trained hunting bird scouting ahead', speedNote: 'average on the ground, but warned early of any shortcut the party takes', trick: 'sends the hunting bird to harry the lead pursuer', desperation: 'releases a second, more dangerous animal to cover the escape' },
  { archetype: 'a guard captain fleeing the scene of their own corruption', speedNote: 'fast and well-conditioned, but burdened by armor not made for running', trick: 'sheds the armor mid-stride to shed the weight and the identifying colors alike', desperation: 'invokes rank to order any nearby watch to seize the pursuers instead' },
  { archetype: 'a thief dressed in stolen noble finery, bluffing every step', speedNote: 'average speed, but relies entirely on no one questioning the disguise', trick: 'demands passersby clear the way as though pursued by criminals, not the reverse', desperation: 'accuses the pursuers loudly of assaulting a noble, turning the crowd against them' },
];

// ─── Waypoints ────────────────────────────────────────────────────────
export const WAYPOINTS: Waypoint[] = [
  { text: 'a market stall collapses squarely across the path, spilling produce everywhere', skill: 'Acrobatics' },
  { text: 'a low washing line strung between buildings catches at head height', skill: 'Acrobatics' },
  { text: 'a startled flock of geese erupts underfoot, hissing and snapping at ankles', skill: 'Athletics' },
  { text: 'the route narrows to a single plank crossing an open drainage ditch', skill: 'Acrobatics' },
  { text: 'a cart loaded with barrels blocks the alley, its driver in no hurry to move', skill: 'Persuasion' },
  { text: 'loose cobblestones underfoot threaten to turn an ankle at full speed', skill: 'Athletics' },
  { text: 'a dead-end forces a hard choice between backtracking or scaling a wall', skill: 'Athletics' },
  { text: 'a crowd gathered for a street performance blocks the way entirely', skill: 'Athletics' },
  { text: 'a guard patrol turns the corner ahead, oblivious for now but closing fast', skill: 'Stealth' },
  { text: 'the trail crosses a rooftop gap wider than it first appeared', skill: 'Acrobatics' },
  { text: 'a startled dog gives chase, barking loud enough to draw every eye on the street', skill: 'Animal Handling' },
  { text: 'thick smoke from a cookfire rolls across the path, stinging eyes and hiding footing', skill: 'Constitution' },
  { text: 'the ground turns to loose scree on a steep embankment', skill: 'Athletics' },
  { text: 'a rope-and-pulley cargo line swings low across the alley without warning', skill: 'Acrobatics' },
];

// ─── Investigation Frames ──────────────────────────────────────────────
export const INVESTIGATION_FRAMES: InvestigationFrame[] = [
  {
    crime: 'a respected merchant found dead in a locked counting house, no sign of forced entry',
    methods: ['a slow poison worked into the nightly tea', 'a blade thin enough to leave almost no wound, delivered before the door was locked'],
    motives: ['a business partnership about to be exposed as fraudulent', 'a debt so large that death was cheaper than repayment', 'an inheritance that only comes due while the merchant is gone'],
  },
  {
    crime: 'a temple relic vanished from a warded reliquary overnight',
    methods: ['a forged key copied from a wax impression taken weeks earlier', 'a warding rune deliberately mis-etched by whoever installed it'],
    motives: ['a rival temple desperate to humble this one', 'a collector willing to pay any price for the relic in secret', 'a true believer convinced the relic belongs somewhere else entirely'],
  },
  {
    crime: 'a caravan guard turned up dead a day after the caravan he was guarding vanished entirely',
    methods: ['a staged ambush meant to look like bandit work', 'a betrayal arranged from within the ranks of the caravan itself'],
    motives: ['the cargo of the caravan was worth far more than its manifest claimed', 'a rival trading house wanted the route discredited for good'],
  },
  {
    crime: 'a well-loved healer was found poisoned in their own garden',
    methods: ['a slow-acting toxin worked into a favorite tea blend', 'a tainted salve applied under the guise of a routine treatment'],
    motives: ['a patient who wrongly blamed the healer for a loss that could not have been prevented', 'a rival healer eager to inherit the practice and its patients'],
  },
  {
    crime: 'a shipment of grain meant for the winter stores was set alight in its warehouse',
    methods: ['a slow fuse laid among the sacks days in advance', 'lamp oil spread quietly along the rafters before closing'],
    motives: ['a grain speculator hoping to profit from the coming shortage', 'a rival guild punishing the warehouse owner for undercutting prices'],
  },
  {
    crime: 'a ruling by the local magistrate was overturned after the only witness recanted and then disappeared',
    methods: ['a bribe large enough to buy silence and a new life elsewhere', 'a threat against the family of the witness, never spoken aloud but clearly understood'],
    motives: ['the original ruling would have ruined someone with the coin to prevent it', 'the testimony of the witness was false in the first place, and recanting was the truth catching up'],
  },
  {
    crime: 'a prized racing horse was found lamed the night before the biggest race of the season',
    methods: ['a sharpened tack slipped beneath the saddle blanket', 'a drugged feed meant to slow reflexes without leaving a mark'],
    motives: ['a rival owner with everything riding on this one race', 'a gambler who bet heavily against the favorite'],
  },
  {
    crime: 'a betrothal contract belonging to a noble family went missing the night before the signing',
    methods: ['a household servant paid to look away from the study for an hour', 'a duplicate key cut from an impression taken during a prior visit'],
    motives: ['a spurned suitor determined to stop the match at any cost', 'a rival house that stood to lose everything if the alliance held'],
  },
  {
    crime: 'a well in the center of town turned foul overnight, sickening half the district',
    methods: ['a poison poured in during a gap in the rounds of the night watch', 'a dead animal deliberately dropped down the well shaft'],
    motives: ['a rival district trying to force trade and travelers toward its own wells', 'someone settling a score against the town council that oversees the well'],
  },
  {
    crime: 'a traveling performer collapsed mid-show and never woke again',
    methods: ['a poisoned reed on the instrument they always played first', 'tampered wine shared backstage before the performance began'],
    motives: ['a rival performer desperate for the lead role', 'a debt collector who preferred a public reminder over a private one'],
  },
  {
    crime: 'the seal of a trade guild was found forged on a contract that ruined a small business',
    methods: ['a skilled forger paid to copy the seal from an old, discarded document', 'a corrupt guild clerk who used the real seal without authorization'],
    motives: ['a competitor determined to eliminate a small rival by any means', 'a guild official settling a personal grudge under cover of business'],
  },
  {
    crime: 'a shrine flame kept burning for generations was found extinguished for the first time in living memory',
    methods: ['a bucket of water carried in and poured under cover of night', 'the sacred oil supply quietly diverted for weeks until it simply ran dry'],
    motives: ['a rival faith seeking to discredit the shrine and its keepers', 'a disillusioned keeper who no longer believed the flame meant anything'],
  },
];
