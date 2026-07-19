import { shuffleArray } from './random';
import type { Rng } from './random';
import type { Environment, MapRoom, MapRoomTag } from './types';

// ─── Room Flavor ─────────────────────────────────────────────────
// Names, purposes, and read-aloud text for generated map rooms.
// Drawn from a SEPARATE rng stream than the terrain grid
// (seededRandom((seed ^ FLAVOR_STREAM_SALT) & 0x7fffffff)), so pools
// below can grow or change without ever reshuffling the grid behind
// an existing share link. Edit the prose freely; never move draws
// into the grid stream.

export const FLAVOR_STREAM_SALT = 0x466c6176; // 'Flav'

export type MapStructure = 'dungeon' | 'cave' | 'outdoor';

interface RoomArchetype {
  name: string;
  purpose: string;
}

// ─── Archetype tables (the tool's voice — tune freely) ───────────

const DUNGEON_ENTRANCE: RoomArchetype[] = [
  { name: 'Entry Hall', purpose: 'The way in. Whoever holds this room controls the retreat.' },
  { name: 'Gatehouse', purpose: 'A defensible mouth; murder-holes and old hinges. First blood is often spilled here.' },
  { name: 'Broken Threshold', purpose: 'The seal on this place failed long ago. Tracks in the dust run both ways.' },
];

const DUNGEON_EXIT: RoomArchetype[] = [
  { name: 'Far Passage', purpose: 'The way deeper — or out. Anything fleeing the party comes through here.' },
  { name: 'Rear Gate', purpose: 'A second way in that the inhabitants know and the party does not.' },
  { name: 'Deep Landing', purpose: 'Stairs lead on past this point. Sound carries up them.' },
];

const DUNGEON_BOSS: RoomArchetype[] = [
  { name: 'Great Hall', purpose: 'The seat of whatever rules here. Room to maneuver — for both sides.' },
  { name: 'Ritual Chamber', purpose: 'Something was begun in this room. Interrupting it is the adventure.' },
  { name: 'Vaulted Sanctum', purpose: 'The inner holding, best defended and worst lit. The leader stands here.' },
];

const DUNGEON_ROOMS: RoomArchetype[] = [
  { name: 'Guard Post', purpose: 'Watch station on the approach. An alarm raised here changes the whole fight.' },
  { name: 'Collapsed Shrine', purpose: 'Faith outlived the faithful. The altar may still hold a blessing — or a grudge.' },
  { name: 'Storeroom', purpose: 'Crates, barrels, and cover. Supplies here hint at how many mouths this place feeds.' },
  { name: 'Flooded Cellar', purpose: 'Knee-deep water slows movement and hides what sleeps beneath it.' },
  { name: 'Barracks', purpose: 'Bunks for the rank and file. Count the beds to count the garrison.' },
  { name: 'Crypt Annex', purpose: 'The dead were stored here with more haste than honor.' },
  { name: 'Well Room', purpose: 'The water source — and a shaft that goes somewhere no map admits.' },
  { name: 'Long Gallery', purpose: 'A corridor of niches and sightlines. Ranged fighters love it; shields hate it.' },
  { name: 'Armory', purpose: 'Racks stand half-empty. What was taken, and who is carrying it now?' },
  { name: 'Refectory', purpose: 'Meals were eaten here recently enough to matter.' },
  { name: 'Archive', purpose: 'Ledgers, maps, and letters — the room where the plot is written down.' },
  { name: 'Interrogation Room', purpose: 'Questions were asked here. The furniture remembers the answers.' },
];

const CAVE_ENTRANCE: RoomArchetype[] = [
  { name: 'Cave Mouth', purpose: 'Daylight ends here. Eyes take a minute to adjust — a minute something may use.' },
  { name: 'Sinkhole Landing', purpose: 'The floor of the way in. Loose scree announces every step.' },
  { name: 'Cracked Fissure', purpose: 'A squeeze into the dark. Retreat through it is slow and loud.' },
];

const CAVE_BOSS: RoomArchetype[] = [
  { name: 'Great Cavern', purpose: 'The hollow heart of the system. Whatever claims this cave dens here.' },
  { name: 'Black Lake Shore', purpose: 'Still water, no far bank in torchlight. The lair sits at the waterline.' },
  { name: 'Deep Hollow', purpose: 'The bottom of the dark. Bones collect here, and so does their owner.' },
];

