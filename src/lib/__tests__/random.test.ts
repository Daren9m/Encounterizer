import { describe, expect, it } from 'vitest';
import { pickRandom, randomSeed, seededRandom, shuffleArray } from '@/lib/random';

describe('seededRandom', () => {
  it('reproduces the exact golden sequence for a fixed seed', () => {
    // Shareable encounter URLs replay seeds — this locks the LCG bit-for-bit.
    // If this test ever fails, seeded links in the wild break: don't "fix" the
    // formula, version it.
    const rng = seededRandom(42);
    const sequence = Array.from({ length: 5 }, () => rng());
    expect(sequence).toEqual([
      0.5046903498026963, 0.17625009090465033, 0.15456239653498047,
      0.44510853218152585, 0.7513203945715541,
    ]);
  });

  it('is deterministic per seed and divergent across seeds', () => {
    const a1 = seededRandom(7);
    const a2 = seededRandom(7);
    const b = seededRandom(8);
    const seqA1 = Array.from({ length: 10 }, () => a1());
    const seqA2 = Array.from({ length: 10 }, () => a2());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
  });

  it('stays within [0, 1)', () => {
    const rng = seededRandom(123456);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffleArray', () => {
  it('shuffles deterministically without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffleArray(input, seededRandom(99));
    const b = shuffleArray(input, seededRandom(99));
    expect(a).toEqual(b);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
  });
});

describe('pickRandom', () => {
  it('picks deterministically and stays in bounds', () => {
    const rng = seededRandom(5);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(pickRandom(arr, rng));
    }
  });
});

describe('randomSeed', () => {
  it('produces non-negative 31-bit integers', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0x7fffffff);
    }
  });
});
