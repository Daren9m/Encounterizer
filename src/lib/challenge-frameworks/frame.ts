// ─── Challenge Framework Contract ────────────────────────────────
import type { Rng } from '../random';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, HandoutSpec, ResolvedLevers, SkillChallengeStructure,
} from '../noncombat/types';

export type ChallengeType = 'social' | 'exploration' | 'skill-challenge' | 'trap' | 'chase' | 'investigation';

export interface SkillCheck { skill: string; dc: number; onSuccess: string; onFailure: string }

export interface FrameworkInput { levers: ResolvedLevers; rng: Rng }

export interface FrameworkOutput {
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

export interface ChallengeFramework {
  key: ChallengeType;
  label: string;
  description: string;
  generate(input: FrameworkInput): FrameworkOutput;
}