const CAVE_CHAMBERS: RoomArchetype[] = [
  { name: 'Grotto', purpose: 'A pocket of calm stone. Defensible, if the party can reach it first.' },
  { name: 'Fungal Field', purpose: 'Pale caps ankle to shoulder height. Some glow; some burst.' },
  { name: 'Bone Pit', purpose: 'A midden of old kills. Reading it tells you what hunts these tunnels.' },
  { name: 'Sunken Pool', purpose: 'Cold, clear, and deeper than it looks. Things drink here — and wait here.' },
  { name: 'Crystal Gallery', purpose: 'Facets throw torchlight in all directions. Beautiful, and terrible for stealth.' },
  { name: 'Bat Roost', purpose: 'The ceiling moves. A loud noise turns it into weather.' },
  { name: 'Old Camp', purpose: 'Someone sheltered here before. What they left says whether they got out.' },
  { name: 'Echoing Vault', purpose: 'Sound carries in every direction from this chamber. Fights here draw company.' },
  { name: 'Flowstone Terrace', purpose: 'Slick stone shelves descend in steps. Bad footing for anyone in a hurry.' },
];

const OUTDOOR_APPROACH: RoomArchetype[] = [
  { name: 'Open Approach', purpose: 'Where the party enters. Little cover until the first terrain feature.' },
  { name: 'Trailhead', purpose: 'The path the party arrived by — and the line of retreat if it goes wrong.' },
  { name: 'Low Ground', purpose: 'The starting position, overlooked by everything ahead.' },
];

const OUTDOOR_OPPOSITION: RoomArchetype[] = [
  { name: 'Far Line', purpose: 'The enemy side of the field. They chose this ground; assume that mattered.' },
  { name: 'High Ground', purpose: 'The position of advantage. Taking it is half the battle plan.' },
  { name: 'Ambush Line', purpose: 'Where the opposition waits. Spotting them first is worth a round.' },
];

const OUTDOOR_LANDMARK: RoomArchetype[] = [
  { name: 'Broken Ground', purpose: 'A knot of obstacles mid-field. Cover, concealment, and complications.' },
  { name: 'Standing Stones', purpose: 'Old markers nobody remembers raising. The fight will bend around them.' },
  { name: 'Ruined Waypost', purpose: 'A collapsed structure with one good wall left. Everyone will want it.' },
];

const RIVER_LANDMARK: RoomArchetype[] = [
  { name: 'The Crossing', purpose: 'Moving water splits the field. The bridges are the tactical prize.' },
  { name: 'The Ford', purpose: 'Shallow enough to wade, slow enough to regret it under fire.' },
];

// ─── Per-environment sensory palettes ────────────────────────────

interface EnvFlavor {
  descriptors: string[];
  sensory: string[];
}

const ENV_FLAVOR: Partial<Record<Environment, EnvFlavor>> = {
  Forest: {
    descriptors: ['moss-hung', 'root-buckled', 'shadow-dappled', 'bramble-choked'],
    sensory: ['birdsong stops as you enter', 'the canopy swallows the light', 'leaf litter muffles every step', 'something small crashes away through the brush'],
  },
  Grassland: {
    descriptors: ['wind-combed', 'sun-bleached', 'waist-high', 'trampled'],
    sensory: ['the grass moves against the wind in one place', 'insects saw away in the heat', 'the horizon feels a mile too close', 'a hawk turns slow circles overhead'],
  },
  Hill: {
    descriptors: ['stone-studded', 'wind-scoured', 'terraced', 'gorse-covered'],
    sensory: ['the wind carries voices farther than it should', 'scree shifts somewhere upslope', 'the valley spreads out below you', 'clouds drag shadows across the slopes'],
  },
  Mountain: {
    descriptors: ['frost-cracked', 'sheer', 'scree-strewn', 'cloud-wrapped'],
    sensory: ['the air is thin and tastes of stone', 'a distant rockfall echoes twice', 'the cold works through every seam', 'the drop pulls at the edge of your vision'],
  },
  Desert: {
    descriptors: ['sun-hammered', 'dune-flanked', 'salt-crusted', 'bone-dry'],
    sensory: ['heat shimmer bends the distance', 'sand hisses across the hardpan', 'your shadow is the only shade', 'the silence is total between gusts'],
  },
  Arctic: {
    descriptors: ['ice-sheeted', 'wind-carved', 'snow-blind', 'frozen'],
    sensory: ['breath freezes in your beard', 'the ice groans underfoot', 'the white steals all sense of distance', 'the wind cuts through fur and cloth alike'],
  },
  Coastal: {
    descriptors: ['salt-streaked', 'tide-worn', 'gull-haunted', 'spray-slick'],
    sensory: ['surf pounds a slow rhythm below', 'the wind smells of salt and rot', 'gulls scream over something down the strand', 'spray beads cold on your face'],
  },
  Swamp: {
    descriptors: ['mist-wrapped', 'black-watered', 'root-tangled', 'sinking'],
    sensory: ['the mud pulls at every boot', 'something big slides off a log into the water', 'the air is thick enough to chew', 'insects rise in a whining cloud'],
  },
  Underdark: {
    descriptors: ['lightless', 'dripping', 'fungus-veined', 'pressure-cracked'],
    sensory: ['water drips somewhere it has dripped for a thousand years', 'the dark eats your torchlight whole', 'pale fungi cast a faint corpse-glow', 'the silence has weight down here'],
  },
  Underwater: {
    descriptors: ['current-swept', 'kelp-shrouded', 'pressure-dimmed', 'silt-clouded'],
    sensory: ['bubbles spiral up and vanish', 'the current shoves like a crowd', 'silt blooms with every movement', 'shapes patrol at the edge of the blue'],
  },
  Urban: {
    descriptors: ['soot-stained', 'rubble-choked', 'gutted', 'abandoned'],
    sensory: ['broken glass grits underfoot', 'a shutter bangs in the wind, again and again', 'old smoke still clings to the stone', 'somewhere behind the walls, something knocks once'],
  },
  Planar: {
    descriptors: ['unreal', 'gravity-bent', 'star-lit', 'shifting'],
    sensory: ['the geometry is wrong in ways your eyes keep correcting', 'colors here have no names', 'your heartbeat sounds a half-step behind you', 'the ground remembers being somewhere else'],
  },
};

