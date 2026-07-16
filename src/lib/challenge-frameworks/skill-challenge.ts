// ─── Skill Challenge ─────────────────────────────────────────────
// Party-size-derived success count before 3 failures, phase structure
// for set pieces, complication ladder, one group-check moment, and a
// skill palette spread across ≥4 ability scores (spec §8.1).

import { pickRandom as pick, shuffleArray } from '../random';
import { SKILL_OBJECTIVES } from '../../data/noncombat-scenarios';
import { dcFor, groupCheckThreshold, phaseSplit, successesNeeded } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { ResolvedLevers, SkillChallengeStructure } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export function buildChallengeStructure(levers: ResolvedLevers, phaseTitles?: [string, string, string], objectiveName = 'The Challenge'): SkillChallengeStructure {
  const total = successesNeeded(levers.partySize, levers.timeBudget, levers.difficulty);
  const titles = phaseTitles ?? ['Opening', 'Turning point', 'Resolution'];
  const skills = ['Athletics', 'Perception', 'Persuasion', 'Arcana'];
  if (levers.timeBudget !== 'set-piece') {
    return {
      phases: [{ title: objectiveName, successes: total, primarySkills: skills.slice(0, 2) }],
      successesNeeded: total,
      failuresAllowed: 3,
    };
  }
  const split = phaseSplit(total);
  const chosenTitles = split.length === 2 ? [titles[0], titles[2]] : [...titles];
  return {
    phases: split.map((successes, i) => ({
      title: chosenTitles[i],
      successes,
      primarySkills: [skills[i % skills.length], skills[(i + 1) % skills.length]],
    })),
    successesNeeded: total,
    failuresAllowed: 3,
  };
}

export const skillChallenge: ChallengeFramework = {
  key: 'skill-challenge',
  label: 'Skill Challenge',
  description: 'Structured multi-check encounters with phases, escalation, and a group-check moment',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const objective = pick(SKILL_OBJECTIVES, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const total = successesNeeded(levers.partySize, levers.timeBudget, levers.difficulty);
    // Rebuild the structure with the objective's real titles/skills.
    const base = buildChallengeStructure(levers, objective.phaseTitles, objective.name);
    const structure: SkillChallengeStructure = {
      ...base,
      phases: base.phases.map((p, i) => ({
        ...p,
        primarySkills: [
          objective.primarySkills[i % objective.primarySkills.length],
          objective.primarySkills[(i + 1) % objective.primarySkills.length],
        ],
      })),
    };
    const threshold = groupCheckThreshold(levers.partySize);
    const [escA, escB] = shuffleArray(levers.theme.consequences, rng);
    const groupSkill = pick(objective.primarySkills, rng);
    const primaries: SkillCheck[] = objective.primarySkills.map(s => ({
      skill: s, dc,
      onSuccess: `${s} directly advances "${objective.name}" — one success recorded.`,
      onFailure: `The approach backfires — one failure recorded and the pressure mounts.`,
    }));
    const secondaries: SkillCheck[] = objective.secondarySkills.map(s => ({
      skill: s, dc: dc - 2,
      onSuccess: `Supporting effort — grants advantage on the next primary check.`,
      onFailure: `No progress, but no failure recorded either.`,
    }));
    const groupCheck: SkillCheck = {
      skill: groupSkill, dc,
      onSuccess: `Group check: at least ${threshold} of ${levers.partySize} succeed — the whole party surges forward (one success, no individual failures).`,
      onFailure: `Group check: fewer than ${threshold} of ${levers.partySize} succeed — one failure recorded for the group.`,
    };
    const half = Math.ceil(total / 2);
    return {
      name: objective.name,
      readAloud: objective.setup,
      situation: `Skill challenge: ${total} successes before ${structure.failuresAllowed} failures. Each character acts in turn; repeat approaches with the same skill raise the table's eyebrows (and the DC by 2).`,
      stakes: `Success: the objective is achieved cleanly. Failure: the objective slips away — see outcomes.`,
      skillChecks: [...primaries, ...secondaries, groupCheck],
      complication: `At the 1st failure: ${escA}. At the 2nd failure: ${escB}.`,
      outcomes: [
        { label: `${total}+ successes`, description: 'Complete success — everything they set out to do.' },
        { label: `${half}–${total - 1} successes`, description: 'Partial success — objective achieved at a cost (time, injury, position).' },
        { label: `Fewer than ${half}`, description: failureText(levers, rng, { kind: 'climactic', context: 'The challenge collapses.', save: undefined }) },
      ],
      reward: rewardText(levers, rng),
      structure,
      stages: structure.phases.length > 1
        ? structure.phases.map(p => ({ title: p.title, text: `${p.successes} successes here; lead with ${p.primarySkills.join(' or ')}.` }))
        : undefined,
    };
  },
};
