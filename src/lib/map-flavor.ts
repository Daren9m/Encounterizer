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
//
// Voice: grim. Dread over wonder — every room remembers something
// bad, and most of them are still waiting for it to come back.

export const FLAVOR_STREAM_SALT = 0x466c6176; // 'Flav'

export type MapStructure = 'dungeon' | 'cave' | 'outdoor' | 'city' | 'building';

interface RoomArchetype {
  name: string;
  purpose: string;
}

// ─── Archetype tables (the tool's voice — tune freely) ───────────

const DUNGEON_ENTRANCE: RoomArchetype[] = [
  { name: 'Entry Hall', purpose: 'The way in, and the way out — if it stays open. Whoever holds this room decides who leaves.' },
  { name: 'Gatehouse', purpose: 'Murder-holes above, old blood in the drain. The defenders always planned to bleed people here.' },
  { name: 'Broken Threshold', purpose: 'The seal on this place failed from the inside. The tracks in the dust go in. Fewer come out.' },
];

const DUNGEON_EXIT: RoomArchetype[] = [
  { name: 'Far Passage', purpose: 'The way deeper. Anything the party breaks will run this way — toward whatever it serves.' },
  { name: 'Rear Gate', purpose: 'A second door the inhabitants know well. Assume it has been used tonight.' },
  { name: 'Deep Landing', purpose: 'Stairs continue down past this point. Cold air rises. Sound carries up — and down.' },
];

const DUNGEON_BOSS: RoomArchetype[] = [
  { name: 'Great Hall', purpose: 'The seat of whatever rules here. It has room to work, and it has been waiting for company.' },
  { name: 'Ritual Chamber', purpose: 'Something was begun in this room and never finished. Interrupting it may be worse than letting it end.' },
  { name: 'Vaulted Sanctum', purpose: 'The inner holding: best defended, worst lit, and the last place a scream would matter.' },
];

const DUNGEON_ROOMS: RoomArchetype[] = [
  { name: 'Guard Post', purpose: 'Watch station on the approach. The last watch left mid-meal, and nobody cleared the plates.' },
  { name: 'Desecrated Shrine', purpose: 'Faith died here before the faithful did. What the altar answers to now is an open question.' },
  { name: 'Storeroom', purpose: 'Crates and barrels — count the supplies and know how many mouths this place feeds, and on what.' },
  { name: 'Flooded Cellar', purpose: 'Knee-deep water, mirror-still. It stopped being a cellar the day something moved in below the surface.' },
  { name: 'Barracks', purpose: 'Bunks for the rank and file. Some beds are made. The unmade ones are the recent dead.' },
  { name: 'Crypt Annex', purpose: 'The dead were stored here with haste, not honor. Haste, in the end, was the mistake.' },
  { name: 'Well Room', purpose: 'The water source, and a shaft no map admits to. Things have been drawn up it. Things have been lowered down.' },
  { name: 'Long Gallery', purpose: 'Niches and sightlines the length of a bowshot. Whatever hunts here prefers to see its work coming.' },
  { name: 'Armory', purpose: 'The racks stand half-empty. Whatever was taken is being carried by someone, somewhere in the dark ahead.' },
  { name: 'Cold Refectory', purpose: 'Meals were eaten here recently enough to matter. Not all the bones on the floor came from the kitchen.' },
  { name: 'Archive', purpose: 'Ledgers, letters, and names. The plot is written down in here — including, perhaps, what was promised and to whom.' },
  { name: 'Interrogation Room', purpose: 'Questions were asked here at length. The stains say the answers came slowly.' },
];

const CAVE_ENTRANCE: RoomArchetype[] = [
  { name: 'Cave Mouth', purpose: 'Daylight ends at this line, and everything below knows exactly where that line is.' },
  { name: 'Sinkhole Landing', purpose: 'The floor of the way in, littered with scree — and with the gear of whoever landed badly.' },
  { name: 'Cracked Fissure', purpose: 'A squeeze into the dark. Retreat through it will be slow, loud, and single-file.' },
];

const CAVE_BOSS: RoomArchetype[] = [
  { name: 'Great Cavern', purpose: 'The hollow heart of the system. The bones collect here because their owner does.' },
  { name: 'Black Lake Shore', purpose: 'Still water with no far bank in torchlight. The lair sits at the waterline. So does the smell.' },
  { name: 'Deep Hollow', purpose: 'The bottom of the dark. Everything in these tunnels eventually washes, crawls, or is dragged down here.' },
];