const FALLBACK_FLAVOR: EnvFlavor = {
  descriptors: ['dim', 'silent', 'weathered', 'forgotten'],
  sensory: ['dust hangs motionless in the air', 'your footsteps sound louder than they should', 'the quiet here feels deliberate'],
};

// ─── Assembly ────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? 'An' : 'A'} ${phrase}`;
}

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function hasTag(room: MapRoom, tag: MapRoomTag): boolean {
  return room.tags.includes(tag);
}

function archetypeFor(
  room: MapRoom,
  structure: MapStructure,
  genericQueue: RoomArchetype[],
  rng: Rng,
): RoomArchetype {
  if (structure === 'outdoor' || room.kind === 'zone') {
    if (hasTag(room, 'hazard')) return pick(RIVER_LANDMARK, rng);
    if (hasTag(room, 'spawn:party')) return pick(OUTDOOR_APPROACH, rng);
    if (hasTag(room, 'landmark')) return pick(OUTDOOR_LANDMARK, rng);
    if (hasTag(room, 'spawn:monster') && structure === 'outdoor') return pick(OUTDOOR_OPPOSITION, rng);
    // Zones synthesized inside dungeons/caves (degenerate small maps).
    return pick(structure === 'cave' ? CAVE_BOSS : DUNGEON_EXIT, rng);
  }
  if (hasTag(room, 'entrance')) {
    return pick(structure === 'cave' ? CAVE_ENTRANCE : DUNGEON_ENTRANCE, rng);
  }
  if (hasTag(room, 'boss')) {
    return pick(structure === 'cave' ? CAVE_BOSS : DUNGEON_BOSS, rng);
  }
  if (hasTag(room, 'exit') && structure === 'dungeon') {
    return pick(DUNGEON_EXIT, rng);
  }
  // Cycle the shuffled generic pool so names repeat only when rooms
  // outnumber archetypes.
  return genericQueue.shift() ?? pick(structure === 'cave' ? CAVE_CHAMBERS : DUNGEON_ROOMS, rng);
}

function purposeSuffix(room: MapRoom): string {
  const extras: string[] = [];
  if (hasTag(room, 'treasure')) extras.push('Something of value remains here.');
  if (hasTag(room, 'trap')) extras.push('The floor is not to be trusted.');
  return extras.length > 0 ? ` ${extras.join(' ')}` : '';
}

/**
 * Fill name/purpose/readAloud on every room, in room order, drawing only
 * from the flavor rng stream. Mutates the rooms in place.
 */
export function flavorRooms(
  rooms: MapRoom[],
  environment: Environment,
  structure: MapStructure,
  rng: Rng,
): void {
  const env = ENV_FLAVOR[environment] ?? FALLBACK_FLAVOR;
  const genericPool = structure === 'cave' ? CAVE_CHAMBERS : DUNGEON_ROOMS;
  const genericQueue = shuffleArray(genericPool, rng);

  for (const room of rooms) {
    const archetype = archetypeFor(room, structure, genericQueue, rng);
    const descriptor = pick(env.descriptors, rng);
    const sensory = pick(env.sensory, rng);

    room.name = archetype.name;
    room.purpose = archetype.purpose + purposeSuffix(room);
    room.readAloud = room.kind === 'zone'
      ? `${cap(descriptor)} ground stretches ahead. ${cap(sensory)}.`
      : `${withArticle(`${descriptor} ${archetype.name.toLowerCase()}`)}. ${cap(sensory)}.`;
  }
}
