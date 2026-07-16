import { describe, it, expect } from 'vitest';
import { generatePuzzle, getPuzzleCategories } from '../puzzle-generator';
import type { PuzzleCategory, PuzzleDifficulty } from '../puzzle-generator';
import { eligibleFamilies } from '../puzzle-engines';

const CATS: PuzzleCategory[] = ['logic', 'word', 'physical', 'minigame', 'environmental'];
const DIFFS: PuzzleDifficulty[] = ['Easy', 'Medium', 'Hard'];

describe('registry coverage (spec §7.1 — fixes P1/P2)', () => {
  it('every category has ≥2 eligible families', () => {
    for (const cat of CATS) {
      expect(eligibleFamilies(cat).length, cat).toBeGreaterThanOrEqual(2);
    }
  });
  it('every category × difficulty generates without silent fallback', () => {
    for (const cat of CATS) {
      for (const diff of DIFFS) {
        const p = generatePuzzle({ category: cat, difficulty: diff, partyLevel: 7, seed: 99 });
        expect(p.category).toBe(cat);
        expect(p.difficulty).toBe(diff);
        expect(p.dmBrief.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('determinism (spec §2)', () => {
  it('same seed + levers ⇒ identical JSON, including any-theme and any-difficulty paths', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { partyLevel: 9, partySize: 5, theme: 'any' as const, seed };
      expect(JSON.stringify(generatePuzzle(opts))).toBe(JSON.stringify(generatePuzzle(opts)));
    }
  });
  it('distinct seeds vary the output', () => {
    const briefs = new Set(Array.from({ length: 10 }, (_, i) => generatePuzzle({ seed: i + 1 }).dmBrief));
    expect(briefs.size).toBeGreaterThan(3);
  });
});

describe('lever influence (spec §12)', () => {
  it('theme changes output for the same seed', () => {
    const a = generatePuzzle({ theme: 'ancient-tomb', seed: 5 });
    const b = generatePuzzle({ theme: 'feywild-revel', seed: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('tone: whimsical failure text carries no damage dice; grim does', () => {
    const w = generatePuzzle({ tone: 'whimsical', seed: 8 });
    expect(w.failureConsequence).not.toMatch(/\d+d\d+/);
    const g = generatePuzzle({ tone: 'grim', seed: 8 });
    expect(g.failureConsequence).toMatch(/\d+d\d+/);
  });
  it('time budget drives hint count', () => {
    expect(generatePuzzle({ timeBudget: 'quick', seed: 4 }).hints).toHaveLength(2);
    expect(generatePuzzle({ timeBudget: 'set-piece', seed: 4 }).hints).toHaveLength(4);
  });
});

describe('back-compat (spec §5/§11)', () => {
  it('legacy option shape works, including the formerly-empty word+Hard combo', () => {
    const p = generatePuzzle({ category: 'word', difficulty: 'Hard', partyLevel: 9, seed: 42 });
    expect(p.category).toBe('word');
    expect(p.difficulty).toBe('Hard');
  });
  it('playerHandout mirrors handout as text; requested echoes user levers', () => {
    const p = generatePuzzle({ category: 'logic', difficulty: 'Medium', theme: 'any', seed: 13 });
    if (p.handout) expect(p.playerHandout?.length).toBeGreaterThan(0);
    expect(p.requested.theme).toBe('any');
    expect(p.requested.category).toBe('logic');
    expect(p.seed).toBe(13);
    expect(p.id).toContain('13');
  });
  it('getPuzzleCategories keeps its five entries', () => {
    expect(getPuzzleCategories()).toHaveLength(5);
  });
});
