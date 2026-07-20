import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/bestiary-xmm-sample.json';
import {
  convert5eToolsMonster,
  entriesToText,
  import5eToolsBestiary,
  slugifyMonsterName,
  stripTags,
} from '@/lib/import-5etools';
import { CR_XP } from '@/lib/types';
import type { FiveEToolsMonster } from '@/lib/types';

const MONSTERS = (fixture as unknown as { monster: FiveEToolsMonster[] }).monster;

function fixtureMonster(name: string): FiveEToolsMonster {
  const found = MONSTERS.find((m) => m.name === name);
  if (!found) throw new Error(`fixture missing ${name}`);
  return found;
}

describe('stripTags', () => {
  it('renders the 2024 attack notation as prose', () => {
    expect(
      stripTags('{@atkr m} {@hit 4}, reach 5 ft. {@h}5 ({@damage 1d6 + 2}) Slashing damage.'),
    ).toBe('Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.');
  });

  it('renders saves, DCs, and outcome labels', () => {
    expect(stripTags('{@actSave dex} {@dc 18}. {@actSaveFail} 49 ({@damage 11d8}) Acid damage. {@actSaveSuccess} Half damage.'))
      .toBe('Dexterity Saving Throw: DC 18. Failure: 49 (11d8) Acid damage. Success: Half damage.');
  });

  it('renders link-like tags via their display name', () => {
    expect(stripTags('has {@variantrule Advantage|XPHB} against {@condition Prone|XPHB} targets'))
      .toBe('has Advantage against Prone targets');
    expect(stripTags('{@creature goblin|XMM|a goblin warrior} appears')).toBe('a goblin warrior appears');
  });

  it('renders recharge notation', () => {
    expect(stripTags('Acid Breath {@recharge 5}')).toBe('Acid Breath (Recharge 5–6)');
    expect(stripTags('Web {@recharge}')).toBe('Web (Recharge 6)');
  });

  it('leaves no tag residue on any fixture monster', () => {
    for (const raw of MONSTERS) {
      const converted = convert5eToolsMonster(raw);
      const allText = JSON.stringify(converted);
      expect(allText, `${raw.name} has {@ residue`).not.toContain('{@');
    }
  });
});

describe('entriesToText', () => {
  it('flattens list entries instead of emitting [object Object]', () => {
    const text = entriesToText([
      'Intro line.',
      { type: 'list', items: [{ type: 'item', name: 'Bite', entries: ['Chomp.'] }, 'Plain item'] },
    ]);
    expect(text).toBe('Intro line.\nBite: Chomp.\nPlain item');
    expect(text).not.toContain('[object Object]');
  });
});

