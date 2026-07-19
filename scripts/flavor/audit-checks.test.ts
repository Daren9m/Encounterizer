// Tests for the flavor audit check library — issue #88 Task D.
// Written FIRST (TDD): these must fail with a module-resolution error
// until scripts/flavor/audit-checks.ts exists.
//
// The library is the pure layer of the audit gate (spec §6.2 layers
// 1–2): schema re-validation, uniqueness, length limits, slot-token
// integrity, mechanics-leak detection, the theme-entry phrases cipher
// constraint, and banned-proper-noun / Product Identity screening.
// Content problems are returned as AuditIssue failures, never thrown;
// throwing is reserved for schema-subset drift (an unsupported
// JSON-Schema keyword must be loud, not silently ignored).

import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS } from '../../src/data';
import { BANNED_PROPER_NOUNS, DICE_NOTATION_RE, POOL_KINDS, type PoolKind } from './prompt-spec';
import { LENGTH_LIMITS, POOL_ITEM_SCHEMAS } from './schemas';
import {
  EXTENDED_MECHANICS_RES,
  PRODUCT_IDENTITY_MONSTERS,
  runAuditChecks,
  validateAgainstSchema,
  type AuditIssue,
  type AuditReport,
} from './audit-checks';

// ─── Helpers ─────────────────────────────────────────────────────

type AnyRecord = Record<string, unknown>;

/** The per-item object schema inside a batch schema. */
function itemSchema(kind: PoolKind): AnyRecord {
  const schema = POOL_ITEM_SCHEMAS[kind] as AnyRecord;
  const properties = schema.properties as AnyRecord;
  const items = properties.items as AnyRecord;
  return items.items as AnyRecord;
}

function run(kind: PoolKind, items: unknown[]): AuditReport {
  return runAuditChecks({ [kind]: items });
}

function checksOf(report: AuditReport): string[] {
  return report.failures.map((f) => f.check);
}

/** A valid item per kind, used by clean-pass and composition tests. */
const VALID_ITEMS: Record<PoolKind, unknown> = {
  'scenario-hook': { text: 'A dying horn call heralds {monsters} closing through the {environment}.' },
  'tactics-type': { creatureType: 'Beast', text: 'The pack circles the wounded first, then closes in together.' },
  treasure: { tier: 'low', text: 'a battered trinket buried in loose coin' },
  'name-prefix': { text: 'Last Stand' },
  'theme-entry': { themeId: 'ancient-tomb', field: 'phrases', text: 'THE THIRD GATE HIDES THE TRUE PATH' },
  persona: { pool: 'WANTS', text: 'safe passage for a wagon that must not be inspected' },
  'scenario-beat': { pool: 'SIDE_EVENTS', text: "The academy's arch shelters a rival sketching every move." },
};

// ─── validateAgainstSchema: acceptance ───────────────────────────

