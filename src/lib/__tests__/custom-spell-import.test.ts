import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/spells-xphb-sample.json';
import { parseCustomSpellJson } from '@/lib/custom-spell-import';
import { mergeSpells } from '@/lib/spell-merge';
import { validateSpell } from '@/lib/validate-spell';
import type { Spell } from '@/data/spells';

const FIXTURE_TEXT = JSON.stringify(fixture);
const NO_IDS: ReadonlySet<string> = new Set();

const VALID_NATIVE: Spell = {
  id: 'homebrew-bolt',
  name: 'Homebrew Bolt',
  level: 1,
  school: 'Evocation',
  castingTime: 'Action',
  range: '60 ft',
  components: 'V, S',
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  effectSummary: '2d6 lightning damage.',
  classes: ['Wizard'],
  description: 'A homebrew bolt of lightning arcs toward the target.',
  source: 'My Campaign',
};

describe('parseCustomSpellJson — 5etools format', () => {
  it('imports a 5etools spell file with custom- prefixed ids and Custom source', () => {
    const result = parseCustomSpellJson(FIXTURE_TEXT, NO_IDS);
    expect(result.format).toBe('5etools');
    expect(result.errors).toHaveLength(0);
    expect(result.imported.length).toBeGreaterThan(0);
    for (const spell of result.imported) {
      expect(spell.id.startsWith('custom-')).toBe(true);
      expect(spell.source).toBe('Custom');
    }
  });

  it('applies SRD renames and leaves classes empty without a class source', () => {
    const result = parseCustomSpellJson(FIXTURE_TEXT, NO_IDS);
    const hand = result.imported.find((s) => s.name === 'Arcane Hand');
    expect(hand?.id).toBe('custom-arcane-hand');
    expect(hand?.classes).toEqual([]);
  });

  it('reads embedded homebrew class lists (classes.fromClassList)', () => {
    const entry = {
      ...(fixture as { spell: Array<Record<string, unknown>> }).spell.find((s) => s.name === 'Fire Bolt'),
      classes: { fromClassList: [{ name: 'Wizard', source: 'HB' }, { name: 'Sorcerer', source: 'HB' }] },
    };
    const result = parseCustomSpellJson(JSON.stringify({ spell: [entry] }), NO_IDS);
    expect(result.imported[0].classes).toEqual(['Sorcerer', 'Wizard']);
  });

  it('suffixes ids that collide with existing spells', () => {
    const result = parseCustomSpellJson(FIXTURE_TEXT, new Set(['custom-fire-bolt']));
    const fireBolt = result.imported.find((s) => s.name === 'Fire Bolt');
    expect(fireBolt?.id).toBe('custom-fire-bolt-2');
  });
});

describe('parseCustomSpellJson — native format', () => {
  it('round-trips an Encounterizer export', () => {
    const result = parseCustomSpellJson(JSON.stringify({ spells: [VALID_NATIVE] }), NO_IDS);
    expect(result.format).toBe('native');
    expect(result.errors).toHaveLength(0);
    expect(result.imported[0].id).toBe('custom-homebrew-bolt');
    expect(result.imported[0].source).toBe('Custom');
  });

  it('accepts a bare top-level array', () => {
    const result = parseCustomSpellJson(JSON.stringify([VALID_NATIVE]), NO_IDS);
    expect(result.format).toBe('native');
    expect(result.imported).toHaveLength(1);
  });

  it('reports invalid entries per index without losing valid rows', () => {
    const bad = { ...VALID_NATIVE, id: undefined, level: 11, school: 'Chronomancy' };
    const result = parseCustomSpellJson(JSON.stringify([VALID_NATIVE, bad]), NO_IDS);
    expect(result.imported).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].messages.join(' ')).toContain('level');
  });
});

describe('parseCustomSpellJson — error handling', () => {
  it('rejects invalid JSON', () => {
    const result = parseCustomSpellJson('not json {', NO_IDS);
    expect(result.format).toBe('unknown');
    expect(result.errors[0].messages[0]).toContain('not valid JSON');
  });

  it('rejects unrecognized shapes', () => {
    const result = parseCustomSpellJson(JSON.stringify({ monster: [] }), NO_IDS);
    expect(result.format).toBe('unknown');
    expect(result.imported).toHaveLength(0);
  });
});

describe('validateSpell', () => {
  it('accepts a well-formed spell', () => {
    expect(validateSpell(VALID_NATIVE).ok).toBe(true);
  });

  it('collects all problems at once', () => {
    const result = validateSpell({ name: 42, level: 'high', concentration: 'yes' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(3);
    }
  });
});

describe('mergeSpells', () => {
  const builtIn: Spell[] = [
    { ...VALID_NATIVE, id: 'fireball', name: 'Fireball', level: 3 },
    { ...VALID_NATIVE, id: 'aid', name: 'Aid', level: 2 },
  ];

  it('returns built-ins untouched when no customs exist', () => {
    expect(mergeSpells(builtIn, [])).toBe(builtIn);
  });

  it('appends customs sorted by level then name', () => {
    const merged = mergeSpells(builtIn, [
      { ...VALID_NATIVE, id: 'custom-z', name: 'Zap', level: 0 },
      { ...VALID_NATIVE, id: 'custom-a', name: 'Aura', level: 0 },
    ]);
    expect(merged.map((s) => s.name)).toEqual(['Fireball', 'Aid', 'Aura', 'Zap']);
  });

  it('lets a custom spell override a built-in by id', () => {
    const merged = mergeSpells(builtIn, [
      { ...VALID_NATIVE, id: 'fireball', name: 'Fireball (House Rule)', level: 3 },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.id === 'fireball')?.name).toBe('Fireball (House Rule)');
  });
});
