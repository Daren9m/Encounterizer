// ─── Seeded RNG ──────────────────────────────────────────────────
// Single source of truth for randomness across all generators.
// The LCG constants are the classic Numerical Recipes values; the
// sequence for a given seed is load-bearing (shareable encounter links
// replay a seed to reproduce results) — never change the formula
// without versioning the URLs that embed seeds.

export type Rng = () => number;

/** Deterministic PRNG. Same seed ⇒ same sequence, forever. Returns [0, 1). */
export function seededRandom(seed: number): Rng {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Entropy helper for callers that want a fresh, URL-embeddable seed. */
export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) & 0x7fffffff;
}

/** Fisher–Yates shuffle into a new array. */
export function shuffleArray<T>(arr: readonly T[], rng: Rng): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Uniform pick. Callers must not pass an empty array. */
export function pickRandom<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}
