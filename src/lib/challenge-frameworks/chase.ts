// ─── Chase ───────────────────────────────────────────────────────
// Quarry profile, one themed waypoint complication per round, and a
// lead-counter with concrete catch/escape math (spec §8.5).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { QUARRIES, WAYPOINTS, type Quarry } from '../../data/noncombat-scenarios';
import { contestRounds, dcFor, groupCheckThreshold } from '../noncombat/levers';
import { cap, failureText, rewardText } from '../noncombat/theming';
import type { ChasePlan, ResolvedLevers } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput } from './frame';

export function buildChase(levers: ResolvedLevers, rng: Rng): { quarry: Quarry; plan: ChasePlan } {
  const rounds = contestRounds(levers.timeBudget);
  const dc = dcFor(levers.partyLevel, levers.difficulty);
  const quarry = pick(QUARRIES, rng);
  const picks = shuffleArray(WAYPOINTS, rng).slice(0, rounds);
  const plan: ChasePlan = {
    rounds,
    complications: picks.map((w, i) => ({
      round: i + 1,
      text: i === Math.min(1, rounds - 1) ? `${cap(quarry.trick)} — ${w.text}` : w.text,
      check: `${w.skill} DC ${dc}`,
    })),
    catchCondition: `The quarry starts 2 zones ahead. Each round's complication success closes the lead by 1; failure opens it by 1. Lead 0 — the quarry is cornered.`,
    escapeCondition: `Lead 4, or the final round ends at lead 2+ — the quarry slips away. At lead 1 they turn desperate: ${quarry.desperation}.`,
  };
  return { quarry, plan };
}

export const chase: ChallengeFramework = {
  key: 'chase',
  label: 'Chase',
  description: 'Round-by-round pursuit with waypoint complications and a live lead counter',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const { quarry, plan } = buildChase(levers, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const threshold = groupCheckThreshold(levers.partySize);
    const laneNote = levers.partySize > 1
      ? ` Lanes: the fastest character leads; unless at least ${threshold} of ${levers.partySize} keep pace each round, the lead opens by 1 regardless of the complication.`
      : '';
    return {
      name: `The ${pick(['Pursuit', 'Flight', 'Hunt', 'Run'], rng)} Through ${cap(pick(pack.descriptors, rng))} Ground`,
      readAloud: `${cap(quarry.archetype)} bolts — ${pack.sensory[1] ?? pack.sensory[0]}. ${cap(quarry.speedNote)}.`,
      situation: `Quarry: ${quarry.archetype}. ${cap(quarry.speedNote)}. Known trick: ${quarry.trick}.${laneNote}`,
      stakes: `${plan.catchCondition} ${plan.escapeCondition}`,
      skillChecks: plan.complications.map(c => ({
        skill: c.check.split(' DC ')[0], dc,
        onSuccess: `Round ${c.round}: ${c.text} — cleared; the lead closes by 1.`,
        onFailure: `Round ${c.round}: ${c.text} — it costs you; the lead opens by 1.`,
      })),
      complication: failureText(levers, rng, { kind: 'recurring', context: 'A bystander tangle or a bad landing mid-chase.', save: 'DEX' }),
      outcomes: [
        { label: 'Cornered (lead 0)', description: 'The quarry is caught — winded, cornered, and ready to talk or fight.' },
        { label: 'Escaped', description: 'The trail goes cold — but the route itself revealed where they were headed.' },
        { label: 'Desperation (lead 1)', description: `${cap(quarry.desperation)} — catching them now means dealing with that.` },
      ],
      reward: rewardText(levers, rng),
      chase: plan,
    };
  },
};
