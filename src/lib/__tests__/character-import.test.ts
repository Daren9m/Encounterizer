import { describe, expect, it } from 'vitest';
import { buildSimPlayer } from '@/data/class-templates';
import { importCharacterJson } from '@/lib/character-import';
import { isPartyCombatOverrides } from '@/lib/party';
import { partyMemberToFormValues, validatePartyMemberForm } from '@/lib/party-member-form';

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
      initiativeBonus: 6, passivePerception: 17,
    }));
    expect(result.ok && result.member.overrides?.avgDamagePerHit).toBe(12.5);
    expect(result.ok && result.member.initiativeBonus).toBe(6);
    expect(result.ok && result.member.passivePerception).toBe(17);
    expect(result.ok && result.warnings).toEqual([]);
  });

  it('warns when a multiclass export can only use its first class as the template', () => {
    const result = importCharacterJson(JSON.stringify({
      name: 'Veya',
      classes: [
        { level: 5, definition: { name: 'Wizard' } },
        { level: 2, definition: { name: 'Fighter' } },
      ],
      ac: 15,
      maxHp: 42,
      avgDamagePerHit: 8,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toMatchObject({ templateId: 'wizard-evoker', level: 7 });
    expect(result.warnings.some((warning) => /multiclass/i.test(warning))).toBe(true);
  });

  it('uses an honest fallback warning for an unmapped class', () => {
    const result = importCharacterJson(JSON.stringify({
      name: 'Kestrel', className: 'Blood Hunter', level: 6,
      ac: 17, maxHp: 55, avgDamagePerHit: 10,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.templateId).toBe('fighter-champion');
    expect(result.warnings.some((warning) => /not mapped/i.test(warning))).toBe(true);
  });

  it('normalizes imported fields to durable Party Library bounds', () => {
    const result = importCharacterJson(JSON.stringify({
      name: 'N'.repeat(140),
      playerName: 'P'.repeat(140),
      className: 'Wizard',
      level: 99,
      ac: 500,
      maxHp: -10,
      attackBonus: 250,
      attacksPerRound: 0,
      avgDamagePerHit: -4,
      healingPerRound: -8,
      spellDc: 300,
      avgSpellDamagePerRound: -1,
      saveBonuses: { dex: 200, con: -200, wis: 2.5 },
      initiativeBonus: 80,
      passivePerception: -5,
      notes: 'x'.repeat(2_200),
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toMatchObject({
      level: 20,
      initiativeBonus: 30,
      passivePerception: 0,
      overrides: {
        ac: 100,
        maxHp: 1,
        attackBonus: 100,
        attacksPerRound: 1,
        avgDamagePerHit: 0,
        healingPerRound: 0,
        spellDc: 100,
        avgSpellDamagePerRound: 0,
        saveBonuses: { dex: 100, con: -50, wis: 3 },
      },
    });
    expect(result.member.name).toHaveLength(120);
    expect(result.member.playerName).toHaveLength(120);
    expect(result.member.notes).toHaveLength(2_000);
    expect(isPartyCombatOverrides(result.member.overrides)).toBe(true);
    expect(validatePartyMemberForm(partyMemberToFormValues(result.member)).ok).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(5);
  });

  it('fails gracefully for malformed or incomplete input', () => {
    expect(importCharacterJson('{').ok).toBe(false);
    expect(importCharacterJson('{}').ok).toBe(false);
  });
});
