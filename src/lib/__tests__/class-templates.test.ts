import { describe, expect, it } from 'vitest';
import {
  buildSimPlayer,
  CLASS_TEMPLATES,
  computeHp,
  defaultPartyConfig,
  tierForLevel,
  type LevelTier,
} from '@/data/class-templates';

const TIERS: LevelTier[] = ['1-4', '5-10', '11-16', '17-20'];

describe('CLASS_TEMPLATES', () => {
  it('covers all fifteen classes from the spec', () => {
    expect(CLASS_TEMPLATES).toHaveLength(15);
    expect(new Set(CLASS_TEMPLATES.map((t) => t.id)).size).toBe(15);
  });

  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s has monotonically non-decreasing combat stats across tiers',
    (_name, template) => {
      for (let i = 1; i < TIERS.length; i++) {
        const prev = template.tiers[TIERS[i - 1]];
        const curr = template.tiers[TIERS[i]];
        expect(curr.ac).toBeGreaterThanOrEqual(prev.ac);
        expect(curr.attackBonus).toBeGreaterThan(prev.attackBonus);
        expect(curr.attacksPerRound).toBeGreaterThanOrEqual(prev.attacksPerRound);
        expect(curr.avgDamagePerHit).toBeGreaterThanOrEqual(prev.avgDamagePerHit);
        expect(curr.saveBonuses.dex + curr.saveBonuses.con + curr.saveBonuses.wis)
          .toBeGreaterThanOrEqual(prev.saveBonuses.dex + prev.saveBonuses.con + prev.saveBonuses.wis);
      }
    },
  );

  it.each(CLASS_TEMPLATES.map((t) => [t.name, t] as const))(
    '%s expected DPR stays inside a sane band per tier',
    (_name, template) => {
      // Nominal 65% hit rate, 70% average spell effect.
      const bands: Record<LevelTier, [number, number]> = {
        '1-4': [3, 30],
        '5-10': [8, 50],
        '11-16': [12, 75],
        '17-20': [15, 100],
      };
      for (const tier of TIERS) {
        const stats = template.tiers[tier];
        const dpr =
          stats.attacksPerRound * stats.avgDamagePerHit * 0.65
          + (stats.avgSpellDamagePerRound ?? 0) * 0.7
          + (stats.special?.sneakDamage ?? 0) * 0.65;
        const [min, max] = bands[tier];
        expect(dpr, `${template.id} ${tier} dpr=${dpr.toFixed(1)}`).toBeGreaterThanOrEqual(min);
        expect(dpr, `${template.id} ${tier} dpr=${dpr.toFixed(1)}`).toBeLessThanOrEqual(max);
      }
    },
  );

  it('healers heal and ragers rage', () => {
    expect(CLASS_TEMPLATES.find((t) => t.id === 'cleric-life')!.tiers['5-10'].healingPerRound).toBeGreaterThan(0);
    expect(CLASS_TEMPLATES.find((t) => t.id === 'barbarian-berserker')!.tiers['1-4'].special?.rage).toBe(true);
    expect(CLASS_TEMPLATES.find((t) => t.id === 'rogue-thief')!.tiers['5-10'].special?.evasion).toBe(true);
  });
});

describe('tierForLevel / computeHp', () => {
  it('maps levels to tiers at the boundaries', () => {
    expect(tierForLevel(1)).toBe('1-4');
    expect(tierForLevel(4)).toBe('1-4');
    expect(tierForLevel(5)).toBe('5-10');
    expect(tierForLevel(10)).toBe('5-10');
    expect(tierForLevel(11)).toBe('11-16');
    expect(tierForLevel(17)).toBe('17-20');
  });

  it('computes 2024 fixed-average HP', () => {
    // Level 1 fighter, +2 con: 10 + 2 = 12
    expect(computeHp(10, 2, 1)).toBe(12);
    // Level 8 fighter, +2 con: 12 + 7 × 8 = 68
    expect(computeHp(10, 2, 8)).toBe(68);
    // Level 8 wizard, +2 con: 8 + 7 × 6 = 50
    expect(computeHp(6, 2, 8)).toBe(50);
  });
});

describe('buildSimPlayer', () => {
  it('HP grows strictly with level for every template', () => {
    for (const template of CLASS_TEMPLATES) {
      let prev = 0;
      for (let level = 1; level <= 20; level++) {
        const player = buildSimPlayer({ name: 'T', templateId: template.id, level }, 0);
        expect(player.maxHp, `${template.id} L${level}`).toBeGreaterThan(prev);
        prev = player.maxHp;
      }
    }
  });

  it('applies overrides on top of template values', () => {
    const player = buildSimPlayer(
      { name: 'Tanky', templateId: 'wizard-evoker', level: 8, overrides: { ac: 20, maxHp: 99 } },
      0,
    );
    expect(player.ac).toBe(20);
    expect(player.maxHp).toBe(99);
    expect(player.spellDc).toBe(16); // non-overridden template value intact
  });

  it('falls back to the first template for unknown ids and clamps level', () => {
    const player = buildSimPlayer({ name: 'X', templateId: 'nope', level: 99 }, 0);
    expect(player.templateId).toBe('fighter-champion');
    expect(player.level).toBe(20);
  });
});

describe('defaultPartyConfig', () => {
  it('rotates through the classic four-role party', () => {
    const config = defaultPartyConfig(5, 3);
    expect(config).toHaveLength(5);
    expect(config.map((c) => c.templateId)).toEqual([
      'fighter-champion', 'cleric-life', 'rogue-thief', 'wizard-evoker', 'fighter-champion',
    ]);
    expect(config.every((c) => c.level === 3)).toBe(true);
  });
});
