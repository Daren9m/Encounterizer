// ─── Flavor Prompt Spec (the "flavor bible") ─────────────────────
// Issue #87, Phase 1 of docs/superpowers/specs/2026-07-18-llm-generators-design.md
// (sections 5–6). Governance document for LLM-generated flavor-text
// pools, mirroring the MONSTER_ART_BIBLE pattern in
// src/lib/monster-visuals.ts: one shared core (FLAVOR_BIBLE), one
// instruction block per pool kind, and a versioned deterministic
// system-prompt composer. Consumed by the generator (Task B) and the
// audit layer (Task C) under scripts/flavor/.
//
// Authoring rule for THIS file: the bible and every kind block must
// themselves contain no dice notation and no digits that read as
// mechanics — DICE_NOTATION_RE is run against this file's own text in
// prompt-spec.test.ts. Spell numbers out.

/** Bump when prompt content changes materially; stamped into every prompt. */
// v2: theme-entry block — dropped the phantom `symbols` bullet (the field
// enum excludes symbolSets) and aligned the intro with the per-theme
// request shape (the request names only the theme; entries spread across
// fields, each tagged with its field).
export const PROMPT_VERSION: number = 2;

export const POOL_KINDS = [
  'scenario-hook',
  'tactics-type',
  'treasure',
  'name-prefix',
  'theme-entry',
  'persona',
  'scenario-beat',
] as const;

export type PoolKind = (typeof POOL_KINDS)[number];

// ─── Shared system-prompt core ───────────────────────────────────

export const FLAVOR_BIBLE: string = `You write flavor-text pool entries for Encounterizer, a Dungeon Master toolkit for the current edition of the world's oldest fantasy roleplaying game. Your entries ship publicly and are read aloud at real tables, so every line must be usable as-is the moment a DM sees it.

VOICE
- DM-facing, table-ready, evocative but concise. Present tense.
- Every line must work read aloud or dropped straight into a session.
- Vivid concrete detail over abstraction; no purple prose, no filler.
- Fantasy register, no anachronisms, no modern slang.

GROUNDEDNESS
- Reference ONLY facts supplied in the request. Invent texture, never facts.
- Combat prose templates address monsters and places exclusively through the literal slot tokens {monsters} and {environment} — never name a specific creature or location yourself. The engine fills the slots at runtime.
- Where the request supplies vocabulary (creature types, environments, theme identifiers, tiers), use it verbatim; never invent new mechanical vocabulary.

HARD BANS — a single violation makes an entry unusable
- No dice notation of any kind: never write a die expression as digits joined by the letter d (a count, the letter d, and a die size run together — for example two d six written as figures), and never write the letters DC followed by a number.
- No Difficulty Class values, no hit point totals, no armor values, no modifiers, no numbers that read as game mechanics. The engines attach every number; you supply only prose.
- No monster names beyond those supplied in the request.
- No named settings, adventures, characters, or deities from any published roleplaying product. Keep every proper noun generic or freshly invented.
- No imitation of recognizable official-book prose or phrasing.
- No URLs, HTML, markdown, or markup of any kind. Plain text only.`;

// ─── Per-kind instruction blocks ─────────────────────────────────

