import { describe, it, expect } from 'vitest';
import {
  GENERATORS, eligibleGenerators, generateNoncombat, getNoncombatKinds,
} from '../noncombat/generate';
import type { NoncombatKind } from '../noncombat/generate';

const PUZZLE_KINDS = ['logic', 'word', 'physical', 'minigame', 'environmental'] as const;
const CHALLENGE_KINDS = ['social', 'exploration', 'skill-challenge', 'trap', 'chase', 'investigation'] as const;
const ALL_KINDS = [...PUZZLE_KINDS, ...CHALLENGE_KINDS] as NoncombatKind[];

describe('unified registry', () => {
  it('18 generators in frozen order; eligibility per kind; 11 kind options', () => {
    expect(GENERATORS).toHaveLength(18);
    for (const k of PUZZLE_KINDS) expect(eligibleGenerators(k).length, k).toBeGreaterThanOrEqual(2);
    for (const k of CHALLENGE_KINDS) expect(eligibleGenerators(k), k).toHaveLength(1);
    expect(eligibleGenerators(undefined)).toHaveLength(18);
    expect(getNoncombatKinds()).toHaveLength(11);
    expect(getNoncombatKinds().map(k => k.value)).toEqual([...ALL_KINDS]);
    expect(GENERATORS.slice(0, 12).every(g => g.generatorKind === 'family')).toBe(true);
    expect(GENERATORS.slice(12).every(g => g.generatorKind === 'framework')).toBe(true);
  });
});

describe('coverage', () => {
  it('all 11 kinds × 3 difficulties generate with correct echoes and shapes', () => {
    for (const kind of ALL_KINDS) {
      for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
        const r = generateNoncombat({ kind, difficulty, partyLevel: 7, seed: 99 });
        expect(r.kind).toBe(kind);
        expect(r.difficulty).toBe(difficulty);
        expect(r.resultKind).toBe((PUZZLE_KINDS as readonly string[]).includes(kind) ? 'puzzle' : 'challenge');
        expect(r.name.length).toBeGreaterThan(0);
        expect(r.reward.length).toBeGreaterThan(0);
      }
    }
  });
  it('union shapes: puzzles carry hints/solution, challenges carry skillChecks/outcomes', () => {
    const p = generateNoncombat({ kind: 'logic', seed: 7 });
    expect(p.resultKind).toBe('puzzle');
    if (p.resultKind === 'puzzle') {
      expect(p.hints.length).toBeGreaterThan(0);
      expect(p.solution.length).toBeGreaterThan(0);
      if (p.handout) expect(p.playerHandout!.length).toBeGreaterThan(0);
    }
    const c = generateNoncombat({ kind: 'social', seed: 7 });
    expect(c.resultKind).toBe('challenge');
    if (c.resultKind === 'challenge') {
      expect(c.skillChecks.length).toBeGreaterThan(0);
      expect(c.outcomes).toHaveLength(3);
    }
  });
});

describe('determinism + fresh golden pins', () => {
  it('same seed + levers ⇒ identical JSON on the all-drawn path', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { theme: 'any' as const, seed }; // kind AND difficulty both drawn
      expect(JSON.stringify(generateNoncombat(opts))).toBe(JSON.stringify(generateNoncombat(opts)));
    }
  });
  it('golden pins — the permanent /noncombat?seed= contract (never update without versioning URLs)', () => {
    const got = [1, 2, 3, 42, 1337, 424242].map(seed => {
      const r = generateNoncombat({ seed });
      return `${seed}=>${r.id}|${r.resultKind}|${r.theme}|${r.difficulty}|${r.kind}|${r.name}`;
    });
    expect(got).toEqual([
      "1=>nc-1-knights-knaves|puzzle|arcane-sanctum|Medium|logic|The Truthful and the False",
      "2=>nc-2-riddle-frames|puzzle|feywild-revel|Medium|word|The Riddle Door",
      "3=>nc-3-exploration|challenge|ancient-tomb|Medium|exploration|The Overland Gauntlet",
      "42=>nc-42-rune-lock|puzzle|wild-frontier|Medium|logic|The Rune-Sealed Lock",
      "1337=>nc-1337-tile-path|puzzle|ancient-tomb|Medium|physical|The Constellation Floor",
      "424242=>nc-424242-gauntlets|puzzle|city-streets|Easy|environmental|The Hazard Gauntlet",
    ]);
  });
  it('golden pin — explicit levers consume no draws before construction', () => {
    const r = generateNoncombat({
      seed: 42, kind: 'investigation', difficulty: 'Hard', theme: 'sacred-temple',
      tone: 'grim', timeBudget: 'quick', partyLevel: 9, partySize: 6,
    });
    expect(`${r.id}|${r.resultKind}|${r.theme}|${r.kind}|${r.name}`).toBe(
      'nc-42-investigation|challenge|sacred-temple|investigation|The Vanished Seal',
    );
  });
  it('difficulty omitted is a seeded draw for ALL kinds — including challenges (new behavior)', () => {
    const a = generateNoncombat({ kind: 'trap', seed: 5 });
    const b = generateNoncombat({ kind: 'trap', seed: 5 });
    expect(a.difficulty).toBe(b.difficulty);
    expect(['Easy', 'Medium', 'Hard']).toContain(a.difficulty);
    // and across seeds the draw actually varies. NOTE: the LCG's first
    // draw is 'Medium' for ALL small consecutive seeds (1–250), so use
    // widely-spaced seeds (audit-verified to yield 3 distinct values):
    const diffs = new Set(Array.from({ length: 12 }, (_, i) => generateNoncombat({ kind: 'trap', seed: (i + 1) * 104729 }).difficulty));
    expect(diffs.size).toBeGreaterThan(1);
  });
  it('requested echoes raw options (undefined stays undefined)', () => {
    const r = generateNoncombat({ seed: 13 });
    expect(r.requested.kind).toBeUndefined();
    expect(r.requested.difficulty).toBeUndefined();
    expect(r.requested.theme).toBe('any');
  });
});

describe('lever plumbing at the union level', () => {
  it('tone threads through to failure text', () => {
    const w = generateNoncombat({ kind: 'logic', tone: 'whimsical', seed: 8 });
    const g = generateNoncombat({ kind: 'logic', tone: 'grim', seed: 8 });
    if (w.resultKind === 'puzzle') expect(w.failureConsequence).not.toMatch(/\d+d\d+/);
    if (g.resultKind === 'puzzle') expect(g.failureConsequence).toMatch(/\d+d\d+/);
  });
  it('party size threads through to skill-challenge structure', () => {
    const small = generateNoncombat({ kind: 'skill-challenge', partySize: 2, seed: 7 });
    const large = generateNoncombat({ kind: 'skill-challenge', partySize: 50, seed: 7 });
    if (small.resultKind === 'challenge' && large.resultKind === 'challenge') {
      expect(small.structure!.successesNeeded).toBeLessThan(large.structure!.successesNeeded);
      expect(large.partySize).toBe(50);
    }
  });
  it('time budget threads through to hints and clue-web size', () => {
    const p = generateNoncombat({ kind: 'word', timeBudget: 'quick', seed: 4 });
    if (p.resultKind === 'puzzle') expect(p.hints).toHaveLength(2);
    const inv = generateNoncombat({ kind: 'investigation', timeBudget: 'quick', seed: 4 });
    if (inv.resultKind === 'challenge') expect(inv.clueWeb!.nodes).toHaveLength(2);
  });
});