describe('convert5eToolsMonster on verbatim SRD 5.2.1 entries', () => {
  it('converts the Goblin Warrior attack lines (2024 tag format)', () => {
    const goblin = convert5eToolsMonster(fixtureMonster('Goblin Warrior'));

    expect(goblin.id).toBe('goblin-warrior');
    expect(goblin.type).toBe('Fey'); // 2024 goblins are Fey
    expect(goblin.subtype).toBe('goblinoid');
    expect(goblin.challengeRating).toBe(0.25);
    expect(goblin.xp).toBe(CR_XP[0.25]);
    expect(goblin.skills).toEqual({ Stealth: 6 });

    const scimitar = goblin.actions.find((a) => a.name === 'Scimitar');
    expect(scimitar).toBeDefined();
    expect(scimitar!.attackBonus).toBe(4);
    expect(scimitar!.attackDelivery).toBe('Melee');
    expect(scimitar!.reach).toBe(5);
    expect(scimitar!.damageDice).toBe('1d6+2');
    expect(scimitar!.damageAvg).toBe(5);
    expect(scimitar!.damageTypes).toContain('Slashing');
    expect(scimitar!.description).toContain('Melee Attack Roll: +4');

    const shortbow = goblin.actions.find((a) => a.name === 'Shortbow');
    expect(shortbow!.attackDelivery).toBe('Ranged');
    expect(shortbow!.range).toBe(80);
    expect(shortbow!.longRange).toBe(320);
    expect(goblin.attackDeliveryModes.sort()).toEqual(['Melee', 'Ranged']);
  });

  it('reads lair status from the 2024 xpLair field and parses saves', () => {
    const aboleth = convert5eToolsMonster(fixtureMonster('Aboleth'));
    expect(aboleth.challengeRating).toBe(10);
    expect(aboleth.hasLair).toBe(true);
    expect(aboleth.savingThrows).toEqual({ dex: 3, con: 6, int: 8, wis: 6 });
    expect(aboleth.isLegendary).toBe(true);
    expect(aboleth.legendary?.actions.length).toBeGreaterThan(0);
  });

  it('parses the structured 2024 spellcasting block', () => {
    const dragon = convert5eToolsMonster(fixtureMonster('Adult Black Dragon'));
    expect(dragon.hasSpellcasting).toBe(true);
    expect(dragon.spellcasting).toBeDefined();
    expect(dragon.spellcasting!.ability).toBe('cha');
    expect(dragon.spellcasting!.dc).toBe(17);
    expect(dragon.spellcasting!.attackBonus).toBe(9);
    expect(dragon.spellcasting!.atWill).toContain('Detect Magic');
    expect(dragon.spellcasting!.perDay?.['1']).toContain('Speak with Dead');
    expect(dragon.hasLair).toBe(true);
  });

  it('flattens structured entries without residue (Gibbering Mouther)', () => {
    const mouther = convert5eToolsMonster(fixtureMonster('Gibbering Mouther'));
    const text = JSON.stringify(mouther);
    expect(text).not.toContain('[object Object]');
    expect(mouther.actions.length).toBeGreaterThan(0);
  });

  it('handles CR 0 creatures', () => {
    const frog = convert5eToolsMonster(fixtureMonster('Frog'));
    expect(frog.challengeRating).toBe(0);
    expect(frog.xp).toBe(CR_XP[0]);
    expect(frog.proficiencyBonus).toBe(2);
  });

  it('preserves flexible sizes and uses the larger size as the default', () => {
    const priest = convert5eToolsMonster({
      ...fixtureMonster('Frog'),
      name: 'Priest',
      size: ['S', 'M'],
    });

    expect(priest.size).toBe('Medium');
    expect(priest.sizeOptions).toEqual(['Medium', 'Small']);
  });

  it('maps compound planar environments and "any"', () => {
    const balor = convert5eToolsMonster(fixtureMonster('Balor'));
    expect(balor.environments).toEqual(['Planar']);

    const elemental = convert5eToolsMonster(fixtureMonster('Air Elemental'));
    expect(elemental.environments.sort()).toEqual(['Desert', 'Mountain', 'Planar']);

    const halfDragon = convert5eToolsMonster(fixtureMonster('Half-Dragon'));
    expect(halfDragon.environments).toEqual(['Any']);
  });

  it('tolerates object items in resistance lists ({special: ...})', () => {
    const halfDragon = convert5eToolsMonster(fixtureMonster('Half-Dragon'));
    expect(Array.isArray(halfDragon.damageResistances)).toBe(true);
  });

  it('populates derived filter fields on every fixture monster', () => {
    for (const raw of MONSTERS) {
      const m = convert5eToolsMonster(raw);
      expect(m.movementModes.length, `${m.name} movementModes`).toBeGreaterThan(0);
      expect(m.actions.length, `${m.name} actions`).toBeGreaterThan(0);
      expect(m.xp, `${m.name} xp`).toBe(CR_XP[m.challengeRating]);
    }
  });
});

describe('ConvertOptions', () => {
  it('applies idPrefix and forceSource', () => {
    const goblin = convert5eToolsMonster(fixtureMonster('Goblin Warrior'), {
      idPrefix: 'custom-',
      forceSource: 'Custom',
    });
    expect(goblin.id).toBe('custom-goblin-warrior');
    expect(goblin.source).toBe('Custom');
  });

  it('uses an srd52 rename string as the monster name', () => {
    const renamed = convert5eToolsMonster({
      ...fixtureMonster('Frog'),
      srd52: 'Common Frog',
    });
    expect(renamed.name).toBe('Common Frog');
    expect(renamed.id).toBe('common-frog');
  });
});

describe('slugifyMonsterName', () => {
  it('produces stable kebab-case ids', () => {
    expect(slugifyMonsterName('Adult Black Dragon')).toBe('adult-black-dragon');
    expect(slugifyMonsterName("Will-o'-Wisp")).toBe('will-o-wisp');
  });
});

describe('import5eToolsBestiary', () => {
  it('converts a whole file and threads options through', () => {
    const all = import5eToolsBestiary(fixture as unknown as { monster: FiveEToolsMonster[] }, {
      forceSource: 'SRD52',
    });
    expect(all).toHaveLength(MONSTERS.length);
    expect(new Set(all.map((m) => m.source))).toEqual(new Set(['SRD52']));
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
  });
});