describe('validateAgainstSchema', () => {
  it.each([...POOL_KINDS])('%s: accepts a valid item against the item schema', (kind) => {
    expect(validateAgainstSchema(itemSchema(kind), VALID_ITEMS[kind])).toEqual([]);
  });

  it.each([...POOL_KINDS])('%s: accepts an empty batch against the full batch schema (subset covers every real schema)', (kind) => {
    expect(validateAgainstSchema(POOL_ITEM_SCHEMAS[kind], { items: [] })).toEqual([]);
  });

  it('accepts a populated batch against the full batch schema', () => {
    expect(validateAgainstSchema(POOL_ITEM_SCHEMAS.treasure, { items: [VALID_ITEMS.treasure] })).toEqual([]);
  });

  it('rejects a non-object where an object is required', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), 'not an object');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('object');
  });

  it('rejects a missing required property, naming it', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), { text: 'a battered trinket buried in loose coin' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tier');
  });

  it('rejects an unexpected property (additionalProperties: false), naming it', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), {
      tier: 'low',
      text: 'a battered trinket buried in loose coin',
      mood: 'gloomy',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('mood');
  });

  it('rejects an enum violation, naming the offending value', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), { tier: 'epic', text: 'a battered trinket buried in loose coin' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('epic');
  });

  it('rejects a non-string where a string is required, with a property path', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), { tier: 'low', text: 42 });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('text');
  });

  it('rejects a non-array where an array is required', () => {
    const errors = validateAgainstSchema(POOL_ITEM_SCHEMAS.treasure, { items: 'nope' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('array');
  });

  it('reports array element errors with an index in the path', () => {
    const errors = validateAgainstSchema(POOL_ITEM_SCHEMAS.treasure, {
      items: [VALID_ITEMS.treasure, { tier: 'low' }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('[1]');
    expect(errors[0]).toContain('text');
  });

  it('collects multiple errors instead of stopping at the first', () => {
    const errors = validateAgainstSchema(itemSchema('treasure'), { tier: 'epic', text: 42, mood: 'gloomy' });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── validateAgainstSchema: drift must throw ─────────────────────

describe('validateAgainstSchema schema-drift guard', () => {
  it('throws on an unsupported keyword (pattern)', () => {
    expect(() => validateAgainstSchema({ type: 'string', pattern: '^x$' }, 'x')).toThrow(/pattern/);
  });

  it('throws on an unsupported type (number)', () => {
    expect(() => validateAgainstSchema({ type: 'number' }, 3)).toThrow();
  });

  it('throws when additionalProperties is not false', () => {
    expect(() =>
      validateAgainstSchema({ type: 'object', properties: {}, required: [], additionalProperties: true }, {}),
    ).toThrow();
  });

  it('throws when an object node lacks required', () => {
    expect(() =>
      validateAgainstSchema({ type: 'object', properties: {}, additionalProperties: false }, {}),
    ).toThrow(/required/);
  });

  it('throws when an array node lacks items', () => {
    expect(() => validateAgainstSchema({ type: 'array' }, [])).toThrow(/items/);
  });
});

// ─── runAuditChecks: composition ─────────────────────────────────

describe('runAuditChecks composition', () => {
  it('returns an empty report for empty candidates', () => {
    expect(runAuditChecks({})).toEqual({ failures: [], itemsChecked: 0 });
  });

  it('passes one valid item of every kind with zero failures', () => {
    const candidates = Object.fromEntries(
      POOL_KINDS.map((kind) => [kind, [VALID_ITEMS[kind]]]),
    ) as Partial<Record<PoolKind, unknown[]>>;
    const report = runAuditChecks(candidates);
    expect(report.failures).toEqual([]);
    expect(report.itemsChecked).toBe(POOL_KINDS.length);
  });

  it('counts items across kinds even when they fail', () => {
    const report = runAuditChecks({
      treasure: [VALID_ITEMS.treasure, 'not an object'],
      'name-prefix': [{ text: 'Last Stand' }],
    });
    expect(report.itemsChecked).toBe(3);
  });

  it('surfaces malformed items as schema failures instead of throwing', () => {
    const report = run('treasure', ['not an object', null, 7]);
    expect(report.itemsChecked).toBe(3);
    expect(report.failures.length).toBeGreaterThanOrEqual(3);
    for (const failure of report.failures) expect(failure.check).toBe('schema');
  });

  it('failures carry kind, index, check, and detail', () => {
    const report = run('treasure', [VALID_ITEMS.treasure, { tier: 'low' }]);
    expect(report.failures).toHaveLength(1);
    const failure = report.failures[0] as AuditIssue;
    expect(failure.kind).toBe('treasure');
    expect(failure.index).toBe(1);
    expect(failure.check).toBe('schema');
    expect(typeof failure.detail).toBe('string');
    expect(failure.detail.length).toBeGreaterThan(0);
  });
});

// ─── Check 2: uniqueness ─────────────────────────────────────────

describe('uniqueness check', () => {
  it('flags duplicates after trim/collapse/lowercase normalization', () => {
    const report = run('treasure', [
      { tier: 'low', text: 'A tarnished silver locket on a chain' },
      { tier: 'high', text: '  a  TARNISHED   silver locket on a chain ' },
    ]);
    expect(checksOf(report)).toEqual(['uniqueness']);
    expect(report.failures[0].index).toBe(1);
  });

  it('does not flag distinct texts', () => {
    const report = run('treasure', [
      { tier: 'low', text: 'a battered trinket buried in loose coin' },
      { tier: 'low', text: 'a cracked cameo of a forgotten matriarch' },
    ]);
    expect(report.failures).toEqual([]);
  });
});

// ─── Check 3: length limits ──────────────────────────────────────

describe('length check', () => {
  it('flags text shorter than minChars', () => {
    const report = run('treasure', [{ tier: 'low', text: 'tiny gem' }]);
    expect(checksOf(report)).toEqual(['length']);
  });

  it('flags text longer than maxChars', () => {
    const report = run('treasure', [{ tier: 'low', text: 'a'.repeat(LENGTH_LIMITS.treasure.maxChars + 1) }]);
    expect(checksOf(report)).toEqual(['length']);
  });

  it('accepts text exactly at both bounds', () => {
    const report = run('treasure', [
      { tier: 'low', text: 'a'.repeat(LENGTH_LIMITS.treasure.minChars) },
      { tier: 'low', text: 'b'.repeat(LENGTH_LIMITS.treasure.maxChars) },
    ]);
    expect(report.failures).toEqual([]);
  });
});

// ─── Check 4: slot-token integrity ───────────────────────────────

describe('slot-token check', () => {
  it('accepts a scenario-hook with both required tokens', () => {
    const report = run('scenario-hook', [VALID_ITEMS['scenario-hook']]);
    expect(report.failures).toEqual([]);
  });

  it('flags a scenario-hook missing {environment}', () => {
    const report = run('scenario-hook', [{ text: 'The {monsters} strike from every shadow at once.' }]);
    expect(checksOf(report)).toEqual(['slot-tokens']);
    expect(report.failures[0].detail).toContain('{environment}');
  });

  it('flags an unknown token in a scenario-hook', () => {
    const report = run('scenario-hook', [
      { text: 'Scouts report {monsters} massing near the {environment} by the {tower}.' },
    ]);
    expect(checksOf(report)).toEqual(['slot-tokens']);
    expect(report.failures[0].detail).toContain('{tower}');
  });

  it('flags any token in a kind that allows none', () => {
    const report = run('treasure', [{ tier: 'high', text: 'a chest holding {gold} beyond all counting' }]);
    expect(checksOf(report)).toEqual(['slot-tokens']);
    expect(report.failures[0].detail).toContain('{gold}');
  });
});

// ─── Check 5: mechanics leak ─────────────────────────────────────

describe('mechanics-leak check', () => {
  const MECHANICS_TEXTS = [
    'The alpha rakes for 2d6 slashing before it withdraws.', // dice notation
    'It cannot pierce AC 17 plate and it knows it well.', // armor class value
    'The veteran swings with +4 to hit against the rearguard.', // attack bonus
    'The climb demands a Difficulty Class check from all comers.', // DC spelled out
    'Each round everyone repeats a saving throw of 15 or drops.', // save vs number
    'The lock demands DC 12 nimble fingers to defeat quietly.', // bare DC + digits
  ];

  it.each(MECHANICS_TEXTS)('flags: %s', (text) => {
    const report = run('tactics-type', [{ creatureType: 'Beast', text }]);
    expect(checksOf(report)).toEqual(['mechanics']);
  });

  const INNOCENT_ITEMS: [PoolKind, unknown][] = [
    ['tactics-type', { creatureType: 'Beast', text: 'The pack circles the wounded first, then closes in together.' }],
    ['scenario-beat', { pool: 'GAUNTLET_HAZARDS', text: 'A difficult climb steepens with every breath; wedge the rockfall shut to end it.' }],
    ['scenario-beat', { pool: 'SIDE_EVENTS', text: "The academy's arch shelters a rival sketching every move." }],
  ];

  it.each(INNOCENT_ITEMS)('innocent prose survives (%s)', (kind, item) => {
    expect(run(kind, [item]).failures).toEqual([]);
  });

  it('EXTENDED_MECHANICS_RES is a non-empty list of stateless (non-global) RegExps', () => {
    expect(EXTENDED_MECHANICS_RES.length).toBeGreaterThanOrEqual(4);
    for (const re of EXTENDED_MECHANICS_RES) {
      expect(re).toBeInstanceOf(RegExp);
      expect(re.flags).not.toContain('g');
    }
  });

  it.each(['AC 17', '+4 to hit', 'Difficulty Class', 'a saving throw of 15'])(
    'some extended regex matches %s',
    (sample) => {
      expect(EXTENDED_MECHANICS_RES.some((re) => re.test(sample))).toBe(true);
    },
  );

  it('does not duplicate DICE_NOTATION_RE coverage of bare DC + digits', () => {
    expect(DICE_NOTATION_RE.test('DC 12')).toBe(true); // covered upstream
    expect(EXTENDED_MECHANICS_RES.some((re) => re.test('DC 12'))).toBe(false);
  });

  it.each(['the pack circles', 'a difficult climb', "the academy's arch"])(
    'no extended regex matches innocent %s',
    (sample) => {
      expect(EXTENDED_MECHANICS_RES.some((re) => re.test(sample))).toBe(false);
    },
  );
});

// ─── Check 6: theme-entry phrases cipher constraint ──────────────

describe('phrases cipher check', () => {
  const entry = (field: string, text: string): unknown => ({ themeId: 'ancient-tomb', field, text });

  it('accepts a conforming cipher plaintext', () => {
    expect(run('theme-entry', [entry('phrases', 'THE THIRD GATE HIDES THE TRUE PATH')]).failures).toEqual([]);
  });

  it('flags lowercase phrases', () => {
    const report = run('theme-entry', [entry('phrases', 'the third door is the true door')]);
    expect(checksOf(report)).toEqual(['phrases-cipher']);
  });

  it('flags phrases under twenty characters', () => {
    const text = 'OPEN THE NINTH GATE';
    expect(text).toHaveLength(19);
    expect(checksOf(run('theme-entry', [entry('phrases', text)]))).toEqual(['phrases-cipher']);
  });

  it('accepts exactly twenty characters', () => {
    const text = 'OPEN THE NINTH GATES';
    expect(text).toHaveLength(20);
    expect(run('theme-entry', [entry('phrases', text)]).failures).toEqual([]);
  });

  it('flags phrases over forty characters', () => {
    const text = 'THE THIRD DOOR IS THE TRUE DOOR OF THE TOMB';
    expect(text.length).toBeGreaterThan(40);
    expect(checksOf(run('theme-entry', [entry('phrases', text)]))).toEqual(['phrases-cipher']);
  });

  it('flags punctuation and digits', () => {
    expect(checksOf(run('theme-entry', [entry('phrases', 'THE THIRD DOOR, TRULY THE TRUE ONE!')]))).toEqual([
      'phrases-cipher',
    ]);
  });

  it('does not apply to other theme-entry fields', () => {
    expect(run('theme-entry', [entry('descriptors', 'dust-choked')]).failures).toEqual([]);
  });
});

// ─── Check 7: banned proper nouns + Product Identity ─────────────

describe('banned proper noun check', () => {
  const treasure = (text: string): unknown => ({ tier: 'low', text });

  it("flags 'an artifact of Dark Sun' (whole-phrase, case-insensitive)", () => {
    const report = run('treasure', [treasure('an artifact of Dark Sun')]);
    expect(checksOf(report)).toEqual(['banned-noun']);
    expect(report.failures[0].detail.toLowerCase()).toContain('dark sun');
  });

  it("does not flag 'the dark sunlight faded' (boundary on the phrase end)", () => {
    expect(run('treasure', [treasure('the dark sunlight faded')]).failures).toEqual([]);
  });

  it('flags a possessive use of a banned setting name', () => {
    expect(checksOf(run('treasure', [treasure("a coin struck in Waterdeep's mint")]))).toEqual(['banned-noun']);
  });

  it('flags a Product Identity monster name', () => {
    const report = run('treasure', [treasure("a beholder's petrified eyestalk")]);
    expect(checksOf(report)).toEqual(['banned-noun']);
    expect(report.failures[0].detail.toLowerCase()).toContain('beholder');
  });

  it('matches space-separated PI names written with hyphens', () => {
    expect(checksOf(run('treasure', [treasure('the sigil of a mind-flayer cult')]))).toEqual(['banned-noun']);
  });

  it('matches hyphenated PI names written with spaces', () => {
    expect(checksOf(run('treasure', [treasure('a carved yuan ti fetish of green stone')]))).toEqual(['banned-noun']);
  });

  it('does not flag a partial word of a multi-word PI name', () => {
    expect(run('treasure', [treasure('a slab of umber-tinted marble')]).failures).toEqual([]);
  });
});

// ─── PRODUCT_IDENTITY_MONSTERS list hygiene + licensing cross-check ──

describe('PRODUCT_IDENTITY_MONSTERS', () => {
  it('entries are lowercase, trimmed, non-empty, and unique', () => {
    expect(PRODUCT_IDENTITY_MONSTERS.length).toBeGreaterThan(0);
    for (const entry of PRODUCT_IDENTITY_MONSTERS) {
      expect(entry).toBe(entry.trim());
      expect(entry).toBe(entry.toLowerCase());
      expect(entry.length).toBeGreaterThan(0);
    }
    expect(new Set(PRODUCT_IDENTITY_MONSTERS).size).toBe(PRODUCT_IDENTITY_MONSTERS.length);
  });

  it('covers the well-known Product Identity monster family', () => {
    // Mix of names from the v3.5 SRD "Legal Information" PI designation
    // and the list's two conservative additions (kuo-toa, slaad) — see
    // the PRODUCT_IDENTITY_MONSTERS doc comment for the distinction.
    for (const name of [
      'beholder',
      'carrion crawler',
      'displacer beast',
      'githyanki',
      'githzerai',
      'illithid',
      'kuo-toa',
      'mind flayer',
      'slaad',
      'umber hulk',
      'yuan-ti',
    ]) {
      expect(PRODUCT_IDENTITY_MONSTERS).toContain(name);
    }
  });

  it('does not overlap BANNED_PROPER_NOUNS (single source per term)', () => {
    const banned = new Set(BANNED_PROPER_NOUNS);
    for (const entry of PRODUCT_IDENTITY_MONSTERS) {
      expect(banned.has(entry), `${entry} already in BANNED_PROPER_NOUNS`).toBe(false);
    }
  });

  it('no entry collides with an SRD monster name from the generated bestiary', () => {
    // Licensing safety of the ban list itself: banning a name the SRD
    // 5.2.1 bestiary legally ships would reject legal content.
    expect(ALL_MONSTERS.length).toBeGreaterThan(100); // the real bestiary loaded
    const srdNames = new Set(ALL_MONSTERS.map((monster) => monster.name.toLowerCase()));
    for (const entry of PRODUCT_IDENTITY_MONSTERS) {
      expect(srdNames.has(entry), `${entry} is an SRD monster name`).toBe(false);
    }
  });
});
