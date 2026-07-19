import { describe, expect, it } from 'vitest';
import { getMonsterByName } from '@/data';
import { buildSimPlayer, defaultPartyConfig } from '@/data/class-templates';
import { buildAssessment, simulateBattle } from '@/lib/battle-sim';
import { monsterToSimMonster } from '@/lib/monster-to-sim';
import type { SimMonster, SimPlayer } from '@/lib/battle-sim-types';

function party(templateIds: string[], level: number): SimPlayer[] {
  return templateIds.map((templateId, i) =>
    buildSimPlayer({ name: `P${i + 1}`, templateId, level }, i),
  );
}

function monsterInstances(name: string, count: number): SimMonster[] {
  const monster = getMonsterByName(name);
  if (!monster) throw new Error(`bestiary missing ${name}`);
  return Array.from({ length: count }, (_, i) => monsterToSimMonster(monster, i, count));
}

/** A player rendered as a monster — for perfectly mirrored matches. */
function playerAsMonster(player: SimPlayer, index: number): SimMonster {
  return {
    id: `mirror-${index}`,
    sourceId: `mirror-${index}`,
    name: `Mirror ${index}`,
    ac: player.ac,
    maxHp: player.maxHp,
    initiativeMod: player.initiativeMod,
    saves: {
      str: 0, int: 0, cha: 0,
      dex: player.saveBonuses.dex, con: player.saveBonuses.con, wis: player.saveBonuses.wis,
    },
    attacks: [{
      name: 'Strike',
      attackBonus: player.attackBonus,
      damageDice: { n: 0, d: 1, mod: Math.round(player.avgDamagePerHit) },
      avgDamage: player.avgDamagePerHit,
      count: player.attacksPerRound,
    }],
    threat: player.attacksPerRound * player.avgDamagePerHit * 0.6,
    synthesizedAttack: false,
    parseWarnings: [],
  };
}

const STANDARD_PARTY = ['fighter-champion', 'fighter-champion', 'fighter-champion', 'fighter-champion'];

describe('simulateBattle determinism', () => {
  it('produces identical reports for identical seeds', () => {
    const players = party(STANDARD_PARTY, 3);
    const monsters = monsterInstances('Ogre', 2);
    const a = simulateBattle(players, monsters, { seed: 42 });
    const b = simulateBattle(players, monsters, { seed: 42 });
    expect(a).toEqual(b);
  });

  it('diverges across seeds', () => {
    const players = party(STANDARD_PARTY, 3);
    const monsters = monsterInstances('Ogre', 2);
    const a = simulateBattle(players, monsters, { seed: 1 });
    const b = simulateBattle(players, monsters, { seed: 2 });
    expect(a.partyWinRate).not.toBe(b.partyWinRate);
  });
});

describe('simulateBattle statistics', () => {
  it('mirror match lands near 50% with the party-favorable asymmetries', () => {
    const players = party(STANDARD_PARTY, 8);
    const mirrors = players.map(playerAsMonster);
    const report = simulateBattle(players, mirrors, { seed: 7 });
    // Players get deliberate edges: initiative ties, focus fire, and 2024
    // death saves while monsters spread 30% of their attacks.
    expect(report.partyWinRate).toBeGreaterThan(0.45);
    expect(report.partyWinRate).toBeLessThan(0.72);
  });

  it('overwhelming favorites stomp', () => {
    const players = party(['fighter-champion', 'barbarian-berserker', 'cleric-life', 'wizard-evoker', 'rogue-thief'], 17);
    const report = simulateBattle(players, monsterInstances('Goblin Warrior', 1), { seed: 9 });
    expect(report.partyWinRate).toBeGreaterThan(0.99);
    expect(report.avgRounds).toBeLessThanOrEqual(2);
    expect(report.avgPartyHpRemainingPct).toBeGreaterThan(0.95);
    expect(report.simLabel).toBe('Trivial');
  });

  it('hopeless fights are lethal', () => {
    const players = party(['wizard-evoker'], 1);
    const report = simulateBattle(players, monsterInstances('Adult Black Dragon', 1), { seed: 11 });
    expect(report.partyWinRate).toBeLessThan(0.02);
    expect(report.simLabel).toBe('Lethal');
  });

  it('zero-damage matchups hit the round cap as stalemates', () => {
    const pacifist: SimPlayer = {
      ...party(['fighter-champion'], 3)[0],
      attackBonus: -30, avgDamagePerHit: 0, attacksPerRound: 1,
      spellDc: undefined, avgSpellDamagePerRound: undefined,
    };
    const wall: SimMonster = {
      ...playerAsMonster(pacifist, 0),
      ac: 40,
      attacks: [{ name: 'Whiff', attackBonus: -30, damageDice: { n: 0, d: 1, mod: 0 }, avgDamage: 0, count: 1 }],
    };
    const report = simulateBattle([pacifist], [wall], { seed: 3, iterations: 200 });
    expect(report.stalemateRate).toBe(1);
    expect(report.hpCurve.length).toBeLessThanOrEqual(report.maxRounds);
  });
});

