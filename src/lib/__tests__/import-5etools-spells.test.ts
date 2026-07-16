import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/spells-xphb-sample.json';
import sourcesFixture from '../__fixtures__/spell-sources-sample.json';
import {
  convert5eToolsSpell,
  entriesToParagraphs,
  import5eToolsSpells,
  slugifySpellName,
  synthesizeEffectSummary,
} from '@/lib/import-5etools-spells';
import type { SpellConvertOptions } from '@/lib/import-5etools-spells';
import type { FiveEToolsSpell } from '@/lib/types';
import type { Spell } from '@/data/spells';

const SPELLS = (fixture as unknown as { spell: FiveEToolsSpell[] }).spell;
const SOURCES = (sourcesFixture as unknown as {
  XPHB: Record<string, { class?: Array<{ name: string; source: string }> }>;
}).XPHB;

// Same class-map construction the import script uses: keyed by the RAW
// (pre-rename) name, restricted to XPHB class lists (drops Artificer/EFA).
function buildClassMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const [name, entry] of Object.entries(SOURCES)) {
    map.set(name, (entry.class ?? []).filter((c) => c.source === 'XPHB').map((c) => c.name));
  }
  return map;
}

const OPTS: SpellConvertOptions = {
  source: 'SRD 5.2.1',
  classesByOriginalName: buildClassMap(),
};

function convert(name: string, opts: SpellConvertOptions = OPTS): Spell {
  const raw = SPELLS.find((s) => s.name === name);
  if (!raw) throw new Error(`fixture missing ${name}`);
  return convert5eToolsSpell(raw, opts);
}

describe('convert5eToolsSpell field mapping', () => {
  it('maps school codes, casting time, and point ranges', () => {
    const fireBolt = convert('Fire Bolt');
    expect(fireBolt.school).toBe('Evocation');
    expect(fireBolt.castingTime).toBe('Action');
    expect(fireBolt.range).toBe('120 ft');
    expect(fireBolt.level).toBe(0);
    expect(fireBolt.components).toBe('V, S');
    expect(fireBolt.duration).toBe('Instantaneous');
    expect(fireBolt.attackType).toBe('ranged');
    expect(fireBolt.damageType).toBe('Fire');
    expect(fireBolt.source).toBe('SRD 5.2.1');
  });

  it('applies the SRD rename and slugs the shipped name', () => {
    const hand = convert("Bigby's Hand");
    expect(hand.name).toBe('Arcane Hand');
    expect(hand.id).toBe('arcane-hand');
    // classes resolve via the raw pre-rename name
    expect(hand.classes).toEqual(['Sorcerer', 'Wizard']);
  });

  it('drops non-XPHB class list entries (Artificer via EFA)', () => {
    expect(convert('Fire Bolt').classes).toEqual(['Sorcerer', 'Wizard']);
    expect(convert('Revivify').classes).toEqual(['Cleric', 'Druid', 'Paladin', 'Ranger']);
  });

  it('surfaces the reaction trigger as the first description paragraph', () => {
    const shield = convert('Shield');
    expect(shield.castingTime).toBe('Reaction');
    expect(shield.description.split('\n\n')[0]).toBe(
      'Trigger: when you are hit by an attack roll or targeted by the Magic Missile spell',
    );
    expect(shield.duration).toBe('1 round');
  });

  it('formats object-material components with their cost text', () => {
    expect(convert('Revivify').components).toBe('V, S, M (a diamond worth 300+ GP, which the spell consumes)');
    expect(convert('Revivify').range).toBe('Touch');
  });

  it('converts shape ranges to Self + area', () => {
    const guardians = convert('Spirit Guardians');
    expect(guardians.range).toBe('Self');
    expect(guardians.area).toBe('15-ft emanation');
    expect(guardians.concentration).toBe(true);
    expect(guardians.duration).toBe('10 minutes');
    expect(guardians.damageType).toBe('Necrotic, Radiant');
    expect(guardians.saveType).toBe('WIS');
  });

  it('derives point-range areas from the opening text when tagged as AoE', () => {
    expect(convert('Fireball').area).toBe('20-ft radius sphere');
  });

  it('formats multi-save spells with or-joins', () => {
    expect(convert('Earthquake').saveType).toBe('CON or DEX');
    expect(convert("Bigby's Hand").saveType).toBe('DEX or STR');
  });

  it('maps permanent-until-dispelled durations and ritual metadata', () => {
    expect(convert('Continual Flame').duration).toBe('Until dispelled');
    const detect = convert('Detect Magic');
    expect(detect.ritual).toBe(true);
    expect(detect.range).toBe('Self');
    expect(detect.area).toBe('30-ft sphere');
  });

  it('extracts upcast text for both slot scaling and cantrip upgrades', () => {
    expect(convert('Fireball').upcast).toBe(
      'The damage increases by 1d6 for each spell slot level above 3.',
    );
    expect(convert('Fire Bolt').upcast).toBe(
      'The damage increases by 1d10 when you reach levels 5 (2d10), 11 (3d10), and 17 (4d10).',
    );
  });

  it('leaves no tag residue or unflattened objects in any fixture spell', () => {
    for (const raw of SPELLS) {
      const spell = convert5eToolsSpell(raw, OPTS);
      const serialized = JSON.stringify(spell);
      expect(serialized, `${spell.name} has tag residue`).not.toContain('{@');
      expect(serialized, `${spell.name} has unflattened entries`).not.toContain('[object Object]');
      expect(spell.description.length).toBeGreaterThan(80);
      expect(spell.effectSummary.length).toBeGreaterThan(0);
    }
  });
});

