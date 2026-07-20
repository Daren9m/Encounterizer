// Tests for the API-safe flavor pool schemas — issue #87 Task B.
// Written FIRST (TDD): these must fail with a module-resolution error
// until scripts/flavor/schemas.ts exists.
//
// The API-safety walk encodes constraint 4 of the issue #87 global
// constraints: structured-output schemas must carry
// additionalProperties:false + exhaustive `required` on every object
// level, and must never contain minLength/maxLength/minimum/maximum/
// minItems/maxItems/pattern/$ref (unsupported — a 400 in production).
// Length rules live in LENGTH_LIMITS (data for the audit layer, #88).

import { describe, expect, it } from 'vitest';
import { getFlavorPools } from '../../src/lib/flavor-pools';
import { THEME_PACKS } from '../../src/data/noncombat-themes';
import * as castPools from '../../src/data/noncombat-cast';
import * as scenarioPools from '../../src/data/noncombat-scenarios';
import { KIND_INSTRUCTIONS, POOL_KINDS, type PoolKind } from './prompt-spec';
import { LENGTH_LIMITS, POOL_ITEM_SCHEMAS } from './schemas';

// ─── Helpers ─────────────────────────────────────────────────────
// The tactics/treasure cross-checks originally scraped the raw source of
// encounter-generator.ts because the pools were module-private consts and
// Task B's scope fence forbade touching src/. Issue #89 extracted the
// pools into src/lib/flavor-pools.ts behind getFlavorPools(), so the
// cross-checks now import the real frozen v1 pools directly.

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The per-item object schema inside a batch schema. */
function itemSchema(kind: PoolKind): AnyRecord {
  const schema = POOL_ITEM_SCHEMAS[kind] as AnyRecord;
  const properties = schema.properties as AnyRecord;
  const items = properties.items as AnyRecord;
  return items.items as AnyRecord;
}

function itemProperties(kind: PoolKind): AnyRecord {
  return itemSchema(kind).properties as AnyRecord;
}

function enumOf(kind: PoolKind, property: string): string[] {
  const prop = itemProperties(kind)[property] as AnyRecord;
  expect(Array.isArray(prop.enum), `${kind}.${property} has no enum`).toBe(true);
  return prop.enum as string[];
}

/** Recursively visit every nested object/array node of a schema. */
function walk(node: unknown, visit: (n: AnyRecord) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!isRecord(node)) return;
  visit(node);
  for (const child of Object.values(node)) walk(child, visit);
}

// ─── Coverage ────────────────────────────────────────────────────

describe('POOL_ITEM_SCHEMAS coverage', () => {
  it('has exactly one schema per pool kind', () => {
    expect(Object.keys(POOL_ITEM_SCHEMAS).sort()).toEqual([...POOL_KINDS].sort());
  });

  it('has exactly one LENGTH_LIMITS entry per pool kind', () => {
    expect(Object.keys(LENGTH_LIMITS).sort()).toEqual([...POOL_KINDS].sort());
  });

  it('every limits entry satisfies 0 < minChars < maxChars (integers)', () => {
    for (const kind of POOL_KINDS) {
      const { minChars, maxChars } = LENGTH_LIMITS[kind];
      expect(Number.isInteger(minChars), `${kind}.minChars not an integer`).toBe(true);
      expect(Number.isInteger(maxChars), `${kind}.maxChars not an integer`).toBe(true);
      expect(minChars, `${kind}.minChars must be > 0`).toBeGreaterThan(0);
      expect(maxChars, `${kind}.maxChars must exceed minChars`).toBeGreaterThan(minChars);
    }
  });
});

// ─── Batch envelope shape ────────────────────────────────────────

describe('batch envelope', () => {
  it.each([...POOL_KINDS])('%s wraps candidates in { items: [...] }', (kind) => {
    const schema = POOL_ITEM_SCHEMAS[kind] as AnyRecord;
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['items']);
    const properties = schema.properties as AnyRecord;
    expect(Object.keys(properties)).toEqual(['items']);
    const items = properties.items as AnyRecord;
    expect(items.type).toBe('array');
    const item = items.items as AnyRecord;
    expect(item.type).toBe('object');
  });
});

// ─── API safety (constraint 4) ───────────────────────────────────

const FORBIDDEN_KEYWORDS = [
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'pattern',
  '$ref',
] as const;

