// src/lib/puzzle-engines/sequence.ts
// ─── Sequence Lock ───────────────────────────────────────────────
// Real rule grammar (cycles, arithmetic, interleaving) with a
// uniqueness check: every grammar instance matching the visible
// terms must predict the same blank (spec §7.1).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import type { Difficulty } from '../noncombat/types';
import { estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface SequenceInstance {
  terms: string[];       // full sequence, blank INCLUDED at the last index
  shown: number;         // terms.length - 1
  answer: string;
  options: string[];     // 3 wrong + the answer, shuffled
  ruleText: string;      // DM-facing description of the rule
  interleaved: boolean;
  symbolSets: string[][];
}

type Rule = { produce: (i: number) => string; describe: string };

/** Every cycle rule over the given sets with period 2–4 (arrangements of distinct symbols). */
function allCycleRules(symbolSets: string[][]): Rule[] {
  const rules: Rule[] = [];
  for (const set of symbolSets) {
    for (let period = 2; period <= 4; period++) {
      const arrangements = kArrangements(set, period);
      for (const pat of arrangements) {
        rules.push({ produce: i => pat[i % period], describe: `repeats ${pat.join(' → ')}` });
      }
    }
  }
  return rules;
}

function kArrangements(set: string[], k: number): string[][] {
  const out: string[][] = [];
  const acc: string[] = [];
  const used = new Set<string>();
  const recurse = () => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (const s of set) {
      if (used.has(s)) continue;
      used.add(s); acc.push(s);
      recurse();
      acc.pop(); used.delete(s);
    }
  };
  recurse();
  return out;
}

/** Numeric arithmetic rules rendered as strings: a + i·d, a ∈ 1–9, d ∈ 1–6. */
function allArithmeticRules(): Rule[] {
  const rules: Rule[] = [];
  for (let a = 1; a <= 9; a++) {
    for (let d = 1; d <= 6; d++) {
      rules.push({ produce: i => String(a + i * d), describe: `starts at ${a} and climbs by ${d}` });
    }
  }
  return rules;
}

function ruleMatchesAt(rule: Rule, terms: string[], indices: number[]): boolean {
  return indices.every((idx, pos) => rule.produce(pos) === terms[idx]);
}

/**
 * Predictions for the blank from every grammar rule matching the visible
 * terms. For interleaved sequences only the blank's parity subsequence
 * constrains the blank, so we enumerate single rules over that parity.
 */
export function matchingPredictions(inst: SequenceInstance): Set<string> {
  const blankIdx = inst.terms.length - 1;
  const parityIndices = Array.from({ length: inst.terms.length }, (_, i) => i)
    .filter(i => (inst.interleaved ? i % 2 === blankIdx % 2 : true));
  const visible = parityIndices.filter(i => i !== blankIdx);
  const posOfBlank = parityIndices.indexOf(blankIdx);
  const candidates = [...allCycleRules(inst.symbolSets), ...allArithmeticRules()];
  const preds = new Set<string>();
  for (const rule of candidates) {
    if (ruleMatchesAt(rule, inst.terms, visible)) preds.add(rule.produce(posOfBlank));
  }
  return preds;
}

const SHOWN = { Easy: 4, Medium: 5, Hard: 6 } as const;

