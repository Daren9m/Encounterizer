import { describe, expect, it } from 'vitest';
import { parseCustomMonsterJson } from '@/lib/custom-monster-import';
import { mergeMonsters } from '@/lib/monster-merge';
import { validateMonster } from '@/lib/validate-monster';
import { makeMonster } from './test-helpers';

const NO_IDS = new Set<string>();

describe('validateMonster', () => {
  it('accepts a minimal valid monster and fills defaults', () => {
    const result = validateMonster({
      name: 'Bob the Ogre',
      challengeRating: 2,
      hitPoints: 59,
      armor: { ac: 11 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.monster.id).toBe('bob-the-ogre');
    expect(result.monster.xp).toBe(450); // derived from CR 2
    expect(result.monster.proficiencyBonus).toBe(2);
    expect(result.monster.source).toBe('Custom');
    expect(result.monster.size).toBe('Medium');
    expect(result.monster.movementModes).toContain('Walk');
  });

  it('reports each hard-requirement failure', () => {
    const result = validateMonster({ name: '', challengeRating: 99, hitPoints: -5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/name/);
    expect(result.errors.join(' ')).toMatch(/challengeRating/);
    expect(result.errors.join(' ')).toMatch(/hitPoints/);
    expect(result.errors.join(' ')).toMatch(/armor/);
  });

  it('filters invalid enum values instead of failing', () => {
    const result = validateMonster({
      name: 'Weirdo',
      challengeRating: 1,
      hitPoints: 10,
      armor: { ac: 12 },
      size: 'Big', // invalid
      environments: ['Forest', 'Cyberspace'], // one invalid
      damageResistances: ['Fire', 'Sarcasm'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.monster.size).toBe('Medium');
    expect(result.monster.environments).toEqual(['Forest']);
    expect(result.monster.damageResistances).toEqual(['Fire']);
  });

  it('preserves multiple legal sizes', () => {
    const result = validateMonster({
      name: 'Flexible Humanoid',
      challengeRating: 1,
      hitPoints: 10,
      armor: { ac: 12 },
      size: 'Medium',
      sizeOptions: ['Medium', 'Small'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.monster.size).toBe('Medium');
    expect(result.monster.sizeOptions).toEqual(['Medium', 'Small']);
  });

  it('rejects non-objects', () => {
    expect(validateMonster('a string').ok).toBe(false);
    expect(validateMonster(null).ok).toBe(false);
    expect(validateMonster(42).ok).toBe(false);
  });
});

describe('parseCustomMonsterJson', () => {
  it('rejects invalid JSON with a readable error', () => {
    const result = parseCustomMonsterJson('{not json', NO_IDS);
    expect(result.format).toBe('unknown');
    expect(result.imported).toHaveLength(0);
    expect(result.errors[0].messages[0]).toMatch(/not valid JSON/);
  });

  it('rejects unrecognized shapes', () => {
    const result = parseCustomMonsterJson('{"foo": 1}', NO_IDS);
    expect(result.format).toBe('unknown');
    expect(result.errors[0].messages[0]).toMatch(/unrecognized JSON shape/);
  });

  it('imports a native top-level array', () => {
    const text = JSON.stringify([makeMonster({ id: 'my-guy', name: 'My Guy' })]);
    const result = parseCustomMonsterJson(text, NO_IDS);
    expect(result.format).toBe('native');
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0].id).toBe('custom-my-guy'); // prefix enforced
    expect(result.imported[0].source).toBe('Custom');
  });

  it('imports the native {monsters: []} wrapper (export round trip)', () => {
    const text = JSON.stringify({ monsters: [makeMonster({ name: 'Round Tripper' })] });
    const result = parseCustomMonsterJson(text, NO_IDS);
    expect(result.format).toBe('native');
    expect(result.imported).toHaveLength(1);
    expect(result.imported[0].name).toBe('Round Tripper');
  });

  it('detects and converts 5etools format with custom- ids', () => {
    const fiveETools = {
      monster: [
        {
          name: 'Test Wyrmling',
          source: 'XMM',
          size: ['M'],
          type: 'dragon',
          alignment: ['L', 'E'],
          ac: [17],
          hp: { average: 33, formula: '6d8 + 6' },
          speed: { walk: 30, fly: 60 },
          str: 15, dex: 14, con: 13, int: 10, wis: 11, cha: 13,
          cr: '2',
          action: [
            {
              name: 'Bite',
              entries: ['{@atkr m} {@hit 4}, reach 5 ft. {@h}7 ({@damage 1d10 + 2}) Piercing damage.'],
            },
          ],
          environment: ['mountain'],
        },
      ],
    };
    const result = parseCustomMonsterJson(JSON.stringify(fiveETools), NO_IDS);
    expect(result.format).toBe('5etools');
    expect(result.errors).toHaveLength(0);
    expect(result.imported).toHaveLength(1);
    const wyrmling = result.imported[0];
    expect(wyrmling.id).toBe('custom-test-wyrmling');
    expect(wyrmling.source).toBe('Custom');
    expect(wyrmling.actions[0].attackBonus).toBe(4);
    expect(wyrmling.actions[0].description).toContain('Melee Attack Roll: +4');
    expect(wyrmling.xp).toBe(450);
  });

  it('imports valid entries while reporting invalid ones with indexes', () => {
    const text = JSON.stringify([
      makeMonster({ name: 'Good One' }),
      { name: 'Bad One' }, // missing CR/HP/AC
      makeMonster({ name: 'Also Good' }),
    ]);
    const result = parseCustomMonsterJson(text, NO_IDS);
    expect(result.imported.map((m) => m.name)).toEqual(['Good One', 'Also Good']);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].index).toBe(1);
    expect(result.errors[0].name).toBe('Bad One');
    expect(result.errors[0].messages.length).toBeGreaterThan(0);
  });

  it('suffixes colliding ids against existing and within the batch', () => {
    const existing = new Set(['custom-goblin']);
    const text = JSON.stringify([
      makeMonster({ id: 'goblin', name: 'Goblin A' }),
      makeMonster({ id: 'goblin', name: 'Goblin B' }),
    ]);
    const result = parseCustomMonsterJson(text, existing);
    expect(result.imported.map((m) => m.id)).toEqual(['custom-goblin-2', 'custom-goblin-3']);
  });
});

describe('mergeMonsters', () => {
  const builtIn = [
    makeMonster({ id: 'aboleth', name: 'Aboleth', challengeRating: 10 }),
    makeMonster({ id: 'zombie', name: 'Zombie', challengeRating: 0.25 }),
  ];

  it('returns built-ins untouched when no customs exist', () => {
    expect(mergeMonsters(builtIn, [])).toBe(builtIn);
  });

  it('appends customs sorted by CR then name', () => {
    const customs = [
      makeMonster({ id: 'custom-b', name: 'B Monster', challengeRating: 5 }),
      makeMonster({ id: 'custom-a', name: 'A Monster', challengeRating: 5 }),
      makeMonster({ id: 'custom-weak', name: 'Weakling', challengeRating: 1 }),
    ];
    const merged = mergeMonsters(builtIn, customs);
    expect(merged.map((m) => m.id)).toEqual([
      'aboleth', 'zombie', 'custom-weak', 'custom-a', 'custom-b',
    ]);
  });

  it('lets a custom monster override a built-in id in place', () => {
    const override = makeMonster({ id: 'zombie', name: 'Better Zombie' });
    const merged = mergeMonsters(builtIn, [override]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.id === 'zombie')?.name).toBe('Better Zombie');
  });
});
