import { describe, it, expect } from 'vitest';
import { THEME_PACKS } from '../../data/noncombat-themes';
import { resolveTheme, failureText, THEME_OPTIONS, RUNE_GLYPHS } from '../noncombat/theming';
import { seededRandom } from '../random';
import type { ResolvedLevers } from '../noncombat/types';

const IDS = ['ancient-tomb', 'wild-frontier', 'city-streets', 'noble-court',
  'sacred-temple', 'arcane-sanctum', 'sea-and-shore', 'feywild-revel'];

describe('theme pack corpus lint', () => {
  it('has exactly the 8 spec packs', () => {
    expect(THEME_PACKS.map(p => p.id).sort()).toEqual([...IDS].sort());
  });
  it.each(THEME_PACKS.map(p => [p.id, p] as const))('%s meets minimum pool sizes', (_id, p) => {
    expect(p.descriptors.length).toBeGreaterThanOrEqual(6);
    expect(p.materials.length).toBeGreaterThanOrEqual(6);
    expect(p.sensory.length).toBeGreaterThanOrEqual(6);
    expect(p.symbolSets.length).toBeGreaterThanOrEqual(2);
    for (const set of p.symbolSets) {
      expect(set.length).toBeGreaterThanOrEqual(5);
      // Grid handouts abbreviate symbols to 2-char labels — prefixes must
      // be distinct within a set or the printed grid becomes ambiguous.
      expect(new Set(set.map(s => s.slice(0, 2))).size, `${p.id}: 2-char prefixes collide`).toBe(set.length);
    }
    expect(p.phrases.length).toBeGreaterThanOrEqual(8);
    for (const ph of p.phrases) expect(ph).toMatch(/^[A-Z ]{20,40}$/);
    expect(p.cast.length).toBeGreaterThanOrEqual(6);
    expect(p.rewards.length).toBeGreaterThanOrEqual(6);
    expect(p.consequences.length).toBeGreaterThanOrEqual(6);
    expect(p.creatures.length).toBeGreaterThanOrEqual(4);
  });
});

describe('resolveTheme', () => {
  it('returns the named pack for explicit ids without consuming rng', () => {
    let draws = 0;
    const countingRng = () => { draws++; return 0.5; };
    const pack = resolveTheme('noble-court', countingRng);
    expect(pack.id).toBe('noble-court');
    expect(draws).toBe(0);
  });
  it("'any' is a deterministic seeded draw", () => {
    const a = resolveTheme('any', seededRandom(42));
    const b = resolveTheme('any', seededRandom(42));
    expect(a.id).toBe(b.id);
  });
});

describe('failureText tone contract (spec §6.6)', () => {
  const base = (tone: ResolvedLevers['tone']): ResolvedLevers => ({
    partyLevel: 5, partySize: 4, difficulty: 'Hard',
    theme: THEME_PACKS[0], tone, timeBudget: 'standard', seed: 1,
  });
  it('whimsical failure text carries no damage dice', () => {
    const t = failureText(base('whimsical'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.' });
    expect(t).not.toMatch(/\d+d\d+/);
  });
  it('standard emits severity damage; grim adds a lasting-cost rider', () => {
    const std = failureText(base('standard'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.', save: 'DEX' });
    expect(std).toMatch(/10d10/); // level 5, Hard, climactic = deadly column
    const grim = failureText(base('grim'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.', save: 'DEX' });
    expect(grim).toMatch(/10d10/);
    expect(grim.length).toBeGreaterThan(std.length); // rider appended
  });
});

describe('UI option lists + runes', () => {
  it('THEME_OPTIONS = any + 8 packs; 24 futhark glyphs', () => {
    expect(THEME_OPTIONS).toHaveLength(9);
    expect(THEME_OPTIONS[0].value).toBe('any');
    expect(RUNE_GLYPHS).toHaveLength(24);
    for (const g of RUNE_GLYPHS) {
      const cp = g.codePointAt(0)!;
      expect(cp).toBeGreaterThanOrEqual(0x16a0);
      expect(cp).toBeLessThanOrEqual(0x16f8);
    }
  });
});
