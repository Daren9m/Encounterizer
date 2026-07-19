import { describe, expect, it } from 'vitest';
import { buildSimPlayer } from '@/data/class-templates';
import { importCharacterJson } from '@/lib/character-import';

describe('importCharacterJson', () => {
  it('maps a D&D Beyond export to the editable SimPlayer pipeline', () => {
    const result = importCharacterJson(JSON.stringify({
      data: {
        name: 'Mira',
        classes: [{ level: 7, definition: { name: 'Wizard' } }],
        stats: [
          { id: 1, value: 8 }, { id: 2, value: 16 }, { id: 3, value: 14 },
          { id: 4, value: 18 }, { id: 5, value: 12 }, { id: 6, value: 10 },
        ],
        baseHitPoints: 30,
        inventory: [{ equipped: true, definition: { name: 'Leather Armor', armorClass: 11, armorType: 'Light' } }],
        modifiers: { class: [{ type: 'proficiency', subType: 'wis-saving-throws' }] },
      },
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const player = buildSimPlayer(result.member, 0);
    expect(player.name).toBe('Mira');
    expect(player.templateId).toBe('wizard-evoker');
    expect(player.level).toBe(7);
    expect(player.ac).toBe(14);
    expect(player.maxHp).toBe(44);
    expect(player.saveBonuses.wis).toBe(4);
  });

  it('accepts an explicit Encounterizer combat profile without estimates', () => {
    const result = importCharacterJson(JSON.stringify({
      name: 'Thorn', className: 'Ranger', level: 9, ac: 18, maxHp: 76,
      attackBonus: 9, avgDamagePerHit: 12.5, attacksPerRound: 2,
      saveBonuses: { dex: 7, con: 4, wis: 5 },
    }));
    expect(result.ok && result.member.overrides?.avgDamagePerHit).toBe(12.5);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('fails gracefully for malformed or incomplete input', () => {
    expect(importCharacterJson('{').ok).toBe(false);
    expect(importCharacterJson('{}').ok).toBe(false);
  });
});