describe('entriesToParagraphs', () => {
  it('flattens 2-column roll tables into label: value lines', () => {
    const confusion = convert('Confusion');
    expect(confusion.description).toContain('1d10 | Behavior for the Turn');
    expect(confusion.description).toContain("1: The target doesn't take an action");
    expect(confusion.description).toContain("2-6: The target doesn't move or take actions.");
  });

  it('flattens named list items into dash lines', () => {
    const command = convert('Command');
    expect(command.description).toContain('- Approach: The target moves toward you');
    expect(command.description).toContain('- Drop: The target drops whatever it is holding');
  });

  it('keeps plain strings as separate paragraphs', () => {
    const paragraphs = entriesToParagraphs(['First paragraph.', 'Second paragraph.']);
    expect(paragraphs).toEqual(['First paragraph.', 'Second paragraph.']);
  });
});

describe('effectSummary layering', () => {
  it('prefers a curated override when present', () => {
    const spell = convert('Fireball', {
      ...OPTS,
      summaryOverrides: { fireball: 'CURATED SUMMARY' },
    });
    expect(spell.effectSummary).toBe('CURATED SUMMARY');
  });

  it('synthesizes a mechanics-first line for damage spells', () => {
    const fireball = convert('Fireball');
    expect(fireball.effectSummary).toBe('8d6 Fire damage (DEX save half) in 20-ft radius sphere.');
  });

  it('adds attack, condition, concentration, and cantrip scaling clauses', () => {
    const fireBolt = convert('Fire Bolt');
    expect(fireBolt.effectSummary).toBe(
      '1d10 Fire damage (ranged spell attack). Scales: 2d10 at 5th, 3d10 at 11th, 4d10 at 17th.',
    );
    const earthquake = convert('Earthquake');
    expect(earthquake.effectSummary).toContain('Bludgeoning damage');
    expect(earthquake.effectSummary).toContain('Inflicts Prone.');
    expect(earthquake.effectSummary).toContain('Concentration.');
  });

  it('falls back to the first sentence for utility spells, skipping the trigger line', () => {
    const shield = convert('Shield');
    expect(shield.effectSummary.startsWith('Trigger:')).toBe(false);
    expect(shield.effectSummary).toContain('An imperceptible barrier');
    const detect = convert('Detect Magic');
    expect(detect.effectSummary).toMatch(/^For the duration/);
  });

  it('caps generated summaries at 180 characters', () => {
    for (const raw of SPELLS) {
      const spell = convert5eToolsSpell(raw, OPTS);
      expect(spell.effectSummary.length, spell.name).toBeLessThanOrEqual(180);
    }
  });

  it('returns empty string when no structured mechanics exist', () => {
    const raw = SPELLS.find((s) => s.name === 'Prestidigitation')!;
    expect(synthesizeEffectSummary(raw, { concentration: false }, 'Text.')).toBe('');
  });
});

describe('import5eToolsSpells and slugifySpellName', () => {
  it('converts a whole file worth of spells', () => {
    const spells = import5eToolsSpells({ spell: SPELLS }, OPTS);
    expect(spells).toHaveLength(SPELLS.length);
    const ids = new Set(spells.map((s) => s.id));
    expect(ids.size).toBe(spells.length);
  });

  it('produces the same slugs the legacy hand-written data used', () => {
    expect(slugifySpellName('Fire Bolt')).toBe('fire-bolt');
    expect(slugifySpellName('Spirit Guardians')).toBe('spirit-guardians');
    expect(slugifySpellName("Bigby's Hand")).toBe('bigby-s-hand');
  });
});
