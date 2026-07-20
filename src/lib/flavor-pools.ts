// ─── Combat flavor pools, versioned ──────────────────────────────
// The v1 pools below are the original inline pools from
// encounter-generator.ts, relocated VERBATIM. They are frozen: seeded
// replay links (?seed=...) reproduce prose by drawing from these exact
// arrays in the exact original order, so editing any string or its
// position is a contract break. New flavor content lands as a new
// version, never as an edit to v1.

export type FlavorVersion = 1 | 2;

export interface FlavorPools {
  /** Templates with {monsters} / {environment} placeholders. */
  scenarioHooks: readonly string[];
  /** Tactics lines keyed by monster type; 'Monstrosity' is the fallback bucket. */
  tacticsByType: Readonly<Record<string, readonly string[]>>;
  /** Treasure lines keyed by CR tier. */
  treasureByTier: Readonly<Record<'low' | 'mid' | 'high' | 'legendary', readonly string[]>>;
  /** Encounter-name prefixes ("Ambush — ..."). */
  namePrefixes: readonly string[];
}

const V1_POOLS: FlavorPools = {
  scenarioHooks: [
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
  ],
  tacticsByType: {
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
  },
  treasureByTier: {
    low: [
      '2d6 GP in loose coin',
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
      'A rare magic item and 500 GP',
      'A spell scroll (5th level), potion of greater healing, and 300 GP',
      'An art object worth 750 GP and a rare magic item',
    ],
    legendary: [
      'A very rare or legendary magic item',
      '10d6 × 100 GP, 3d6 gems worth 500 GP each',
      'A legendary artifact with a storied history',
      'An immense hoard: 5,000+ GP in mixed treasure and 2 rare magic items',
    ],
  },
  namePrefixes: [
    'Ambush', 'Siege', 'Skirmish', 'Raid', 'Assault',
    'Standoff', 'Hunt', 'Clash', 'Confrontation', 'Battle',
  ],
};

// SINGLE INDIRECTION POINT for flavor-pool versioning.
// Issue #93 repoints version 2 at the generated pools in
// src/data/encounter-flavor.ts once they exist; until then v2
// intentionally resolves to the same frozen v1 content. Version 1 stays
// pinned to V1_POOLS forever.
const POOLS_BY_VERSION: Record<FlavorVersion, FlavorPools> = {
  1: V1_POOLS,
  2: V1_POOLS,
};

/** Resolve the flavor pools for a given version. Same version ⇒ same pools, forever. */
export function getFlavorPools(version: FlavorVersion): FlavorPools {
  return POOLS_BY_VERSION[version];
}
