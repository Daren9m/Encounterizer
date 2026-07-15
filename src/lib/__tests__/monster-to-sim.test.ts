import { describe, expect, it } from 'vitest';
import { ALL_MONSTERS, getMonsterByName } from '@/data';
import {
  avgDice,
  monsterToSimMonster,
  parseDice,
  parseMultiattackCount,
} from '@/lib/monster-to-sim';
import type { Monster } from '@/lib/types';

function realMonster(name: string): Monster {
  const m = getMonsterByName(name);
  if (!m) throw new Error(`bestiary missing ${name}`);
  return m;
}

describe('parseDice / avgDice', () => {
  it('parses standard dice notation', () => {
    expect(parseDice('2d10+6')).toEqual({ n: 2, d: 10, mod: 6 });
    expect(parseDice('12d8')).toEqual({ n: 12, d: 8, mod: 0 });
    expect(parseDice('2d6 + 6')).toEqual({ n: 2, d: 6, mod: 6 });
    expect(parseDice('1d4-1')).toEqual({ n: 1, d: 4, mod: -1 });
    expect(parseDice('garbage')).toBeNull();
    expect(parseDice(undefined)).toBeNull();
  });

  it('computes correct averages', () => {
    expect(avgDice({ n: 2, d: 8, mod: 4 })).toBe(13); // Ogre greatclub
    expect(avgDice({ n: 1, d: 6, mod: 2 })).toBe(5.5);
  });
});

describe('parseMultiattackCount (2024 phrasing)', () => {
  it('parses word numbers', () => {
    expect(parseMultiattackCount('The bear makes two Rend attacks.')).toBe(2);
    expect(parseMultiattackCount('The dragon makes three attacks: one with its Bite and two with its Claw.')).toBe(3);
    expect(parseMultiattackCount('It makes one Bite attack and uses Antennae twice.')).toBe(1);
  });

  it('handles the Hydra special case', () => {
    expect(parseMultiattackCount('The hydra makes as many Bite attacks as it has heads.')).toBe(5);
  });

  it('returns null for unparseable text', () => {
    expect(parseMultiattackCount('The creature does something odd.')).toBeNull();
  });
});

describe('monsterToSimMonster against the real bestiary', () => {
  it('extracts the Adult Black Dragon (multiattack, breath, legendary)', () => {
    const sim = monsterToSimMonster(realMonster('Adult Black Dragon'), 0, 1);

    expect(sim.ac).toBe(19);
    expect(sim.maxHp).toBe(195);
    const totalAttacks = sim.attacks.reduce((s, a) => s + a.count, 0);
    expect(totalAttacks).toBeGreaterThanOrEqual(2); // Rend routine
    expect(sim.attacks.every((a) => a.attackBonus > 0)).toBe(true);

    expect(sim.recharge).toBeDefined();
    expect(sim.recharge!.kind).toBe('save');
    expect(sim.recharge!.saveAbility).toBe('dex');
    expect(sim.recharge!.rechargeMin).toBe(5);
    expect(sim.recharge!.maxTargets).toBe(2);
    expect(sim.recharge!.avgDamage).toBeGreaterThan(30);

    expect(sim.legendary).toBeDefined();
    expect(sim.legendary!.perRound).toBe(3);
    expect(sim.legendary!.actions.length).toBeGreaterThan(0);

    expect(sim.saves.dex).toBe(7); // proficient save from the stat block
    expect(sim.synthesizedAttack).toBe(false);
  });

  it('resolves legendary references to main actions (Aboleth Lash)', () => {
    const sim = monsterToSimMonster(realMonster('Aboleth'), 0, 1);
    expect(sim.legendary).toBeDefined();
    const lash = sim.legendary!.actions.find((a) => a.name === 'Lash');
    expect(lash).toBeDefined();
    expect(lash!.kind).toBe('attack');
    expect(lash!.attackBonus).toBe(9); // borrowed from the Tentacle action
  });

  it('synthesizes an attack for actionless creatures (Shrieker Fungus)', () => {
    const sim = monsterToSimMonster(realMonster('Shrieker Fungus'), 0, 1);
    expect(sim.attacks.length).toBeGreaterThan(0);
    expect(sim.synthesizedAttack).toBe(true);
    expect(sim.parseWarnings.length).toBeGreaterThan(0);
  });

  it('tops up caster monsters whose damage lives in spell text (Lich)', () => {
    const sim = monsterToSimMonster(realMonster('Lich'), 0, 1);
    const dpr = sim.attacks.reduce((s, a) => s + a.count * a.avgDamage, 0);
    // CR 21 midpoint is ~150; the floor guarantees at least ~40% of it.
    expect(dpr).toBeGreaterThan(55);
  });

  it('numbers instances when count > 1', () => {
    const goblin = realMonster('Goblin Warrior');
    expect(monsterToSimMonster(goblin, 0, 3).name).toBe('Goblin Warrior #1');
    expect(monsterToSimMonster(goblin, 2, 3).id).toBe('goblin-warrior#2');
    expect(monsterToSimMonster(goblin, 0, 1).name).toBe('Goblin Warrior');
  });

  it('never throws on any bestiary monster and always yields an attack', () => {
    for (const monster of ALL_MONSTERS) {
      const sim = monsterToSimMonster(monster, 0, 1);
      expect(sim.attacks.length, monster.name).toBeGreaterThan(0);
      expect(sim.maxHp, monster.name).toBeGreaterThan(0);
      expect(Number.isFinite(sim.threat), monster.name).toBe(true);
      for (const attack of sim.attacks) {
        expect(attack.count, `${monster.name} ${attack.name}`).toBeGreaterThan(0);
        expect(attack.avgDamage, `${monster.name} ${attack.name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
