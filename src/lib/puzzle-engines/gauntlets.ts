// src/lib/puzzle-engines/gauntlets.ts
// ─── Hazard Gauntlets ──────────────────────────────────────────────
// A phased environmental hazard: an escalating threat with a group
// check to trip the escape mechanism before the window closes, then
// recurring harm for anyone still caught inside.

import { pickRandom as pick, shuffleArray } from '../random';
import { GAUNTLET_HAZARDS } from '../../data/noncombat-scenarios';
import { groupCheckThreshold, operatorCount, dcFor, damageDice, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, cap, withArticle } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

export const gauntlets: PuzzleFamily = {
  key: 'gauntlets',
  label: 'Hazard Gauntlets',
  categories: ['environmental'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const phaseCount = levers.timeBudget === 'quick' ? 1 : levers.timeBudget === 'standard' ? 2 : 3;
    const windowRounds = levers.difficulty === 'Easy' ? 6 : levers.difficulty === 'Medium' ? 5 : 4;
    const hazards = shuffleArray(GAUNTLET_HAZARDS, rng).slice(0, phaseCount);
    const ops = Math.min(levers.partySize, operatorCount(levers.difficulty, rng));
    const threshold = groupCheckThreshold(levers.partySize);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const dice = damageDice(levers.partyLevel, levers.difficulty, 'recurring');
    const first = hazards[0];

    const phaseLines = hazards.map((h, i) => {
      const label = phaseCount > 1 ? `Phase ${i + 1} — ${h.name}` : h.name;
      return `${label}: ${h.hazard}. Escape: ${h.escape}. The window lasts ${windowRounds} rounds, and at least ${threshold} of ${levers.partySize} must succeed on DC ${dc} ${h.skills[0]} (or ${h.skills.slice(1).join('/')}) as a group check, with the mechanism demanding ${ops} operators at once to throw it.`;
    });
    const dmBrief = `${phaseLines.join(' ')} Once a window closes, the hazard deals ${dice} damage each round to everyone still caught inside, until they escape.`;

    const stages = phaseCount > 1
      ? hazards.map((h, i) => ({ title: `Phase ${i + 1}: ${h.name}`, text: `${h.hazard}. Escape: ${h.escape}.` }))
      : undefined;

    const allHints = [
      `${cap(first.skills[0])} works fastest against this hazard; ${first.skills.slice(1).join(' or ') || 'no substitute skill helps here'} can stand in if the party is short.`,
      `The group check needs ${threshold} successes, not ${threshold} people rolling once each — a failed attempt can be retried by someone else next round.`,
      `${ops} bodies must be on the mechanism in the same round it triggers, or it resets.`,
      `Sacrificing gear — rope, a shield, a torch wedged just so — can buy one extra round before the window closes.`,
    ];

    return {
      name: phaseCount > 1 ? 'The Hazard Gauntlet' : first.name,
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief,
      readAloud: `${cap(pick(pack.sensory, rng))}. You have found ${first.name} — ${withArticle(pick(pack.materials, rng))} chamber where ${first.felt}. ${cap(first.omen)}.`,
      handout: {
        kind: 'text',
        title: 'Scratched into the Wall',
        body: `"${cap(first.felt)} — and it does not stop. ${cap(first.omen)}. Hurry."\n— an earlier hand, in haste`,
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Get at least ${threshold} of ${levers.partySize} to succeed on DC ${dc} ${first.skills[0]} (or ${first.skills.slice(1).join('/')}) as a group check within ${windowRounds} rounds, with ${ops} bodies on the mechanism at once, to trigger: ${first.escape}.${phaseCount > 1 ? ` Later phases repeat the same structure with new hazards: ${hazards.slice(1).map(h => h.name).join(', ')}.` : ''}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'The window closes and the hazard keeps escalating on everyone still trapped inside.' }),
      reward: rewardText(levers, rng),
      stages,
    };
  },
};
