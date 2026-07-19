// ─── API-safe Flavor Pool Schemas ────────────────────────────────
// Issue #87 Task B, Phase 1 of docs/superpowers/specs/2026-07-18-
// llm-generators-design.md. One structured-output response schema per
// PoolKind, each describing a single batch request that returns a set
// of candidate pool items: { items: [<ITEM>, ...] }.
//
// API-safety rules (constraint 4 — violations are 400s in production):
// every object level carries additionalProperties:false and a
// `required` array listing every property key; NO minLength/maxLength/
// minimum/maximum/minItems/maxItems/pattern/$ref anywhere. Length and
// count rules therefore live in LENGTH_LIMITS below as plain data for
// the local audit layer (issue #88), never in the schemas themselves.
//
// Engine vocab is the source of truth (constraint 6): every enum below
// is cross-checked — at compile time against the engine's exported
// types where one exists, and at test time (schemas.test.ts) against
// the actual pool keys / pack ids / module exports.

import type { PoolKind } from './prompt-spec';
import type { CreatureType } from '../../src/lib/types';
import type { ThemeId, ThemePack } from '../../src/lib/noncombat/types';
import type * as castPools from '../../src/data/noncombat-cast';
import type * as scenarioPools from '../../src/data/noncombat-scenarios';

/** Compile-time assertion helper: instantiating with `false` is an error. */
type AssertTrue<T extends true> = T;

// ─── Enum vocabularies (engine-derived, never invented) ──────────

/**
 * The creature-type keys of TACTICS_BY_TYPE in
 * src/lib/encounter-generator.ts, in declaration order. The pool is
 * module-private, so it cannot be imported here (and the scope fence
 * forbids modifying src/); instead the list is pinned against the
 * engine twice: `satisfies` + the exhaustiveness assert below check it
 * against the exported CreatureType union at compile time, and
 * schemas.test.ts extracts the actual TACTICS_BY_TYPE keys from the
 * engine source text and cross-checks at test time.
 */
const TACTICS_CREATURE_TYPES = [
  'Beast', 'Undead', 'Humanoid', 'Dragon', 'Fiend', 'Aberration', 'Elemental',
  'Monstrosity', 'Giant', 'Construct', 'Ooze', 'Celestial', 'Fey', 'Plant',
] as const satisfies readonly CreatureType[];

type _AllCreatureTypesCovered = AssertTrue<
  [Exclude<CreatureType, (typeof TACTICS_CREATURE_TYPES)[number]>] extends [never] ? true : false
>;

/**
 * The tier keys of TREASURE_BY_CR in src/lib/encounter-generator.ts
 * (also module-private; no exported type exists for the tiers, so the
 * cross-check is test-time only, against the engine source text).
 */
const TREASURE_TIERS = ['low', 'mid', 'high', 'legendary'] as const;

/** ThemeId values from src/lib/noncombat/types.ts, in THEME_PACKS order. */
const THEME_IDS = [
  'ancient-tomb', 'wild-frontier', 'city-streets', 'noble-court',
  'sacred-temple', 'arcane-sanctum', 'sea-and-shore', 'feywild-revel',
] as const satisfies readonly ThemeId[];

type _AllThemeIdsCovered = AssertTrue<
  [Exclude<ThemeId, (typeof THEME_IDS)[number]>] extends [never] ? true : false
>;

/**
 * ThemePack fields safe for LLM extension: exactly the plain string[]
 * prose pools.
 *
 * Format constraint the audit layer (#88) must enforce: `phrases`
 * entries are cipher plaintexts consumed by the symbol-substitution
 * handout — uppercase A–Z and spaces only, roughly twenty to forty
 * characters. The engine test suite hard-gates this
 * (src/lib/__tests__/noncombat-theming.test.ts), so LENGTH_LIMITS's
 * wider theme-entry band alone is NOT sufficient for phrases.
 *
 * Excluded, and why:
 * - id, label       — pack identity, not content pools.
 * - symbolSets      — string[][]: structural grid material consumed in
 *                     fixed-size sets by symbol-sequence handouts, not
 *                     a flat prose pool an item of text can extend.
 * - glyphStyle      — a { name, flavor } object, not an array.
 * - creatures       — string[], but the entries are SRD monster names
 *                     (bestiary vocabulary): generating monster names
 *                     is a licensing hard-ban in the flavor bible, so
 *                     this pool is never LLM-extended.
 */
const THEME_PROSE_FIELDS = [
  'descriptors', 'materials', 'sensory', 'phrases', 'cast', 'rewards', 'consequences',
] as const satisfies readonly (keyof ThemePack)[];

type _ThemeProseFieldsAreStringArrays = AssertTrue<
  ThemePack[(typeof THEME_PROSE_FIELDS)[number]] extends string[] ? true : false
>;