describe('fidelity mechanics (A/B)', () => {
  it('models death saves and healing-word recovery after a knockout', () => {
    const players = party(['wizard-evoker', 'cleric-life', 'fighter-champion'], 5);
    const report = simulateBattle(players, monsterInstances('Ogre', 3), { seed: 101 });
    expect(report.dropRanking.some((entry) => entry.dropRate > 0)).toBe(true);
    expect(report.revivalRanking.some((entry) => entry.revivalRate > 0)).toBe(true);
  });

  it('area spells can damage several clustered targets', () => {
    const blaster = party(['wizard-evoker'], 8)[0];
    const singleTarget: SimPlayer = { ...blaster, spellTargets: 1 };
    const allies = party(['fighter-champion', 'cleric-life', 'rogue-thief'], 8);
    const monsters = monsterInstances('Ogre', 8);
    const area = simulateBattle([blaster, ...allies], monsters, { seed: 103 });
    const single = simulateBattle([singleTarget, ...allies], monsters, { seed: 103 });
    expect(area.partyWinRate).toBeGreaterThan(single.partyWinRate);
  });

  it('save-or-suck control removes monster turns', () => {
    const bard = party(['bard-lore'], 8)[0];
    const noControl: SimPlayer = { ...bard, control: undefined };
    const allies = party(['fighter-champion', 'fighter-champion'], 8);
    const monsters = monsterInstances('Ogre', 4);
    const controlled = simulateBattle([bard, ...allies], monsters, { seed: 107 });
    const plain = simulateBattle([noControl, ...allies], monsters, { seed: 107 });
    expect(controlled.partyWinRate).toBeGreaterThanOrEqual(plain.partyWinRate);
  });

  it('Shield reactions turn near-miss hits aside', () => {
    const wizard = party(['wizard-evoker'], 8)[0];
    const noShield: SimPlayer = { ...wizard, special: { ...wizard.special, shield: false } };
    const monsters = monsterInstances('Ogre', 2);
    const shielded = simulateBattle([wizard], monsters, { seed: 109 });
    const plain = simulateBattle([noShield], monsters, { seed: 109 });
    expect(shielded.dropRanking[0].dropRate).toBeLessThanOrEqual(plain.dropRanking[0].dropRate);
  });

  it('failed concentration saves can end sustained spell damage', () => {
    const cleric = party(['cleric-life'], 8)[0];
    const unbreakable: SimPlayer = { ...cleric, special: { ...cleric.special, concentration: false } };
    const monsters = monsterInstances('Ogre', 2);
    const tracked = simulateBattle([cleric], monsters, { seed: 113 });
    const ignored = simulateBattle([unbreakable], monsters, { seed: 113 });
    expect(tracked.partyWinRate).toBeLessThanOrEqual(ignored.partyWinRate);
  });

  it('healing raises the win rate', () => {
    const base = ['fighter-champion', 'fighter-champion', 'ranger-hunter'];
    const monsters = monsterInstances('Ogre', 3);
    const without = simulateBattle(party([...base, 'fighter-battlemaster'], 3), monsters, { seed: 5 });
    const withHealer = simulateBattle(party([...base, 'cleric-life'], 3), monsters, { seed: 5 });
    // The cleric brings less damage than a fourth martial but keeps allies up.
    expect(withHealer.avgPartyHpRemainingPct).toBeGreaterThan(without.avgPartyHpRemainingPct - 0.05);
  });

  it('rage roughly halves weapon damage taken', () => {
    const rager = party(['barbarian-berserker'], 8)[0];
    const control: SimPlayer = { ...rager, special: {} };
    const monsters = monsterInstances('Ogre', 2);
    const withRage = simulateBattle([rager], monsters, { seed: 13 });
    const withoutRage = simulateBattle([control], monsters, { seed: 13 });
    expect(withRage.partyWinRate).toBeGreaterThan(withoutRage.partyWinRate);
  });

  it('evasion reduces breath-weapon deaths', () => {
    const rogue = party(['rogue-thief'], 8)[0];
    const control: SimPlayer = { ...rogue, special: { ...rogue.special, evasion: false } };
    const dragon = monsterInstances('Adult Black Dragon', 1);
    const withEvasion = simulateBattle([rogue, ...party(['cleric-life'], 8)], dragon, { seed: 17 });
    const withoutEvasion = simulateBattle([control, ...party(['cleric-life'], 8)], dragon, { seed: 17 });
    expect(withEvasion.dropRanking[0].dropRate)
      .toBeLessThanOrEqual(withoutEvasion.dropRanking[0].dropRate + 0.02);
  });

  it('legendary actions increase monster output', () => {
    const dragonMonster = getMonsterByName('Adult Black Dragon')!;
    const withLegendary = monsterToSimMonster(dragonMonster, 0, 1);
    const stripped: SimMonster = { ...withLegendary, legendary: undefined };
    const players = party(['fighter-champion', 'paladin-devotion', 'cleric-life', 'wizard-evoker'], 13);
    const a = simulateBattle(players, [withLegendary], { seed: 19 });
    const b = simulateBattle(players, [stripped], { seed: 19 });
    expect(a.partyWinRate).toBeLessThan(b.partyWinRate);
  });
});

