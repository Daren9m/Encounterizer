// src/lib/puzzle-engines/riddle-frames.ts
// ─── Riddle Frames ───────────────────────────────────────────────
// Corpus-driven riddles in three presentations: the riddle door
// (word) and the sphinx duel / best-of-3 contest (minigame).

import { shuffleArray, pickRandom as pick } from '../random';
import { RIDDLES, type RiddleEntry } from '../../data/riddles';
import type { Difficulty, ThemeId } from '../noncombat/types';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, cap, withArticle } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

export function riddlePool(diff: Difficulty, themeId: ThemeId): RiddleEntry[] {
  const allowed = diff === 'Easy' ? [1] : diff === 'Medium' ? [1, 2] : [2, 3];
  const byObscurity = RIDDLES.filter(r => allowed.includes(r.obscurity));
  const themed = byObscurity.filter(r => r.themes.length === 0 || r.themes.includes(themeId));
  return themed.length >= 5 ? themed : byObscurity;
}

const ADJUDICATION =
  'Accept the listed answer or any listed alternate; accept close synonyms generously. ' +
  'A clever wrong answer that fits every line deserves a "the door considers… and approves" — reward play, not mind-reading. ' +
  'If the table stalls, let a hint check reframe one line of the riddle in plainer words.';

export const riddleFrames: PuzzleFamily = {
  key: 'riddle-frames',
  label: 'Riddles',
  categories: ['word', 'minigame'],
  generate({ levers, rng, category }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const pool = shuffleArray(riddlePool(levers.difficulty, pack.id), rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    if (category !== 'minigame') {
      // ── The Riddle Door ──
      const r = pool[0];
      const alts = r.altAnswers.length ? ` (also accept: ${r.altAnswers.join(', ')})` : '';
      const allHints = [
        `DC ${dc} Investigation: carvings around the door depict scenes related to the answer.`,
        `The voice repeats one phrase of the riddle with heavy emphasis — reread the key line aloud.`,
        `DC ${dc - 2} History: riddle-doors of this kind favor humble, everyday answers over grand ones.`,
        `Restate the riddle line by line in plain words; the answer usually hides in the plainest line.`,
      ];
      return {
        name: 'The Riddle Door',
        estimatedMinutes: estimatedMinutes(levers.timeBudget),
        dmBrief: `A speaking door poses a riddle. Answer: "${r.answer}"${alts}. Origin: ${r.origin}.`,
        readAloud: `${cap(withArticle(`${pick(pack.descriptors, rng)} door of ${pick(pack.materials, rng)}`))} bars the way — ${pack.sensory[0]}. A carved face opens its eyes and speaks:\n\n"${r.text}"`,
        handout: { kind: 'text', title: 'The Door Speaks', body: `"${r.text}"` },
        hints: allHints.slice(0, hintCount(levers.timeBudget)),
        solution: `The answer is "${r.answer}"${alts}. Speaking it opens the door.`,
        failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'Three wrong answers make the door exhale a punishing gust.', save: 'DEX' }),
        reward: rewardText(levers, rng),
        dmAdjudication: ADJUDICATION,
      };
    }
    // ── The Sphinx Duel (best of 3) ──
    const three = pool.slice(0, 3);
    const challenger = pick(pack.cast, rng);
    const riddleList = three.map((r, i) => `${i + 1}. "${r.text}" — answer: ${r.answer}${r.altAnswers.length ? ` (or: ${r.altAnswers.join(', ')})` : ''}`).join('\n');
    const stakes = levers.partySize > 1
      ? `The party may confer, but only one voice may answer each riddle — a different speaker each round, so ${Math.min(levers.partySize, 3)} of them must step up.`
      : 'The lone challenger answers all three.';
    const allHints = [
      `The duelist is bound by old law: riddles must be answerable, and a correct answer must be honored.`,
      `DC ${dc} Insight: the duelist's tail flicks when an answer lands close — press on in that direction.`,
      `Asking for one riddle to be repeated is customary and free; asking twice costs a point.`,
      `The party may pose the duelist a riddle of their own for the tiebreaker — improvise its answer honestly.`,
    ];
    return {
      name: 'The Riddle Duel',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `${cap(challenger)} challenges the party to a riddle duel, best of 3. ${stakes}\n${riddleList}`,
      readAloud: `${cap(challenger)} regards you with ancient amusement. "A game, then. Three riddles. Answer true and pass with my blessing; fail, and pay my price."`,
      handout: { kind: 'text', title: 'Terms of the Duel', body: `Best of 3 riddles.\nConfer freely; one voice answers.\nA repeat may be asked once, free.` },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The riddles and answers:\n${riddleList}`,
      failureConsequence: failureText(levers, rng, { kind: 'climactic', context: 'Losing the duel invokes the price.', save: undefined }),
      reward: rewardText(levers, rng),
      dmAdjudication: ADJUDICATION,
    };
  },
};
