// ─── Non-Combat Encounter Orchestrator ───────────────────────────
// Resolves levers in a FROZEN draw order (type → theme → construction)
// and dispatches to the framework registry. Difficulty is never drawn
// (challenges has no "Any" difficulty — spec §6). Never change the
// draw order or the FRAMEWORKS array order: shared ?seed= links
// replay them.

import { pickRandom as pick, randomSeed, seededRandom } from './random';
import { resolveTheme } from './noncombat/theming';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, Difficulty, HandoutSpec, ResolvedLevers,
  SkillChallengeStructure, ThemeChoice, ThemeId, TimeBudget, Tone,
} from './noncombat/types';
import { FRAMEWORKS, frameworkFor } from './challenge-frameworks';
import type { ChallengeType, SkillCheck } from './challenge-frameworks';

export type { ChallengeType, SkillCheck };

export interface NoncombatEncounter {
  id: string;
  name: string;
  type: ChallengeType;
  difficulty: Difficulty;
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
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { type?: ChallengeType; theme: ThemeChoice };
}

export interface GenerateNoncombatOptions {
  type?: ChallengeType;
  difficulty?: Difficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generateNoncombatEncounter(options: GenerateNoncombatOptions = {}): NoncombatEncounter {
  const {
    type,
    difficulty = 'Medium',
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — spec §5.1 applied to challenges.
  const framework = type ? frameworkFor(type) : pick(FRAMEWORKS, rng);
  const pack = resolveTheme(theme, rng);

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty, theme: pack, tone, timeBudget, seed,
  };
  const out = framework.generate({ levers, rng });

  return {
    id: `nc-${seed}-${framework.key}`,
    type: framework.key,
    difficulty,
    ...out,
    seed,
    partyLevel: levers.partyLevel,
    partySize: levers.partySize,
    theme: pack.id,
    tone, timeBudget,
    requested: { type, theme },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getChallengeTypes(): { value: ChallengeType; label: string; description: string }[] {
  return FRAMEWORKS.map(f => ({ value: f.key, label: f.label, description: f.description }));
}