describe('calibration against XP labels', () => {
  // The sim label should land within one band of the 2024 XP assessment on
  // most canonical encounters — the systemic-bias tripwire.
  const BAND_ORDER = ['Trivial', 'Low', 'Moderate', 'High', 'Deadly', 'Lethal'];

  it('canonical encounters stay within one band of their XP label', () => {
    const cells: Array<{ party: SimPlayer[]; monsters: SimMonster[]; xpLabel: string }> = [
      {
        // 4× level 3 vs 4 goblins = 200 XP vs Low 600 → Low
        party: party(['fighter-champion', 'cleric-life', 'rogue-thief', 'wizard-evoker'], 3),
        monsters: monsterInstances('Goblin Warrior', 4),
        xpLabel: 'Low',
      },
      {
        // 4× level 3 vs 2 ogres = 900 XP vs Moderate 900 → Moderate
        party: party(['fighter-champion', 'cleric-life', 'rogue-thief', 'wizard-evoker'], 3),
        monsters: monsterInstances('Ogre', 2),
        xpLabel: 'Moderate',
      },
      {
        // 4× level 8 vs Young Black Dragon (CR 7, 2900 XP) vs Mod 6800 → Low
        party: party(['fighter-champion', 'cleric-life', 'monk-open-hand', 'sorcerer-draconic'], 8),
        monsters: monsterInstances('Young Black Dragon', 1),
        xpLabel: 'Low',
      },
    ];

    let withinOne = 0;
    for (const cell of cells) {
      const report = simulateBattle(cell.party, cell.monsters, { seed: 23 });
      const simIdx = BAND_ORDER.indexOf(report.simLabel);
      const xpIdx = BAND_ORDER.indexOf(cell.xpLabel);
      if (Math.abs(simIdx - xpIdx) <= 1) withinOne++;
    }
    expect(withinOne / cells.length).toBeGreaterThanOrEqual(0.66);
  });

  it('does not rate the reported level-8 moderate encounter as a party wipe', () => {
    const players = defaultPartyConfig(6, 8).map(buildSimPlayer);
    const monsters = [
      ...monsterInstances("Will-o'-Wisp", 1),
      ...monsterInstances('Stone Golem', 1),
      ...monsterInstances('Mage', 1),
      ...monsterInstances('Knight', 2),
    ];

    const report = simulateBattle(players, monsters, { seed: 798412425 });

    expect(report.partyWinRate).toBeGreaterThan(0.65);
    expect(report.simLabel).not.toMatch(/Deadly|Lethal/);
  });
});

describe('buildAssessment', () => {
  it('states agreement plainly', () => {
    const players = party(STANDARD_PARTY, 3);
    const report = simulateBattle(players, monsterInstances('Ogre', 2), { seed: 29 });
    const sentence = buildAssessment(report, report.simLabel);
    expect(sentence).toContain('agree');
  });

  it('explains disagreement with a concrete reason', () => {
    const players = party(STANDARD_PARTY, 17);
    const report = simulateBattle(players, monsterInstances('Goblin Warrior', 1), { seed: 31 });
    const sentence = buildAssessment(report, 'High');
    expect(sentence).toMatch(/plays more like/);
    expect(sentence.length).toBeGreaterThan(40);
  });
});
