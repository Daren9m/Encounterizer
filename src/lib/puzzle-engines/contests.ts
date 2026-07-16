// src/lib/puzzle-engines/contests.ts
// ─── Contests ──────────────────────────────────────────────────────
// A tavern-style opposed-check duel: best of N rounds against an NPC
// challenger, with non-competing party members drawn into side
// events that can swing a round.

import { pickRandom as pick, shuffleArray } from '../random';
import { CONTEST_TYPES, SIDE_EVENTS } from '../../data/noncombat-scenarios';
import { contestRounds, contestOpponentBonus, dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, cap, withArticle } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

export const contests: PuzzleFamily = {
  key: 'contests',
  label: 'Contests',
  categories: ['minigame'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const rounds = contestRounds(levers.timeBudget);
    const bonus = contestOpponentBonus(levers.partyLevel, levers.difficulty);
    const contest = pick(CONTEST_TYPES, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const winThreshold = Math.ceil(rounds / 2);
    const sideCount = Math.min(Math.max(levers.partySize - 1, 0), 4);
    const sides = shuffleArray(SIDE_EVENTS, rng).slice(0, sideCount);

    const core = `${contest.name}: best of ${rounds} rounds of opposed ${contest.skill} checks; the challenger rolls at +${bonus}. Win ${winThreshold} rounds to take the wager.`;
    const sideLines = sides.map(s => `Side event (${s.role}): DC ${dc} ${s.skill} — ${s.effect}.`);
    const dmBrief = [core, ...sideLines].join(' ');

    const allHints = [
      `${contest.skill} is the contested skill every round; the challenger rolls at +${bonus}.`,
      sides.length > 0
        ? `A party member sitting out can attempt a side event between rounds: ${sides.map(s => s.role).join(', ')}.`
        : `No one else is free to help — this one rides entirely on the contestant.`,
      `Winning ${winThreshold} of ${rounds} rounds takes the wager outright; the challenger needs the same margin to keep it.`,
      `A narrow loss can still be played for the crowd's sympathy — it costs the wager, not the party's standing.`,
    ];

    return {
      name: contest.name,
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief,
      readAloud: `${cap(pick(pack.sensory, rng))}. On ${withArticle(pick(pack.materials, rng))} floor, the crowd presses in around ${contest.flavor}, ready to watch this round of ${contest.name}. Coin already changes hands.`,
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Roll opposed ${contest.skill} checks each round (challenger +${bonus}); the first side to win ${winThreshold} of ${rounds} rounds takes it. ${sides.length > 0 ? `Successful side events grant advantage on one round each: ${sides.map(s => `${s.role} (${s.skill})`).join('; ')}.` : 'No side events are available this time — it is a straight duel.'}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: `Losing the ${contest.name.toLowerCase()} costs the wager and standing in front of the whole crowd.` }),
      reward: rewardText(levers, rng),
    };
  },
};
