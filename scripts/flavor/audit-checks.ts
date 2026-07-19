// ─── Flavor Audit Check Library ──────────────────────────────────
// Issue #88 Task D, Phase 1 of docs/superpowers/specs/2026-07-18-
// llm-generators-design.md (spec §6.2 layers 1–2). Pure functions
// only: no I/O, no process.exit — the CLI runner (Task E) feeds
// parsed candidates-<kind>.json item arrays through runAuditChecks
// and turns the report into exit codes.
//
// Content problems are always RETURNED as AuditIssue failures, never
// thrown. Throwing is reserved for one condition: a schema node using
// a JSON-Schema feature outside the subset this validator implements
// (schema drift must be loud, not silently unvalidated).
//
// Licensing note (spec §6.2, constraint 5 of the issue #88 global
// constraints): these mechanical checks are necessary but NOT
// sufficient — human review of candidate content remains the final
// gate before anything ships.

import { BANNED_PROPER_NOUNS, DICE_NOTATION_RE, POOL_KINDS, type PoolKind } from './prompt-spec';
import { LENGTH_LIMITS, POOL_ITEM_SCHEMAS } from './schemas';

export interface AuditIssue {
  kind: PoolKind;
  index: number;
  check: string;
  detail: string;
}

export interface AuditReport {
  failures: AuditIssue[];
  itemsChecked: number;
}

