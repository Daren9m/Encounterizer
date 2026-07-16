// ─── Puzzle Family Contract ──────────────────────────────────────
import type { Rng } from '../random';
import type { HandoutSpec, PuzzleCategory, ResolvedLevers } from '../noncombat/types';

export interface EngineInput {
  levers: ResolvedLevers;
  rng: Rng;
  /** Resolved category — the orchestrator always provides it; multi-category
   *  families (riddle-frames) branch on it. Optional so direct test calls
   *  may omit it. */
  category?: PuzzleCategory;
}

export interface EngineOutput {
  name: string;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
}

export interface PuzzleFamily {
  key: string;
  label: string;
  categories: PuzzleCategory[];
  generate(input: EngineInput): EngineOutput;
}

/** Bounded rejection sampling (spec §5.1): never throws, falls back to canonical. */
export function verified<T>(attempts: number, construct: () => T, valid: (t: T) => boolean, canonical: () => T): T {
  for (let i = 0; i < attempts; i++) {
    const candidate = construct();
    if (valid(candidate)) return candidate;
  }
  return canonical();
}