/**
 * The extendable cast pools of src/data/noncombat-cast.ts, named by
 * their exact export names (`satisfies keyof typeof` pins them to real
 * exports). SOCIAL_COMPLICATIONS and INTERRUPTIONS also exist there
 * but are excluded: KIND_INSTRUCTIONS['persona'] (prompt spec)
 * defines authoring semantics only for persona/want/secret/leverage —
 * adding pools requires a prompt-spec version bump first.
 */
const PERSONA_POOLS = [
  'PERSONAS', 'WANTS', 'SECRETS', 'LEVERAGE',
] as const satisfies readonly (keyof typeof castPools)[];

/**
 * The extendable beat pools of src/data/noncombat-scenarios.ts, named
 * by their exact export names — the three pools whose authoring
 * semantics KIND_INSTRUCTIONS['scenario-beat'] (prompt spec)
 * defines: contest flavor, side event, hazard. Each contributes prose
 * with no dice/DC coupling (the engines attach skills, round counts,
 * and every number). The file's other exports (SKILL_OBJECTIVES,
 * OBSTACLES, WEATHER, TRAP_FRAMES, QUARRIES, WAYPOINTS,
 * INVESTIGATION_FRAMES) are excluded: they are either multi-field
 * frames structurally coupled to skill lists and phase counts, or have
 * no prompt-spec semantics yet — extending this enum requires a
 * prompt-spec version bump first.
 */
const SCENARIO_BEAT_POOLS = [
  'CONTEST_TYPES', 'SIDE_EVENTS', 'GAUNTLET_HAZARDS',
] as const satisfies readonly (keyof typeof scenarioPools)[];

// ─── Schema builders ─────────────────────────────────────────────

function stringProp(): Record<string, unknown> {
  return { type: 'string' };
}

function enumProp(values: readonly string[]): Record<string, unknown> {
  return { type: 'string', enum: [...values] };
}

/**
 * Response schema for one batch request: an object with a single
 * `items` array of identical item objects. Builders return fresh plain
 * objects (no shared references, no undefined values) so every schema
 * is JSON-serializable as-is.
 */
function batchSchema(itemProperties: Record<string, Record<string, unknown>>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: Object.keys(itemProperties),
          properties: itemProperties,
        },
      },
    },
  };
}

// ─── Exports ─────────────────────────────────────────────────────

export const POOL_ITEM_SCHEMAS: Record<PoolKind, Record<string, unknown>> = {
  'scenario-hook': batchSchema({ text: stringProp() }),
  'tactics-type': batchSchema({
    creatureType: enumProp(TACTICS_CREATURE_TYPES),
    text: stringProp(),
  }),
  treasure: batchSchema({
    tier: enumProp(TREASURE_TIERS),
    text: stringProp(),
  }),
  'name-prefix': batchSchema({ text: stringProp() }),
  'theme-entry': batchSchema({
    themeId: enumProp(THEME_IDS),
    field: enumProp(THEME_PROSE_FIELDS),
    text: stringProp(),
  }),
  persona: batchSchema({
    pool: enumProp(PERSONA_POOLS),
    text: stringProp(),
  }),
  'scenario-beat': batchSchema({
    pool: enumProp(SCENARIO_BEAT_POOLS),
    text: stringProp(),
  }),
};

/**
 * Per-kind character bounds for generated `text`, enforced by the
 * local audit layer (issue #88) — structured outputs reject length
 * keywords, so these live here as data instead of in the schemas.
 *
 * Bounds are derived from measuring the existing pools (min–max chars
 * observed), then widened with headroom: floors sit below the shortest
 * legitimate existing entry (rejecting fragments), ceilings roughly
 * double the longest existing entry (rejecting ramblers while leaving
 * room for richer lines). Measured on this checkout:
 * - SCENARIO_HOOKS 63–92        → 40–160 (a template must still fit
 *   "{monsters}" + "{environment}" + a grammatical sentence)
 * - TACTICS_BY_TYPE 41–80       → 30–200 (spec allows two sentences)
 * - TREASURE_BY_CR 20–68        → 15–160 (short phrase up to a sentence)
 * - name prefixes 4–13          → 3–24  (one or two Title Case words)
 * - theme prose fields 5–68     → 4–120 (descriptors are single words;
 *   consequences run longest)
 * - cast pools: WANTS 51–76, SECRETS 42–84, PERSONAS joined 103–151,
 *   LEVERAGE joined 78–148      → 30–240
 * - beat pools: contest flavor 43–80, side-event effect 47–86,
 *   hazard+escape joined 67–149 → 30–240
 */
export const LENGTH_LIMITS: Record<PoolKind, { minChars: number; maxChars: number }> = {
  'scenario-hook': { minChars: 40, maxChars: 160 },
  'tactics-type': { minChars: 30, maxChars: 200 },
  treasure: { minChars: 15, maxChars: 160 },
  'name-prefix': { minChars: 3, maxChars: 24 },
  'theme-entry': { minChars: 4, maxChars: 120 },
  persona: { minChars: 30, maxChars: 240 },
  'scenario-beat': { minChars: 30, maxChars: 240 },
};