const CAVE_CHAMBERS: RoomArchetype[] = [
  { name: 'Grotto', purpose: 'A pocket of defensible stone. The scratch-marks on the walls say others thought so too.' },
  { name: 'Fungal Field', purpose: 'Pale caps from ankle to shoulder height. Some glow. Some burst. Some are leaning toward you.' },
  { name: 'Bone Pit', purpose: 'A midden of old kills. Read it carefully: the newest bones are the freshest warning.' },
  { name: 'Sunken Pool', purpose: 'Cold, clear, and far deeper than it looks. Things drink here. Things wait here longer.' },
  { name: 'Crystal Gallery', purpose: 'Facets scatter torchlight in every direction — including yours, to every eye in the dark.' },
  { name: 'Bat Roost', purpose: 'The ceiling moves. One loud noise turns it into a screaming weather that marks your position for miles.' },
  { name: 'Abandoned Camp', purpose: 'Someone sheltered here. The bedrolls are still laid out. The fire was never banked.' },
  { name: 'Echoing Vault', purpose: 'Sound leaves this chamber in every direction and returns wrong. Fights here draw an audience.' },
  { name: 'Flowstone Terrace', purpose: 'Slick stone shelves descending in steps. Bad footing for the living; the dark below is patient.' },
];

const OUTDOOR_APPROACH: RoomArchetype[] = [
  { name: 'Open Approach', purpose: 'Where the party enters, in full view. There is no cover until the first terrain feature, and everything ahead knows it.' },
  { name: 'Trailhead', purpose: 'The path the party arrived by — and the line of retreat, if the retreat is fast enough to matter.' },
  { name: 'Low Ground', purpose: 'The starting position, overlooked by everything ahead. The enemy chose to let you have it.' },
];

const OUTDOOR_OPPOSITION: RoomArchetype[] = [
  { name: 'Far Line', purpose: 'The enemy side of the field. They picked this ground before you arrived. Assume that mattered.' },
  { name: 'High Ground', purpose: 'The position of advantage. Taking it will cost movement, breath, and probably blood.' },
  { name: 'Ambush Line', purpose: 'Where the opposition waits, already sighted in. Spotting them first is worth a round. Missing them costs one.' },
];

const OUTDOOR_LANDMARK: RoomArchetype[] = [
  { name: 'Broken Ground', purpose: 'A knot of obstacles mid-field: cover, concealment, and places a body can lie unseen until stepped on.' },
  { name: 'Standing Stones', purpose: 'Old markers nobody remembers raising, for a purpose nobody wrote down. The fight will bend around them. It may not be the first.' },
  { name: 'Ruined Waypost', purpose: 'A collapsed structure with one good wall left. Everyone will want it. Someone may already have it.' },
];

const BUILDING_ENTRANCE: RoomArchetype[] = [
  { name: 'Front Hall', purpose: 'The threshold. Coats still on their hooks, boots still paired by the door. Nobody left in a planned way.' },
  { name: 'Foyer', purpose: 'Where guests were received, when there were guests. The welcome lamp burned itself out untended.' },
  { name: 'Shopfront', purpose: 'The public face of the house. The till is untouched, which rules out every comfortable explanation.' },
];

const BUILDING_BOSS: RoomArchetype[] = [
  { name: "Master's Study", purpose: 'The private room at the back, where the decisions were made. The last one is still on the desk, unsigned.' },
  { name: 'Great Hearth Room', purpose: 'The warm heart of the house. The fire is banked, recent, and larger than any cooking needs.' },
  { name: 'Counting Room', purpose: 'Locks on the inside of the door. Whatever was worth counting in here was worth dying over.' },
];

const BUILDING_ROOMS: RoomArchetype[] = [
  { name: 'Kitchen', purpose: 'A meal was in progress. The knives are all accounted for except one.' },
  { name: 'Pantry', purpose: 'Shelves stocked for a season. Something has been eating from the bottom shelves, low to the floor.' },
  { name: 'Dining Room', purpose: 'The table is set for more people than could live here comfortably.' },
  { name: 'Bedchamber', purpose: 'The bed is made. The window latch is broken from the outside.' },
  { name: 'Study', purpose: 'Books and correspondence. The most-thumbed volume is not on any respectable shelf list.' },
  { name: 'Workshop', purpose: 'Half-finished work clamped to the bench. The craftsman meant to come back within the hour.' },
  { name: "Servant's Quarters", purpose: 'Narrow beds and a shared chest. The servants kept a bar for their side of the door.' },
  { name: 'Parlor', purpose: 'The good furniture, kept for visitors. The dust says the last visitor stayed a very long time.' },
  { name: 'Storage Room', purpose: 'Crates and cast-offs. One crate is nailed shut from a direction that makes no sense.' },
  { name: 'Wash Room', purpose: 'Basins and linens. The drain gurgles at intervals no plumbing explains.' },
  { name: 'Larder', purpose: 'Cool and dark, hooks in the beams. Not all the hanging shapes are hams.' },
  { name: 'Chapel Niche', purpose: 'A household shrine, recently rededicated. The old icon is face-down in the corner.' },
];

