// ─── Challenge Framework Registry ────────────────────────────────
// The FRAMEWORKS array order is part of the frozen ?seed= contract
// (the unset-type draw indexes into it) — never reorder it.

import type { ChallengeFramework, ChallengeType } from './frame';
import { skillChallenge } from './skill-challenge';
import { social } from './social';
import { exploration } from './exploration';
import { trap } from './trap';
import { chase } from './chase';
import { investigation } from './investigation';

export const FRAMEWORKS: ChallengeFramework[] = [
  social, exploration, skillChallenge, trap, chase, investigation,
];

export function frameworkFor(type: ChallengeType): ChallengeFramework {
  return FRAMEWORKS.find(f => f.key === type) ?? FRAMEWORKS[0];
}

export type { ChallengeFramework, ChallengeType, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';