// ─── Check 1: minimal schema validator ───────────────────────────
// Covers EXACTLY the subset scripts/flavor/schemas.ts uses (verified
// by reading it): `type: object` with properties/required/
// additionalProperties:false, `type: array` with items,
// `type: string` with optional enum. Anything else throws.

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function assertOnlyKeys(node: AnyRecord, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(node)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path}: unsupported schema keyword "${key}" (validator subset: object/array/string/enum)`);
    }
  }
}

/**
 * Validate `value` against the given schema node, returning
 * human-readable error strings (value path + reason); empty array on
 * success. Throws (never returns) on any schema construct outside the
 * supported subset.
 */
export function validateAgainstSchema(schema: Record<string, unknown>, value: unknown): string[] {
  const errors: string[] = [];
  validateNode(schema, value, '$', errors);
  return errors;
}

function validateNode(schema: unknown, value: unknown, path: string, errors: string[]): void {
  if (!isRecord(schema)) {
    throw new Error(`${path}: schema node is not an object`);
  }
  switch (schema.type) {
    case 'object': {
      assertOnlyKeys(schema, ['type', 'properties', 'required', 'additionalProperties'], path);
      if (schema.additionalProperties !== false) {
        throw new Error(`${path}: object schema must set additionalProperties:false`);
      }
      const properties = schema.properties;
      if (!isRecord(properties)) {
        throw new Error(`${path}: object schema must carry a properties object`);
      }
      const required = schema.required;
      if (!Array.isArray(required) || !required.every((key) => typeof key === 'string')) {
        throw new Error(`${path}: object schema must carry a required string array`);
      }
      if (!isRecord(value)) {
        errors.push(`${path}: expected object, got ${describeValue(value)}`);
        return;
      }
      for (const key of required) {
        if (!(key in value)) errors.push(`${path}: missing required property "${key}"`);
      }
      for (const [key, propertyValue] of Object.entries(value)) {
        const propertySchema = properties[key];
        if (propertySchema === undefined) {
          errors.push(`${path}: unexpected property "${key}"`);
          continue;
        }
        validateNode(propertySchema, propertyValue, `${path}.${key}`, errors);
      }
      return;
    }
    case 'array': {
      assertOnlyKeys(schema, ['type', 'items'], path);
      if (!isRecord(schema.items)) {
        throw new Error(`${path}: array schema must carry an items schema`);
      }
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${describeValue(value)}`);
        return;
      }
      value.forEach((element, index) => validateNode(schema.items, element, `${path}[${index}]`, errors));
      return;
    }
    case 'string': {
      assertOnlyKeys(schema, ['type', 'enum'], path);
      const allowed = schema.enum;
      if (allowed !== undefined && (!Array.isArray(allowed) || !allowed.every((v) => typeof v === 'string'))) {
        throw new Error(`${path}: enum must be a string array`);
      }
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${describeValue(value)}`);
        return;
      }
      if (Array.isArray(allowed) && !allowed.includes(value)) {
        errors.push(`${path}: "${value}" is not one of the allowed values (${allowed.join(', ')})`);
      }
      return;
    }
    default:
      throw new Error(`${path}: unsupported schema type ${JSON.stringify(schema.type)}`);
  }
}

// ─── Check 5: mechanics-leak regexes ─────────────────────────────

/**
 * Mechanics leaks DICE_NOTATION_RE misses. Bare `DC` + digits is
 * already covered upstream by DICE_NOTATION_RE (imported, not
 * duplicated here). All stateless (no `g` flag) — safe for repeated
 * `.test()`/`.match()` calls. Innocent prose must survive: "the pack
 * circles", "a difficult climb", "the academy's arch".
 */
export const EXTENDED_MECHANICS_RES: readonly RegExp[] = [
  /\bac\s*\d+/i, // armor-class values: "AC 17"
  /(?:[+-]\s*)?\d+\s+to\s+hit\b/i, // attack bonuses: "+4 to hit"
  /\bdifficulty\s+class\b/i, // Difficulty Class spelled out
  /\bsaving\s+throws?(?:\s+\w+){0,3}\s+\d/i, // "saving throw of 15"
];

// ─── Check 7: banned proper nouns + Product Identity monsters ────

/**
 * Non-SRD monster names Wizards of the Coast designates Product
 * Identity. Source: the v3.5 System Reference Document "Legal
 * Information" Product Identity designation, which names exactly this
 * monster family — "beholder, gauth, carrion crawler, tanar'ri,
 * baatezu, displacer beast, githyanki, githzerai, kuo-toa, mind
 * flayer, illithid, slaad, umber hulk, yuan-ti" — and remains the
 * well-known PI monster list. None of these appear in SRD 5.2.1
 * (CC-BY-4.0), the source of this repo's generated bestiary;
 * audit-checks.test.ts cross-checks every entry against
 * src/data (ALL_MONSTERS) so the ban list can never reject a monster
 * name the SRD legally ships.
 *
 * Lowercase-normalized like BANNED_PROPER_NOUNS. Matching is
 * word-boundary and case-insensitive, with spaces and hyphens
 * interchangeable ("mind flayer" also catches "mind-flayer").
 */
export const PRODUCT_IDENTITY_MONSTERS: readonly string[] = [
  'baatezu',
  'beholder',
  'carrion crawler',
  'displacer beast',
  'gauth',
  'githyanki',
  'githzerai',
  'illithid',
  'kuo-toa',
  'mind flayer',
  'slaad',
  "tanar'ri",
  'umber hulk',
  'yuan-ti',
];

/**
 * Whole-phrase matcher: word boundaries on both ends, case-
 * insensitive, internal space/hyphen runs interchangeable. "dark sun"
 * flags "an artifact of Dark Sun" but not "the dark sunlight faded".
 */
function bannedTermRe(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexible = escaped.replace(/[\s-]+/g, '[\\s-]+');
  return new RegExp(`\\b${flexible}\\b`, 'i');
}

const BANNED_TERMS: readonly { term: string; re: RegExp }[] = [
  ...BANNED_PROPER_NOUNS,
  ...PRODUCT_IDENTITY_MONSTERS,
].map((term) => ({ term, re: bannedTermRe(term) }));

// ─── Check 6: theme-entry phrases cipher constraint ──────────────

/**
 * Cipher plaintext rule for theme-entry `phrases`: uppercase A–Z and
 * spaces only, twenty to forty characters. Mirrors the engine's hard
 * gate in src/lib/__tests__/noncombat-theming.test.ts
 * (`expect(ph).toMatch(/^[A-Z ]{20,40}$/)`).
 */
const PHRASES_CIPHER_RE = /^[A-Z ]{20,40}$/;

// ─── Check 4: slot tokens ────────────────────────────────────────

const TOKEN_RE = /\{[^{}]*\}/g;

const ALLOWED_TOKENS: Record<PoolKind, readonly string[]> = {
  'scenario-hook': ['{monsters}', '{environment}'],
  'tactics-type': [],
  treasure: [],
  'name-prefix': [],
  'theme-entry': [],
  persona: [],
  'scenario-beat': [],
};

// ─── Composition ─────────────────────────────────────────────────

/** The per-item object schema nested inside a kind's batch schema. */
function itemSchemaFor(kind: PoolKind): AnyRecord {
  const batch = POOL_ITEM_SCHEMAS[kind] as AnyRecord;
  const properties = batch.properties as AnyRecord;
  const items = properties.items as AnyRecord;
  return items.items as AnyRecord;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Run every audit check over a candidates map (kind → parsed item
 * array from candidates-<kind>.json) and return all failures. Never
 * throws on content problems; only schema-subset drift (check 1)
 * throws.
 */
export function runAuditChecks(candidates: Partial<Record<PoolKind, unknown[]>>): AuditReport {
  const failures: AuditIssue[] = [];
  let itemsChecked = 0;

  for (const kind of POOL_KINDS) {
    const items = candidates[kind];
    if (!items) continue;
    const itemSchema = itemSchemaFor(kind);
    const limits = LENGTH_LIMITS[kind];
    const allowedTokens = ALLOWED_TOKENS[kind];
    const seen = new Map<string, number>(); // normalized text → first index

    items.forEach((item, index) => {
      itemsChecked += 1;
      const fail = (check: string, detail: string): void => {
        failures.push({ kind, index, check, detail });
      };

      // 1. Schema re-validation.
      for (const error of validateAgainstSchema(itemSchema, item)) fail('schema', error);

      // Text-based checks need a text field; its absence or wrong type
      // was already reported by the schema check above.
      const text = isRecord(item) && typeof item.text === 'string' ? item.text : null;
      if (text === null) return;

      // 2. Uniqueness within the kind (normalized).
      const normalized = normalizeText(text);
      const firstIndex = seen.get(normalized);
      if (firstIndex !== undefined) {
        fail('uniqueness', `duplicate of item ${firstIndex} after normalization: "${normalized}"`);
      } else {
        seen.set(normalized, index);
      }

      // 3. Length limits.
      if (text.length < limits.minChars || text.length > limits.maxChars) {
        fail('length', `text is ${text.length} chars; ${kind} allows ${limits.minChars}-${limits.maxChars}`);
      }

      // 4. Slot-token integrity.
      for (const token of allowedTokens) {
        if (!text.includes(token)) fail('slot-tokens', `missing required slot token ${token}`);
      }
      for (const token of text.match(TOKEN_RE) ?? []) {
        if (!allowedTokens.includes(token)) {
          const allowance = allowedTokens.length > 0
            ? `allowed: ${allowedTokens.join(', ')}`
            : `${kind} allows no slot tokens`;
          fail('slot-tokens', `unexpected token ${token} (${allowance})`);
        }
      }

      // 5. Mechanics leak.
      for (const re of [DICE_NOTATION_RE, ...EXTENDED_MECHANICS_RES]) {
        const match = text.match(re);
        if (match) fail('mechanics', `mechanics leak "${match[0]}" (matched ${re.source})`);
      }

      // 6. Phrases cipher constraint (theme-entry only).
      if (kind === 'theme-entry' && isRecord(item) && item.field === 'phrases' && !PHRASES_CIPHER_RE.test(text)) {
        fail(
          'phrases-cipher',
          `phrases must be cipher plaintexts matching ${PHRASES_CIPHER_RE.source} ` +
            `(uppercase A-Z and spaces, twenty to forty chars); got "${text}"`,
        );
      }

      // 7. Banned proper nouns + Product Identity monsters.
      for (const { term, re } of BANNED_TERMS) {
        const match = text.match(re);
        if (match) fail('banned-noun', `banned proper noun "${term}" matched "${match[0]}"`);
      }
    });
  }

  return { failures, itemsChecked };
}