export const KIND_INSTRUCTIONS: Record<PoolKind, string> = {
  'scenario-hook': `POOL: scenario-hook
Write one-sentence encounter opening templates — the line a DM reads to launch a fight. Each template MUST contain both slot tokens exactly as written: {monsters} and {environment}, each used once. The engine replaces {monsters} with a formatted creature list ("a goblin", "three wolves and an owlbear") and {environment} with a lowercase terrain word, so the sentence must stay grammatical around both substitutions. Shape to match (do not copy): "A dying scout warns the party of {monsters} ahead in the {environment}." Vary the situation across entries: ambush, lair, ritual, territory dispute, rescue, omen, aftermath.`,

  'tactics-type': `POOL: tactics-type
Write per-creature-type tactics lines: one or two self-contained sentences describing how creatures of a given type behave in combat. No slot tokens. The request names the creature type, one of the engine's types: Beast, Undead, Humanoid, Dragon, Fiend, Aberration, Elemental, Monstrosity, Giant, Construct, Ooze, Celestial, Fey, or Plant. Describe concrete observable behavior a DM can run at the table — targeting choices, movement, morale, use of terrain — never stat references and never numbers. Shape to match: "The pack targets the weakest-looking party member first."`,

  treasure: `POOL: treasure
Write treasure descriptions in a gold-and-loot register: coins, gems, trinkets, maps, art objects, storied items. Description only — never amounts, prices, or values; the engine attaches gold values and item rarities itself. The request names a tier (low, mid, high, or legendary); convey the tier's sense of scale through description alone — "a battered trinket in loose coin" reads low, "an immense hoard of mixed coin and storied relics" reads legendary. One entry is one short phrase or sentence.`,

  'name-prefix': `POOL: name-prefix
Write single evocative words or two-word phrases used as encounter-name prefixes, in the register of the existing list: Ambush, Siege, Skirmish, Raid, Assault, Standoff, Hunt, Clash. Title Case, one or two words, combat- or drama-flavored nouns that read naturally in names such as "Ambush at the Ruins". No articles, no punctuation, no slot tokens.`,

  'theme-entry': `POOL: theme-entry
Write entries for a non-combat theme pack's prose fields. The request names the theme; spread entries across the fields below, tag each entry with its field, and match that field's semantics exactly:
- descriptors: short evocative adjectives ("dust-choked", "rain-slicked").
- materials: physical substances and surfaces ("verdigrised bronze", "cracked marble").
- sensory: sensations addressed to the players ("grit underfoot", "a draft that should not exist").
- phrases: cipher plaintexts — uppercase letters A through Z and spaces ONLY, short declarative or imperative sentences a table can decode ("THE THIRD DOOR IS THE TRUE DOOR").
- cast: lowercase noun phrases naming a person of the theme ("a dust-wreathed tomb keeper").
- rewards and consequences: narrative outcomes only — no dice expressions and no numbers; the tone layer decides whether damage text is appended.
Stay inside the named theme's fiction; the engines attach all numbers.`,

  persona: `POOL: persona
Write entries for the social-challenge cast pools. The request names the target pool; match its semantics:
- persona: an archetype as a lowercase noun phrase ("a guild clerk drowning in ledgers"), a physical quirk shown rather than told ("stacks and restacks papers when nervous"), and a speech habit ("answers questions with smaller questions").
- want: something the character needs from the party — specific, story-ready, and deniable ("safe passage for a wagon that must not be inspected").
- secret: something the character hides that recontextualizes them ("they are not who their papers say they are").
- leverage: an approach that moves them and a counter that backfires, as a matched pair.
Everyday people with textured lives — no chosen ones, no world-enders. Present tense, lowercase sentence fragments matching the existing pools.`,

  'scenario-beat': `POOL: scenario-beat
Write entries for the contest, side-event, and hazard pools — the beats of non-combat scenes. The request names the target pool; match its semantics:
- contest flavor: a vivid rival for a tavern or village contest ("a scarred veteran who has not lost in years").
- side event: a way a bystander party member can tilt the scene, with the in-fiction effect described in prose ("learn their tell").
- hazard: a room-scale escalating danger — what worsens with every passing round and the concrete action that ends it ("water rises higher each round; wrench open the drain gate").
Prose only: the engine attaches the skills, the round counts, and every number. Never write a check, a save, or a value.`,
};

// ─── Licensing guardrails (extended by the audit layer, issue #88) ──

/**
 * Starter list of unambiguous non-SRD proper nouns. Lowercase-normalized:
 * compare with `text.toLowerCase()` on the audit side. Deliberately omits
 * ambiguous words that double as common nouns or real-world names.
 */
export const BANNED_PROPER_NOUNS: readonly string[] = [
  // Settings & locations
  'faerûn',
  'faerun',
  'toril',
  'forgotten realms',
  'sword coast',
  'waterdeep',
  "baldur's gate",
  'neverwinter',
  'icewind dale',
  'menzoberranzan',
  'undermountain',
  'candlekeep',
  'eberron',
  'khorvaire',
  'sharn',
  'ravenloft',
  'barovia',
  'greyhawk',
  'oerth',
  'krynn',
  'dragonlance',
  'athas',
  'dark sun',
  'exandria',
  'wildemount',
  'spelljammer',
  'planescape',
  'ravnica',
  'strixhaven',
  // Characters (including named-wizard product identity)
  'drizzt',
  'strahd',
  'elminster',
  'mordenkainen',
  'tasha',
  'xanathar',
  'volo',
  'halaster',
  'acererak',
  'vecna',
  'zariel',
  'fizban',
  'minsc',
  'szass tam',
  'laeral silverhand',
  'bigby',
  'leomund',
  'otiluke',
  'tenser',
  'melf',
  'nystul',
  'evard',
  // Deities (product identity)
  'mystra',
  'lolth',
  'cyric',
  'tymora',
  'kelemvor',
  // Adventure titles
  'curse of strahd',
  'tomb of annihilation',
  "storm king's thunder",
  'dragon heist',
  'rime of the frostmaiden',
  'wild beyond the witchlight',
  'descent into avernus',
  'out of the abyss',
  'ghosts of saltmarsh',
];

/**
 * Matches dice/DC notation: NdM (optional +/- modifier, spaces tolerated),
 * bare dN, and DC followed by a number. Case-insensitive, NOT global —
 * safe for repeated stateless `.test()` calls.
 */
export const DICE_NOTATION_RE: RegExp =
  /\b\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?\b|\bd\d+\b|\bdc\s*\d+\b/i;

// ─── System-prompt composition ───────────────────────────────────

/**
 * Deterministic, pure composition: stable content first for prompt-cache
 * friendliness — shared bible, then the kind block, then the version
 * stamp line (always last).
 */
export function buildSystemPrompt(kind: PoolKind): string {
  return [
    FLAVOR_BIBLE,
    KIND_INSTRUCTIONS[kind],
    `Flavor prompt spec v${PROMPT_VERSION}.`,
  ].join('\n\n');
}