describe('API-safe schema walk', () => {
  it.each([...POOL_KINDS])('%s: every object node is strict and fully required', (kind) => {
    walk(POOL_ITEM_SCHEMAS[kind], (node) => {
      if (node.type !== 'object') return;
      expect(node.additionalProperties, 'object node missing additionalProperties:false').toBe(false);
      expect(Array.isArray(node.required), 'object node missing required array').toBe(true);
      const propertyKeys = isRecord(node.properties) ? Object.keys(node.properties) : [];
      expect([...(node.required as string[])].sort(), 'required must list every property key')
        .toEqual([...propertyKeys].sort());
    });
  });

  it.each([...POOL_KINDS])('%s: no node carries an unsupported keyword', (kind) => {
    walk(POOL_ITEM_SCHEMAS[kind], (node) => {
      for (const keyword of FORBIDDEN_KEYWORDS) {
        expect(keyword in node, `unsupported keyword ${keyword} present`).toBe(false);
      }
    });
  });

  it.each([...POOL_KINDS])('%s: plain JSON-serializable (round-trips deep-equal)', (kind) => {
    const schema = POOL_ITEM_SCHEMAS[kind];
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

// ─── Per-kind item shapes ────────────────────────────────────────

const EXPECTED_ITEM_KEYS: Record<PoolKind, string[]> = {
  'scenario-hook': ['text'],
  'tactics-type': ['creatureType', 'text'],
  treasure: ['tier', 'text'],
  'name-prefix': ['text'],
  'theme-entry': ['themeId', 'field', 'text'],
  persona: ['pool', 'text'],
  'scenario-beat': ['pool', 'text'],
};

describe('item shapes', () => {
  it.each([...POOL_KINDS])('%s item has exactly the expected properties', (kind) => {
    expect(Object.keys(itemProperties(kind)).sort()).toEqual([...EXPECTED_ITEM_KEYS[kind]].sort());
  });

  it.each([...POOL_KINDS])('%s: text is a free string, other properties are string enums', (kind) => {
    const properties = itemProperties(kind);
    for (const [key, value] of Object.entries(properties)) {
      const prop = value as AnyRecord;
      expect(prop.type, `${kind}.${key} must be a string property`).toBe('string');
      if (key === 'text') {
        expect('enum' in prop, `${kind}.text must not be an enum`).toBe(false);
      } else {
        const values = prop.enum as unknown;
        expect(Array.isArray(values), `${kind}.${key} must be an enum`).toBe(true);
        expect((values as string[]).length, `${kind}.${key} enum is empty`).toBeGreaterThan(0);
        expect(new Set(values as string[]).size, `${kind}.${key} enum has duplicates`)
          .toBe((values as string[]).length);
      }
    }
  });
});

// ─── Vocab cross-checks against the engine ───────────────────────

describe('engine vocab cross-checks', () => {
  it('tactics-type creatureType enum === v1 tacticsByType keys', () => {
    expect(enumOf('tactics-type', 'creatureType').sort())
      .toEqual(Object.keys(getFlavorPools(1).tacticsByType).sort());
  });

  it('treasure tier enum === v1 treasureByTier keys', () => {
    expect(enumOf('treasure', 'tier').sort())
      .toEqual(Object.keys(getFlavorPools(1).treasureByTier).sort());
  });

  it('theme-entry themeId enum === THEME_PACKS ids', () => {
    expect(enumOf('theme-entry', 'themeId').sort())
      .toEqual(THEME_PACKS.map((p) => p.id).sort());
  });

  it('theme-entry field enum names only plain string-array prose pools', () => {
    for (const field of enumOf('theme-entry', 'field')) {
      for (const pack of THEME_PACKS) {
        const pool = (pack as unknown as AnyRecord)[field];
        expect(Array.isArray(pool), `${pack.id}.${field} is not an array`).toBe(true);
        for (const entry of pool as unknown[]) {
          expect(typeof entry, `${pack.id}.${field} holds a non-string entry`).toBe('string');
        }
      }
    }
  });

  it('theme-entry field enum excludes structural and identity fields', () => {
    const fields = enumOf('theme-entry', 'field');
    for (const excluded of ['id', 'label', 'symbolSets', 'glyphStyle', 'creatures']) {
      expect(fields, `field enum must exclude ${excluded}`).not.toContain(excluded);
    }
  });

  it('persona pool enum names real exported array pools of noncombat-cast', () => {
    const pools = enumOf('persona', 'pool');
    expect(pools.sort()).toEqual(['LEVERAGE', 'PERSONAS', 'SECRETS', 'WANTS']);
    for (const pool of pools) {
      const value = (castPools as unknown as AnyRecord)[pool];
      expect(Array.isArray(value), `noncombat-cast does not export array ${pool}`).toBe(true);
      expect((value as unknown[]).length, `${pool} is empty`).toBeGreaterThan(0);
    }
  });

  it('theme-entry instructions describe exactly the schema field enum (no phantom fields)', () => {
    // The model can only emit fields from the schema enum; a bullet for a
    // field outside it (e.g. the excluded symbolSets material) invites
    // mislabeled items forced under a wrong field value.
    const bulletFields = [...KIND_INSTRUCTIONS['theme-entry'].matchAll(/^- ([a-z]+(?: and [a-z]+)?):/gm)]
      .flatMap((m) => m[1]!.split(' and '));
    expect(bulletFields.sort()).toEqual([...enumOf('theme-entry', 'field')].sort());
  });

  it('scenario-beat pool enum names real exported array pools of noncombat-scenarios', () => {
    const pools = enumOf('scenario-beat', 'pool');
    expect(pools.sort()).toEqual(['CONTEST_TYPES', 'GAUNTLET_HAZARDS', 'SIDE_EVENTS']);
    for (const pool of pools) {
      const value = (scenarioPools as unknown as AnyRecord)[pool];
      expect(Array.isArray(value), `noncombat-scenarios does not export array ${pool}`).toBe(true);
      expect((value as unknown[]).length, `${pool} is empty`).toBeGreaterThan(0);
    }
  });
});
