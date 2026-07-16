// ─── Lever Math ──────────────────────────────────────────────────
// Every number that a lever turns into lives here, test-locked.
// Spec: docs/superpowers/specs/2026-07-15-noncombat-encounter-engine-v2-design.md §6

import type { Rng } from '../random';
import type { Difficulty, TimeBudget } from './types';

export function dcFor(level: number, diff: Difficulty): number {
  const base = 10 + Math.floor(level / 2);
  if (diff === 'Easy') return base - 2;
  if (diff === 'Hard') return base + 3;
  return base;
}

export type SeverityColumn = 'setback' | 'dangerous' | 'deadly';

const SEVERITY: Record<SeverityColumn, [string, string, string, string]> = {
  setback:   ['1d10', '2d10', '4d10', '10d10'],
  dangerous: ['2d10', '4d10', '10d10', '18d10'],
  deadly:    ['4d10', '10d10', '18d10', '24d10'],
};

export function tierIndex(level: number): 0 | 1 | 2 | 3 {
  return level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3;
}

export function severityDice(level: number, column: SeverityColumn): string {
  return SEVERITY[column][tierIndex(level)];
}

/** Recurring harm stays soft (setback); climactic harm maps difficulty → column. */
export function damageDice(level: number, diff: Difficulty, kind: 'climactic' | 'recurring'): string {
  if (kind === 'recurring') return severityDice(level, 'setback');
  const col: SeverityColumn = diff === 'Easy' ? 'setback' : diff === 'Medium' ? 'dangerous' : 'deadly';
  return severityDice(level, col);
}

export function successesNeeded(partySize: number, budget: TimeBudget, diff: Difficulty): number {
  const base = budget === 'quick' ? Math.ceil(partySize * 0.75)
    : budget === 'standard' ? partySize
    : partySize + 2;
  const offset = diff === 'Easy' ? -1 : diff === 'Hard' ? 1 : 0;
  return Math.min(12, Math.max(3, base + offset));
}

/** Even split; the larger shares land in the later phases. */
export function phaseSplit(successes: number): number[] {
  const phases = successes <= 7 ? 2 : 3;
  const per = Math.floor(successes / phases);
  const out: number[] = Array(phases).fill(per);
  for (let i = 0; i < successes % phases; i++) out[phases - 1 - i] += 1;
  return out;
}

export function groupCheckThreshold(partySize: number): number {
  return Math.ceil(partySize / 2);
}

export function contestRounds(budget: TimeBudget): 3 | 5 | 7 {
  return budget === 'quick' ? 3 : budget === 'standard' ? 5 : 7;
}

export function contestOpponentBonus(level: number, diff: Difficulty): number {
  const base = Math.floor(level / 2);
  return diff === 'Easy' ? base : diff === 'Medium' ? base + 2 : base + 4;
}

export function hintCount(budget: TimeBudget): 2 | 3 | 4 {
  return budget === 'quick' ? 2 : budget === 'standard' ? 3 : 4;
}

/** How many simultaneous operators a mechanism wants (spec §6.3). */
export function operatorCount(diff: Difficulty, rng: Rng): number {
  if (diff === 'Easy') return 2;
  if (diff === 'Medium') return 2 + Math.floor(rng() * 2);
  return 3 + Math.floor(rng() * 2);
}

export function estimatedMinutes(budget: TimeBudget): number {
  return budget === 'quick' ? 8 : budget === 'standard' ? 15 : 30;
}

/** Moved verbatim from the legacy puzzle-generator goldForLevel. */
export function goldReward(level: number): string {
  if (level <= 4) return `${10 + level * 5} GP`;
  if (level <= 10) return `${50 + level * 20} GP`;
  return `${200 + level * 50} GP`;
}
