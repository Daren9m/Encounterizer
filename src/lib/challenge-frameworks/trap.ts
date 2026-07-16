// ─── Complex Trap ────────────────────────────────────────────────
// Trigger, escalating effect, multi-step countermeasures, detection
// clues placed before the trigger, reset, twist (spec §8.4).

import { pickRandom as pick } from '../random';
import { TRAP_FRAMES } from '../../data/noncombat-scenarios';
import { damageDice, dcFor } from '../noncombat/levers';
import { cap, rewardText } from '../noncombat/theming';
import type { Difficulty } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export const COUNTERMEASURE_STEPS: Record<Difficulty, number> = { Easy: 2, Medium: 2, Hard: 3 };

export const trap: ChallengeFramework = {
  key: 'trap',
  label: 'Trap / Hazard',
  description: 'Complex traps: detection, escalation, multi-step countermeasures, and a twist',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const frame = pick(TRAP_FRAMES, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const triggerDice = damageDice(levers.partyLevel, levers.difficulty, 'climactic');
    const tickDice = damageDice(levers.partyLevel, levers.difficulty, 'recurring');
    const steps = frame.countermeasures.slice(0, COUNTERMEASURE_STEPS[levers.difficulty]);
    const stepChecks: SkillCheck[] = steps.map((c, i) => ({
      skill: c.skill, dc,
      onSuccess: `Step ${i + 1} of ${steps.length}: ${c.action} — the mechanism yields a little more.`,
      onFailure: `The step slips — the trap ${i === 0 ? 'arms with an audible change in pitch' : 'escalates: ' + frame.escalation}.`,
    }));
    return {
      name: cap(frame.name),
      readAloud: `${cap(pack.sensory[2] ?? pack.sensory[0])}. Nothing about the way ahead looks wrong — which is exactly what feels wrong.`,
      situation: `Clues (visible before the trigger): ${frame.clues.join('; ')}. Trigger: ${frame.trigger}. Reset: ${frame.reset}.`,
      stakes: `On trigger: ${frame.effect} — ${triggerDice} damage (DC ${dc} DEX save for half). Each round after: ${frame.escalation} — ${tickDice} damage, no save, until a countermeasure step succeeds.`,
      skillChecks: [
        { skill: 'Perception', dc, onSuccess: `You notice: ${frame.clues[0]}.`, onFailure: 'Nothing seems out of place.' },
        { skill: 'Investigation', dc: dc - 2, onSuccess: 'You deduce the mechanism and where to interrupt it.', onFailure: 'You suspect something but cannot pinpoint it.' },
        ...stepChecks,
      ],
      complication: `Twist: ${frame.twist}`,
      outcomes: [
        { label: 'Detected and disarmed', description: `All ${steps.length} countermeasure steps succeed — no harm done, and the twist may pay off.` },
        { label: 'Detected, bypassed', description: 'The party routes around or triggers it from safety; the twist stays unexplored.' },
        { label: 'Triggered', description: `Full effect, then per-round escalation until the steps are completed under pressure.` },
      ],
      reward: rewardText(levers, rng),
    };
  },
};
