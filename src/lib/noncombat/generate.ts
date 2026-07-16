// ─── Unified Non-Combat Orchestrator ─────────────────────────────
// One flat registry over the 12 puzzle families and 6 challenge
// frameworks, one FROZEN draw order (difficulty → theme → generator
// → construction), one fresh ?seed= contract. Amendment spec
// 2026-07-16. Never reorder GENERATORS or change the draw order —
// shared /noncombat links replay them.

import { pickRandom as pick, randomSeed, seededRandom } from '../random';
import { estimatedMinutes } from './levers';
import { handoutToText } from './handout-text';
import { resolveTheme } from './theming';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, Difficulty, HandoutSpec, PuzzleCategory,
  ResolvedLevers, SkillChallengeStructure, ThemeChoice, ThemeId, TimeBudget, Tone,
} from './types';
import { FAMILIES } from '../puzzle-engines';
import type { PuzzleFamily } from '../puzzle-engines';
import { FRAMEWORKS } from '../challenge-frameworks';
import type { ChallengeFramework, ChallengeType, SkillCheck } from '../challenge-frameworks';

export type NoncombatKind = PuzzleCategory | ChallengeType;

interface CommonEcho {
  id: string;
  kind: NoncombatKind;
  difficulty: Difficulty;
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { kind?: NoncombatKind; difficulty?: Difficulty; theme: ThemeChoice };
}

export interface PuzzleResult extends CommonEcho {
  resultKind: 'puzzle';
  name: string;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  /** Plain-text rendering of `handout` (markdown export reuses it). */
  playerHandout?: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
}

export interface ChallengeResult extends CommonEcho {
  resultKind: 'challenge';
  name: string;
  readAloud: string;
  situation: string;
  stakes: string;
  skillChecks: SkillCheck[];
  complication: string;
  outcomes: { label: string; description: string }[];
  reward: string;
  handout?: HandoutSpec;
  stages?: { title: string; text: string }[];
  structure?: SkillChallengeStructure;
  attitudeTrack?: AttitudeTrack;
  clueWeb?: ClueWeb;
  chase?: ChasePlan;
}

export type NoncombatResult = PuzzleResult | ChallengeResult;

export type GeneratorEntry =
  | { generatorKind: 'family'; family: PuzzleFamily }
  | { generatorKind: 'framework'; framework: ChallengeFramework };

// FAMILIES order, then FRAMEWORKS order — frozen contract.
export const GENERATORS: GeneratorEntry[] = [
  ...FAMILIES.map(family => ({ generatorKind: 'family' as const, family })),
  ...FRAMEWORKS.map(framework => ({ generatorKind: 'framework' as const, framework })),
];

const PUZZLE_KINDS: readonly PuzzleCategory[] = ['logic', 'word', 'physical', 'minigame', 'environmental'];

export function eligibleGenerators(kind?: NoncombatKind): GeneratorEntry[] {
  if (!kind) return GENERATORS;
  if ((PUZZLE_KINDS as readonly string[]).includes(kind)) {
    return GENERATORS.filter(
      g => g.generatorKind === 'family' && g.family.categories.includes(kind as PuzzleCategory),
    );
  }
  return GENERATORS.filter(g => g.generatorKind === 'framework' && g.framework.key === kind);
}

export interface GenerateNoncombatOptions {
  kind?: NoncombatKind;
  difficulty?: Difficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generateNoncombat(options: GenerateNoncombatOptions = {}): NoncombatResult {
  const {
    kind, difficulty,
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — amendment spec.
  const diff: Difficulty = difficulty ?? pick(['Easy', 'Medium', 'Hard'] as Difficulty[], rng);
  const pack = resolveTheme(theme, rng);
  const entry = pick(eligibleGenerators(kind), rng);

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty: diff, theme: pack, tone, timeBudget, seed,
  };
  const requested = { kind, difficulty, theme };
  const echo = {
    difficulty: diff, seed,
    partyLevel: levers.partyLevel, partySize: levers.partySize,
    theme: pack.id, tone, timeBudget, requested,
  };

  if (entry.generatorKind === 'family') {
    const resolvedKind = (kind as PuzzleCategory | undefined) ?? entry.family.categories[0];
    const out = entry.family.generate({ levers, rng, category: resolvedKind });
    return {
      resultKind: 'puzzle',
      ...out,
      estimatedMinutes: out.estimatedMinutes || estimatedMinutes(timeBudget),
      playerHandout: out.handout ? handoutToText(out.handout) : undefined,
      id: `nc-${seed}-${entry.family.key}`,
      kind: resolvedKind,
      ...echo,
    };
  }
  const out = entry.framework.generate({ levers, rng });
  return {
    resultKind: 'challenge',
    ...out,
    id: `nc-${seed}-${entry.framework.key}`,
    kind: entry.framework.key,
    ...echo,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getNoncombatKinds(): { value: NoncombatKind; label: string; description: string }[] {
  return [
    { value: 'logic', label: 'Logic & Riddles', description: 'Verified deduction puzzles — truth-tellers, logic grids, rune locks, crossings, sequences' },
    { value: 'word', label: 'Word & Cipher', description: 'Riddles from the corpus and decodable ciphers in themed scripts' },
    { value: 'physical', label: 'Physical / Spatial', description: 'Plates, tiles, and balanced stones — grid puzzles with printable handouts' },
    { value: 'minigame', label: 'Minigames & Contests', description: 'Party-size-aware contests and riddle duels' },
    { value: 'environmental', label: 'Environmental Hazards', description: 'Escape gauntlets with phased hazards and group checks' },
    ...FRAMEWORKS.map(f => ({ value: f.key as NoncombatKind, label: f.label, description: f.description })),
  ];
}
