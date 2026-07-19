// src/lib/challenge-frameworks/social.ts
// ─── Social Encounter ────────────────────────────────────────────
// Persona × want × secret × leverage, with the three-state attitude
// track from the 2024 influence rules (spec §8.2).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { INTERRUPTIONS, LEVERAGE, PERSONAS, SECRETS, SOCIAL_COMPLICATIONS, WANTS, type Leverage } from '../../data/noncombat-cast';
import { dcFor } from '../noncombat/levers';
import { cap, rewardText } from '../noncombat/theming';
import type { AttitudeTrack, ResolvedLevers } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput } from './frame';

export function buildAttitudeTrack(levers: ResolvedLevers, leverage: Leverage, rng: Rng): AttitudeTrack {
  const dc = dcFor(levers.partyLevel, levers.difficulty);
  const start = pick(['Hostile', 'Indifferent', 'Indifferent', 'Friendly'] as const, rng);
  return {
    start,
    stages: [
      {
        attitude: 'Hostile', influenceDc: dc + 2,
        unlocks: 'They will hear one sentence before walking away — nothing more.',
        shiftUp: cap(leverage.approach),
        shiftDown: cap(leverage.counter),
      },
      {
        attitude: 'Indifferent', influenceDc: dc,
        unlocks: 'Honest dealing: they will state their want plainly and haggle in good faith.',
        shiftUp: cap(leverage.approach),
        shiftDown: cap(leverage.counter),
      },
      // Friendly is the top stage — there is nothing to shift up TO, so
      // shiftUp carries maintenance guidance instead of leverage.approach.
      {
        attitude: 'Friendly', influenceDc: dc - 2,
        unlocks: 'The guard drops: the secret is within reach for anyone paying attention.',
        shiftUp: 'Keep faith with what was promised — friendship holds.',
        shiftDown: cap(leverage.counter),
      },
    ],
  };
}

export const social: ChallengeFramework = {
  key: 'social',
  label: 'Social Encounter',
  description: 'NPC negotiation with attitude stages, leverage, and a live secret',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const persona = pick(PERSONAS, rng);
    const wantPool = shuffleArray(WANTS, rng);
    const want = wantPool[0];
    const secret = pick(SECRETS, rng);
    const leverage = pick(LEVERAGE, rng);
    const track = buildAttitudeTrack(levers, leverage, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const sideCount = Math.min(Math.max(levers.partySize - 1, 0), 3);
    const sides = shuffleArray(pack.cast, rng).slice(0, sideCount)
      .map((c, i) => `Side NPC: ${c} — wants ${wantPool[i + 1]}.`);
    const complication = pick(SOCIAL_COMPLICATIONS, rng);
    const interruption = pick(INTERRUPTIONS, rng);
    return {
      name: `The ${pick(['Proposition', 'Petition', 'Bargain', 'Confession', 'Overture', 'Reckoning'], rng)}`,
      readAloud: `${cap(persona.archetype)} seeks you out — ${pack.sensory[0]}.`,
      situation: [
        `${cap(persona.archetype)} wants: ${want}. Their manner: starts ${track.start}.`,
        `Voice: ${persona.speech}. Tell: ${persona.quirk}.`,
        `Leverage (${leverage.kind}): ${leverage.approach}. Backfires: ${leverage.counter}.`,
        ...sides,
      ].join('\n'),
      stakes: `Secret: ${secret}. Mid-scene: ${interruption}.`,
      skillChecks: [
        { skill: 'Insight', dc, onSuccess: `Their tell — ${persona.quirk} — betrays when a topic touches the secret.`, onFailure: 'They seem entirely sincere.' },
        { skill: 'Persuasion', dc, onSuccess: 'Shift their attitude one step up (use the current stage\'s DC).', onFailure: 'No movement — and repetition annoys them.' },
        { skill: 'Deception', dc: dc + 1, onSuccess: 'A useful fiction lands — one exchange proceeds on your terms.', onFailure: `Caught: ${leverage.counter}.` },
        { skill: 'Intimidation', dc: dc + 2, onSuccess: 'Fear loosens their tongue — one truth surfaces early.', onFailure: 'They shut down; attitude shifts one step DOWN.' },
        { skill: 'Investigation', dc: dc + 1, onSuccess: 'Physical evidence corroborates — or contradicts — their story.', onFailure: 'Nothing seems out of place.' },
      ],
      complication,
      outcomes: [
        { label: 'Reach Friendly and deal', description: 'Full cooperation, and the secret surfaces on their own terms.' },
        { label: 'Deal at Indifferent', description: 'Terms as stated — the secret stays buried and may bite later.' },
        { label: 'Sour to Hostile', description: `The exchange collapses and word spreads — ${pick(pack.consequences, rng)}; doors that were open yesterday are barred today.` },
      ],
      reward: rewardText(levers, rng),
      attitudeTrack: track,
    };
  },
};
