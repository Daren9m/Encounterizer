import { describe, it, expect } from 'vitest';
import { generateNoncombatEncounter, getChallengeTypes } from '../noncombat-generator';
import type { ChallengeType } from '../noncombat-generator';
import { FRAMEWORKS } from '../challenge-frameworks';

const TYPES: ChallengeType[] = ['social', 'exploration', 'skill-challenge', 'trap', 'chase', 'investigation'];
const DIFFS = ['Easy', 'Medium', 'Hard'] as const;

describe('registry + coverage', () => {
  it('exactly six frameworks, all types generate at all difficulties', () => {
    expect(FRAMEWORKS).toHaveLength(6);
    expect(getChallengeTypes().map(t => t.value).sort()).toEqual([...TYPES].sort());
    for (const type of TYPES) {
      for (const difficulty of DIFFS) {
        const e = generateNoncombatEncounter({ type, difficulty, partyLevel: 7, seed: 99 });
        expect(e.type).toBe(type);
        expect(e.difficulty).toBe(difficulty);
        expect(e.readAloud.length).toBeGreaterThan(0);
        expect(e.skillChecks.length).toBeGreaterThan(0);
        expect(e.outcomes).toHaveLength(3);
      }
    }
  });
});

describe('determinism (frozen draw order)', () => {
  it('same seed + levers ⇒ identical JSON, including any-theme and unset-type paths', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { partyLevel: 9, partySize: 5, theme: 'any' as const, seed };
      expect(JSON.stringify(generateNoncombatEncounter(opts))).toBe(JSON.stringify(generateNoncombatEncounter(opts)));
    }
  });
  it('difficulty is never drawn: changing it never changes the resolved type/theme', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const easy = generateNoncombatEncounter({ seed, difficulty: 'Easy' });
      const hard = generateNoncombatEncounter({ seed, difficulty: 'Hard' });
      expect(easy.type).toBe(hard.type);
      expect(easy.theme).toBe(hard.theme);
    }
  });
  it('golden pins — the permanent ?seed= contract (never update without versioning URLs)', () => {
    const got = [1, 2, 3, 42, 1337, 424242].map(seed => {
      const e = generateNoncombatEncounter({ seed });
      return `${seed}=>${e.id}|${e.theme}|${e.type}`;
    });
    expect(got).toEqual([
      '1=>nc-1-skill-challenge|arcane-sanctum|skill-challenge',
      '2=>nc-2-skill-challenge|feywild-revel|skill-challenge',
      '3=>nc-3-skill-challenge|ancient-tomb|skill-challenge',
      '42=>nc-42-trap|wild-frontier|trap',
      '1337=>nc-1337-trap|ancient-tomb|trap',
      '424242=>nc-424242-exploration|city-streets|exploration',
    ]);
  });
  it('golden pin — explicit levers consume no draws before construction', () => {
    const e = generateNoncombatEncounter({
      seed: 42, type: 'investigation', difficulty: 'Hard', theme: 'sacred-temple',
      tone: 'grim', timeBudget: 'quick', partyLevel: 9, partySize: 6,
    });
    expect(`${e.id}|${e.theme}|${e.type}|${e.clueWeb?.nodes.length}`).toBe(
      'nc-42-investigation|sacred-temple|investigation|2', // includes nodes=2 (quick)
    );
  });
});

describe('lever influence', () => {
  it('party size changes skill-challenge structure', () => {
    const small = generateNoncombatEncounter({ type: 'skill-challenge', partySize: 2, seed: 7 });
    const large = generateNoncombatEncounter({ type: 'skill-challenge', partySize: 8, seed: 7 });
    expect(small.structure!.successesNeeded).toBeLessThan(large.structure!.successesNeeded);
  });
  it('tone selects the consequence template on failureText-backed outcomes', () => {
    const w = generateNoncombatEncounter({ type: 'skill-challenge', tone: 'whimsical', seed: 8 });
    const g = generateNoncombatEncounter({ type: 'skill-challenge', tone: 'grim', seed: 8 });
    expect(w.outcomes[2].description).not.toMatch(/\d+d\d+/);
    expect(g.outcomes[2].description).toMatch(/\d+d\d+/);
  });
  it('theme changes output for the same seed', () => {
    const a = generateNoncombatEncounter({ theme: 'ancient-tomb', seed: 5 });
    const b = generateNoncombatEncounter({ theme: 'feywild-revel', seed: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('back-compat (spec §5/§11)', () => {
  it('legacy option shape works and legacy fields are all present', () => {
    const e = generateNoncombatEncounter({ type: 'social', difficulty: 'Hard', partyLevel: 9, seed: 42 });
    for (const field of ['id', 'name', 'type', 'difficulty', 'readAloud', 'situation', 'stakes', 'skillChecks', 'complication', 'outcomes', 'reward'] as const) {
      expect(e[field]).toBeDefined();
    }
    expect(e.requested.type).toBe('social');
    expect(e.requested.theme).toBe('any');
    expect(e.id).toBe('nc-42-social');
  });
});
