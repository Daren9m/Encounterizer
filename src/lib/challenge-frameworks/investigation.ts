// src/lib/challenge-frameworks/investigation.ts
// ─── Investigation ───────────────────────────────────────────────
// Generated truth + a clue web honoring the three-clue rule: every
// revelation node carries 3 clues on 3 distinct discovery vectors;
// exactly one red herring ships with its disconfirming clue (spec §8.6).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { INVESTIGATION_FRAMES } from '../../data/noncombat-scenarios';
import { dcFor } from '../noncombat/levers';
import { cap, rewardText } from '../noncombat/theming';
import type { ClueVector, ClueWeb, ResolvedLevers } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput } from './frame';

const NODE_COUNT = { quick: 2, standard: 3, 'set-piece': 4 } as const;
const VECTORS: ClueVector[] = ['scene', 'npc', 'document', 'observation'];

// Vector template × difficulty register. Easy names things plainly;
// Hard gestures at them.
const CLUE_TEXT: Record<ClueVector, { direct: (d: ClueDetail) => string; oblique: (d: ClueDetail) => string }> = {
  scene: {
    direct: d => `At the scene: ${d.material} residue that traces straight to ${d.subject}.`,
    oblique: d => `At the scene: a smear of ${d.material} where no ${d.material} belongs.`,
  },
  npc: {
    direct: d => `${cap(d.witness)} saw it and will say so: it points to ${d.subject}.`,
    oblique: d => `${cap(d.witness)} keeps changing one detail of their story — the same detail every time.`,
  },
  document: {
    direct: d => `A ledger entry in a hurried hand names ${d.subject} outright.`,
    oblique: d => `A page has been razored from the ledger — the stub still shows half a word.`,
  },
  observation: {
    direct: d => `Watch ${d.subject} for an hour and the routine breaks exactly where the crime needed it to.`,
    oblique: d => `Someone's routine changed the day it happened — small, but it never changed before.`,
  },
};

interface ClueDetail { material: string; witness: string; subject: string }

export function buildClueWeb(levers: ResolvedLevers, rng: Rng): ClueWeb {
  const pack = levers.theme;
  const frame = pick(INVESTIGATION_FRAMES, rng);
  const cast = shuffleArray(pack.cast, rng);
  const culprit = cast[0];
  const innocent = cast[1];
  const witnessPool = cast.slice(2);
  const method = pick(frame.methods, rng);
  const motive = pick(frame.motives, rng);
  const register = levers.difficulty === 'Easy' ? 'direct' as const
    : levers.difficulty === 'Hard' ? 'oblique' as const
    : undefined; // Medium mixes per clue
  const revelations = [
    `What happened: ${frame.crime}.`,
    `How: ${method}.`,
    `Why: ${motive}.`,
    `Who: ${culprit} did it.`,
  ];
  const count = NODE_COUNT[levers.timeBudget];
  // Culprit node is always last: take the first (count-1) revelations + the final one.
  const chosen = [...revelations.slice(0, count - 1), revelations[3]];
  const nodes = chosen.map(revelation => {
    const vectors = shuffleArray(VECTORS, rng).slice(0, 3);
    return {
      revelation,
      clues: vectors.map(vector => {
        const detail: ClueDetail = {
          material: pick(pack.materials, rng),
          witness: pick(witnessPool, rng),
          subject: revelation.startsWith('Who:') ? culprit : 'the culprit',
        };
        const reg = register ?? pick(['direct', 'oblique'] as const, rng);
        return { text: CLUE_TEXT[vector][reg](detail), vector, pointsTo: revelation };
      }),
    };
  });
  return {
    truth: { culprit, method, motive },
    nodes,
    redHerring: levers.difficulty === 'Hard'
      ? {
          text: `Suspicion drifts toward ${innocent} — nothing damning, just a pattern of small absences no one can quite account for.`,
          disconfirmedBy: `Only a reconstructed timeline clears them: ${pick(witnessPool, rng)} can place them elsewhere, but only if asked exactly the right question.`,
        }
      : {
          text: `Suspicion falls naturally on ${innocent} — they had the opportunity and no alibi they will share.`,
          disconfirmedBy: `Press the timeline: ${innocent} can be placed elsewhere at the decisive moment by ${pick(witnessPool, rng)}.`,
        },
  };
}

export const investigation: ChallengeFramework = {
  key: 'investigation',
  label: 'Investigation',
  description: 'A generated truth behind a clue web — three clues per revelation, one red herring',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const web = buildClueWeb(levers, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const cards = shuffleArray(
      [
        ...web.nodes.flatMap((n, ni) => n.clues.map((c, ci) => ({ title: `Clue ${ni + 1}.${ci + 1}`, body: c.text, vector: c.vector }))),
        { title: 'A loose thread', body: web.redHerring.text, vector: 'npc' },
      ],
      rng,
    );
    return {
      name: `The ${pick(['Vanished', 'Poisoned', 'Forged', 'Stolen', 'Silenced'], rng)} ${pick(['Ledger', 'Heirloom', 'Witness', 'Seal', 'Promise'], rng)}`,
      readAloud: `${cap(levers.theme.sensory[4] ?? levers.theme.sensory[0])}. Something happened here, and everyone who knows is pretending they do not.`,
      situation: `Revelation web (each node needs only ONE of its three clues to open, per the three-clue rule):\n${web.nodes.map((n, i) => `${i + 1}. ${n.revelation} (clues via ${n.clues.map(c => c.vector).join(', ')})`).join('\n')}`,
      stakes: `Truth: ${web.truth.culprit} — ${web.truth.method}; motive: ${web.truth.motive}. Red herring: ${web.redHerring.text} Disconfirmed by: ${web.redHerring.disconfirmedBy}`,
      skillChecks: [
        { skill: 'Investigation', dc, onSuccess: 'A scene or document clue surfaces (hand over the matching card).', onFailure: 'Time passes; the trail cools.' },
        { skill: 'Insight', dc, onSuccess: 'An npc clue surfaces — someone\'s composure cracks.', onFailure: 'The witness holds their line.' },
        { skill: 'Perception', dc: dc - 2, onSuccess: 'An observation clue surfaces.', onFailure: 'The detail hides in plain sight.' },
        { skill: 'Persuasion', dc, onSuccess: 'A reluctant witness commits to their account on the record.', onFailure: 'They want protection before they talk.' },
      ],
      complication: `Accusing the wrong person burns trust: after a false accusation, all social DCs rise by 2 for the rest of the investigation.`,
      outcomes: [
        { label: 'The truth, proven', description: 'Culprit named with at least one clue per opened node — no rebuttal stands.' },
        { label: 'The truth, unproven', description: 'Right name, thin proof — the culprit counterattacks socially or flees.' },
        { label: 'The red herring accused', description: 'The innocent suffers, the culprit walks, and the disconfirming clue becomes the road back.' },
      ],
      reward: rewardText(levers, rng),
      clueWeb: web,
      handout: { kind: 'clue-cards', cards },
    };
  },
};
