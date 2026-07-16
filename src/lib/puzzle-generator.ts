// ─── Puzzle Orchestrator ─────────────────────────────────────────
// Resolves levers in a FROZEN draw order (difficulty → theme →
// family → construction), dispatches to the family registry, and
// assembles the final Puzzle. Spec §5.1. Never change the draw
// order — shared ?seed= links replay it.

import { pickRandom as pick, randomSeed, seededRandom } from './random';
import { estimatedMinutes } from './noncombat/levers';
import { handoutToText } from './noncombat/handout-text';
import { resolveTheme } from './noncombat/theming';
import type {
  Difficulty, HandoutSpec, PuzzleCategory, ResolvedLevers,
  ThemeChoice, ThemeId, TimeBudget, Tone,
} from './noncombat/types';
import { eligibleFamilies } from './puzzle-engines';

export type { PuzzleCategory } from './noncombat/types';
export type PuzzleDifficulty = Difficulty;

export interface Puzzle {
  id: string;
  name: string;
  category: PuzzleCategory;
  difficulty: PuzzleDifficulty;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  /** @deprecated text rendering of `handout`; prefer `handout`. */
  playerHandout?: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { category?: PuzzleCategory; difficulty?: PuzzleDifficulty; theme: ThemeChoice };
}

export interface GeneratePuzzleOptions {
  category?: PuzzleCategory;
  difficulty?: PuzzleDifficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generatePuzzle(options: GeneratePuzzleOptions = {}): Puzzle {
  const {
    category, difficulty,
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — spec §5.1.
  const diff: Difficulty = difficulty ?? pick(['Easy', 'Medium', 'Hard'] as Difficulty[], rng);
  const pack = resolveTheme(theme, rng);
  const family = pick(eligibleFamilies(category), rng);
  const resolvedCategory = category ?? family.categories[0];

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty: diff, theme: pack, tone, timeBudget, seed,
  };
  const out = family.generate({ levers, rng, category: resolvedCategory });

  return {
    id: `puzzle-${seed}-${family.key}`,
    category: resolvedCategory,
    difficulty: diff,
    ...out,
    estimatedMinutes: out.estimatedMinutes || estimatedMinutes(timeBudget),
    playerHandout: out.handout ? handoutToText(out.handout) : undefined,
    seed,
    partyLevel: levers.partyLevel,
    partySize: levers.partySize,
    theme: pack.id,
    tone, timeBudget,
    requested: { category, difficulty, theme },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getPuzzleCategories(): { value: PuzzleCategory; label: string }[] {
  return [
    { value: 'logic', label: 'Logic & Riddles' },
    { value: 'word', label: 'Word & Cipher' },
    { value: 'physical', label: 'Physical / Spatial' },
    { value: 'minigame', label: 'Minigames & Contests' },
    { value: 'environmental', label: 'Environmental Hazards' },
  ];
}