const CITY_APPROACH: RoomArchetype[] = [
  { name: 'City Gate', purpose: 'The way in, under the eyes of whatever keeps watch now. The portcullis has not been raised in some time — nor fully lowered.' },
  { name: 'Outer Lane', purpose: 'The street the party arrives by. The doors along it are shut, and stay shut, and someone behind each one is listening.' },
  { name: 'Caravan Yard', purpose: 'Where wagons stop and unload. The last caravan unloaded in a hurry, and left things it meant to keep.' },
];

const CITY_OPPOSITION: RoomArchetype[] = [
  { name: 'Far Ward', purpose: 'The deep end of the district. The people who live here stopped answering knocks before the trouble started.' },
  { name: 'Barricade Line', purpose: 'Furniture, cart-beds, and pew-wood stacked across the street. Built facing the way the party is coming from.' },
  { name: 'Shadowed Colonnade', purpose: 'Covered walkways with sightlines down every approach. Whatever holds this street chose it for exactly that.' },
];

const CITY_BOSS: RoomArchetype[] = [
  { name: 'Grand Plaza', purpose: 'The heart of the district, wide enough for a proclamation or a massacre. It has hosted both.' },
  { name: 'Execution Square', purpose: 'The scaffold timber is still sound. The crowd-stains on the cobbles never fully washed out.' },
  { name: 'Cathedral Forecourt', purpose: 'Holy ground, once. The doors behind it are barred from the inside.' },
];

const CITY_LANDMARK: RoomArchetype[] = [
  { name: 'Fountain Square', purpose: 'Water still runs, which means someone maintains it. Nobody admits to being that someone.' },
  { name: 'Market Row', purpose: 'Stalls and awnings, some still stocked. Whatever emptied the street did not come for the goods.' },
  { name: 'Shrine Steps', purpose: 'Wax from a thousand candles, the newest less than a day old. Prayers here are getting shorter and more specific.' },
  { name: 'Old Well Plaza', purpose: 'The neighborhood water source. Lately people draw their buckets fast and do not look down the shaft.' },
  { name: 'Gallows Corner', purpose: 'The rope is gone. The knot-worn beam is not. Locals cross the square rather than walk beneath it.' },
  { name: 'Hanging Garden', purpose: 'Green things climbing dead walls. Something tends it at night; the pruning cuts are too clean.' },
];

const RIVER_LANDMARK: RoomArchetype[] = [
  { name: 'The Crossing', purpose: 'Moving water splits the field, and the bridges are the only dry way over. Chokepoints like this get named after battles.' },
  { name: 'The Ford', purpose: 'Shallow enough to wade, slow enough to regret it. The water downstream has carried worse than mud.' },
];

// ─── Per-environment sensory palettes ────────────────────────────

interface EnvFlavor {
  descriptors: string[];
  sensory: string[];
}