export function buildSequenceInstance(diff: Difficulty, symbolSets: string[][], rng: Rng): SequenceInstance {
  const shown = SHOWN[diff];
  const total = shown + 1;
  const construct = (): SequenceInstance => {
    const interleaved = diff === 'Hard';
    const set = pick(symbolSets, rng);
    const mkCycle = (minP: number, maxP: number): Rule => {
      const period = minP + Math.floor(rng() * (maxP - minP + 1));
      const pat = shuffleArray(set, rng).slice(0, period);
      return { produce: i => pat[i % period], describe: `repeats ${pat.join(' → ')}` };
    };
    let terms: string[];
    let ruleText: string;
    if (interleaved) {
      // The blank sits at an even index (last position), where only 3 even
      // terms are visible — a period-3 blank strand can never verify as
      // unique (any period-4 arrangement extending the 3 visible terms
      // also matches). Keep the blank's strand at period 2; the odd strand
      // carries the extra variety.
      const even = mkCycle(2, 2);
      const odd = mkCycle(2, 3);
      terms = Array.from({ length: total }, (_, i) =>
        i % 2 === 0 ? even.produce(i / 2) : odd.produce((i - 1) / 2));
      ruleText = `two interleaved patterns — even positions ${even.describe}; odd positions ${odd.describe}`;
    } else {
      const useArith = diff === 'Medium' && rng() < 0.4;
      const rule = useArith
        ? (() => { const a = 1 + Math.floor(rng() * 9); const d = 1 + Math.floor(rng() * 6); return { produce: (i: number) => String(a + i * d), describe: `starts at ${a} and climbs by ${d}` }; })()
        : mkCycle(diff === 'Easy' ? 2 : 3, diff === 'Easy' ? 3 : 4);
      terms = Array.from({ length: total }, (_, i) => rule.produce(i));
      ruleText = rule.describe;
    }
    const inst: SequenceInstance = { terms, shown, answer: terms[total - 1], options: [], ruleText, interleaved, symbolSets };
    // Distractors stay in the answer's domain: symbols for symbol
    // sequences, numbers for numeric ones. Never equal to the answer —
    // and since the blank's prediction is verified unique below, no
    // distractor can satisfy any matching rule.
    const numeric = /^\d+$/.test(inst.answer);
    const wrongPool = numeric
      ? ['3', '7', '11', '13', '21'].filter(x => x !== inst.answer)
      : set.filter(s => s !== inst.answer);
    inst.options = shuffleArray([inst.answer, ...shuffleArray(wrongPool, rng).slice(0, 3)], rng);
    return inst;
  };
  return verified(
    100,
    construct,
    inst => {
      const preds = matchingPredictions(inst);
      return preds.size === 1 && [...preds][0] === inst.answer;
    },
    () => {
      // Canonical: strict 2-cycle over the first set — unique because any
      // matching cycle/arithmetic rule reproduces the same alternation.
      const set = symbolSets[0];
      const terms = Array.from({ length: total }, (_, i) => set[i % 2]);
      return {
        terms, shown, answer: terms[total - 1],
        options: [terms[total - 1], set[2 % set.length], set[3 % set.length], '7'],
        ruleText: `repeats ${set[0]} → ${set[1]}`,
        interleaved: false, symbolSets,
      };
    },
  );
}

export const sequenceLock: PuzzleFamily = {
  key: 'sequence-lock',
  label: 'The Unfinished Pattern',
  categories: ['logic'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const inst = buildSequenceInstance(levers.difficulty, pack.symbolSets, rng);
    const blankIdx = inst.terms.length - 1;
    const allHints = [
      `Say the sequence out loud — rhythm exposes repetition.`,
      inst.interleaved
        ? `Read every OTHER symbol: two separate patterns are woven together.`
        : `Look for where the pattern starts over.`,
      `The rule: it ${inst.ruleText}. (Give this only as a last resort.)`,
      `Wrong stones do nothing but click; there is no penalty for reasoning aloud first.`,
    ];
    return {
      name: 'The Unfinished Pattern',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A sequence of carved symbols with the final position empty. The pattern ${inst.ruleText}. Answer: ${inst.answer}. Wrong options offered nearby: ${inst.options.filter(o => o !== inst.answer).join(', ')}.`,
      readAloud: `Along the ${pick(pack.materials, rng)} lintel runs a line of carvings — ${inst.terms.slice(0, -1).join(', ')} — and then an empty socket. Below, a tray holds loose stones: ${inst.options.join(', ')}.`,
      handout: { kind: 'symbol-sequence', symbols: inst.terms, blanks: [blankIdx], options: inst.options },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The missing symbol is ${inst.answer} — the pattern ${inst.ruleText}.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong stone sets the whole lintel humming angrily.', save: 'CON' }),
      reward: rewardText(levers, rng),
    };
  },
};