const ENV_FLAVOR: Partial<Record<Environment, EnvFlavor>> = {
  Forest: {
    descriptors: ['moss-smothered', 'root-buckled', 'light-starved', 'bramble-choked'],
    sensory: ['the birdsong stopped when you entered, and has not resumed', 'the canopy swallows the light a stride above your heads', 'the leaf litter is soft enough to silence anything’s approach', 'something paces you in the brush, patient and unhurried'],
  },
  Grassland: {
    descriptors: ['wind-flattened', 'sun-bleached', 'waist-high', 'trampled'],
    sensory: ['the grass moves against the wind in one place, then stops', 'the insects here have gone quiet in a wide circle', 'the horizon is close enough to hide anything with patience', 'carrion birds turn slow circles overhead, in no hurry at all'],
  },
  Hill: {
    descriptors: ['stone-studded', 'wind-scoured', 'barrow-ridged', 'gorse-choked'],
    sensory: ['the wind carries voices farther than it should, in both directions', 'scree shifts somewhere upslope, once, deliberately', 'the valley below is dotted with cairns nobody tends', 'cloud-shadow drags across the slopes like something hunting'],
  },
  Mountain: {
    descriptors: ['frost-split', 'sheer', 'scree-strewn', 'cloud-shrouded'],
    sensory: ['the air is thin, and tastes of cold iron', 'a rockfall echoes twice — the second one was closer', 'the cold works through every seam and stays', 'the drop beside the path has stopped feeling like a warning and started feeling like an invitation'],
  },
  Desert: {
    descriptors: ['sun-hammered', 'dune-flanked', 'salt-crusted', 'bone-strewn'],
    sensory: ['heat shimmer bends the distance until nothing out there can be trusted', 'sand hisses across the hardpan like something whispering', 'the only shade within a mile is your own shadow', 'between gusts the silence is total, and it is listening'],
  },
  Arctic: {
    descriptors: ['ice-sheeted', 'wind-flayed', 'white-blind', 'frozen'],
    sensory: ['your breath freezes to your collar; speech costs warmth', 'the ice underfoot groans like something turning in its sleep', 'the white erases distance, direction, and eventually judgment', 'the wind finds every seam, and it is not going to stop'],
  },
  Coastal: {
    descriptors: ['salt-scoured', 'tide-gnawed', 'gull-picked', 'spray-slick'],
    sensory: ['the surf beats a slow rhythm below, like something knocking', 'the wind smells of salt, kelp, and old rot', 'down the strand, the gulls are screaming over something large', 'the spray leaves cold beads on your face like a fever breaking'],
  },
  Swamp: {
    descriptors: ['mist-wrapped', 'black-watered', 'root-strangled', 'sinking'],
    sensory: ['the mud takes each boot and gives it back reluctantly', 'something heavy slides off a log into the water and does not resurface', 'the air is thick enough to taste, and it tastes spoiled', 'the insect whine stops whenever you stop — a beat too late'],
  },
  Underdark: {
    descriptors: ['lightless', 'dripping', 'fungus-veined', 'pressure-cracked'],
    sensory: ['water drips somewhere it has dripped for a thousand years, counting', 'the dark eats your torchlight a pace beyond arm’s reach', 'pale fungi shed a corpse-glow that makes everyone look drowned', 'the silence down here has weight, and it presses'],
  },
  Underwater: {
    descriptors: ['current-dragged', 'kelp-shrouded', 'pressure-dimmed', 'silt-blind'],
    sensory: ['your bubbles spiral up and vanish toward a surface you can no longer see', 'the current shoves like a crowd with somewhere to be', 'silt blooms with every movement and hangs there, marking you', 'shapes patrol the edge of the blue, keeping a distance that feels rehearsed'],
  },
  Urban: {
    descriptors: ['soot-blackened', 'rubble-choked', 'gutted', 'abandoned'],
    sensory: ['broken glass grits underfoot no matter how carefully you place your feet', 'a shutter bangs in the wind, again and again, like a signal', 'old smoke still clings to the stone — and under it, something sweeter', 'behind the walls, something knocks once, and is answered'],
  },
  Planar: {
    descriptors: ['unreal', 'gravity-bent', 'star-cold', 'shifting'],
    sensory: ['the geometry is wrong in ways your eyes keep trying to forgive', 'the colors here have no names, and looking at them feels like owing something', 'your heartbeat arrives a half-step behind you', 'the ground remembers being somewhere else, and would like to go back'],
  },
};

const FALLBACK_FLAVOR: EnvFlavor = {
  descriptors: ['dim', 'silent', 'ruinous', 'forgotten'],
  sensory: ['dust hangs motionless in the air, undisturbed for years — until now', 'your footsteps sound louder than they should, and travel farther', 'the quiet here feels deliberate, like held breath'],
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
  if (structure === 'city') {
    if (hasTag(room, 'spawn:party')) return pick(CITY_APPROACH, rng);
    if (hasTag(room, 'boss')) return pick(CITY_BOSS, rng);
    if (hasTag(room, 'landmark')) return pick(CITY_LANDMARK, rng);
    if (hasTag(room, 'spawn:monster')) return pick(CITY_OPPOSITION, rng);
    return pick(CITY_LANDMARK, rng);
  }
  if (structure === 'building') {
    if (hasTag(room, 'entrance')) return pick(BUILDING_ENTRANCE, rng);
    if (hasTag(room, 'boss')) return pick(BUILDING_BOSS, rng);
    return genericQueue.shift() ?? pick(BUILDING_ROOMS, rng);
  }
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
  if (hasTag(room, 'treasure')) extras.push('Something of value is still here — which means something kept it.');
  if (hasTag(room, 'trap')) extras.push('The floor was made to be someone’s last mistake.');
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
  const genericPool = structure === 'cave' ? CAVE_CHAMBERS
    : structure === 'building' ? BUILDING_ROOMS
      : DUNGEON_ROOMS;
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
