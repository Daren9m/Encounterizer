// src/lib/puzzle-engines/rune-lock.ts
// ─── Rune Lock (Mastermind deduction) ────────────────────────────
// Dead adventurers' previous attempts, each with feedback, narrow the
// combination space to exactly one answer (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, RUNE_GLYPHS, cap, withArticle } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface RuneLockInstance {
  n: number;                     // rune vocabulary size
  k: number;                     // slots
  secret: number[];              // k distinct indices into 0..n-1
  attempts: { guess: number[]; exact: number; near: number }[];
}

export function feedback(guess: number[], secret: number[]): { exact: number; near: number } {
  let exact = 0;
  let shared = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) exact++;
    if (secret.includes(guess[i])) shared++;
  }
  return { exact, near: shared - exact };
}

function kPermutations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const acc: number[] = [];
  const used = Array(n).fill(false);
  const recurse = () => {
    if (acc.length === k) { out.push([...acc]); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; acc.push(i);
      recurse();
      acc.pop(); used[i] = false;
    }
  };
  recurse();
  return out;
}

export function consistentCandidates(inst: RuneLockInstance): number[][] {
  return kPermutations(inst.n, inst.k).filter(cand =>
    inst.attempts.every(a => {
      const f = feedback(a.guess, cand);
      return f.exact === a.exact && f.near === a.near;
    }),
  );
}

function drawKDistinct(n: number, k: number, rng: Rng): number[] {
  return shuffleArray(Array.from({ length: n }, (_, i) => i), rng).slice(0, k);
}

export function buildRuneLockInstance(n: number, k: number, attemptCount: number, rng: Rng): RuneLockInstance {
  return verified(
    100,
    () => {
      const secret = drawKDistinct(n, k, rng);
      const attempts: RuneLockInstance['attempts'] = [];
      while (attempts.length < attemptCount) {
        const guess = drawKDistinct(n, k, rng);
        if (guess.every((g, i) => g === secret[i])) continue; // never show the answer
        const f = feedback(guess, secret);
        attempts.push({ guess, ...f });
      }
      return { n, k, secret, attempts };
    },
    inst => consistentCandidates(inst).length === 1,
    // Deterministic canonical: keep appending lexicographic guesses until
    // only the secret survives (guaranteed — with every permutation used
    // as an attempt, only the secret matches all feedback).
    () => {
      const secret = Array.from({ length: k }, (_, i) => i);
      const inst: RuneLockInstance = { n, k, secret, attempts: [] };
      for (const guess of kPermutations(n, k)) {
        if (guess.every((g, i) => g === secret[i])) continue;
        inst.attempts.push({ guess, ...feedback(guess, secret) });
        if (inst.attempts.length >= attemptCount && consistentCandidates(inst).length === 1) break;
      }
      return inst;
    },
  );
}

const PARAMS = { Easy: [4, 3, 3], Medium: [5, 3, 4], Hard: [6, 4, 4] } as const;

export const runeLock: PuzzleFamily = {
  key: 'rune-lock',
  label: 'The Rune-Sealed Lock',
  categories: ['logic', 'physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [n, k, attemptCount] = PARAMS[levers.difficulty];
    const inst = buildRuneLockInstance(n, k, attemptCount, rng);
    const pack = levers.theme;
    const runes = RUNE_GLYPHS.slice(0, n);
    const show = (idxs: number[]) => idxs.map(i => runes[i]).join(' ');
    const fbText = (a: { exact: number; near: number }) =>
      `${a.exact} blaze steady (right rune, right place), ${a.near} flicker (right rune, wrong place)`;
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    // A slot where the first attempt is wrong — guaranteed to exist,
    // because no stored guess equals the secret. (Never point players at a
    // slot the attempt got RIGHT, and never claim unseen runes are safe to
    // rule out — the secret may contain a never-guessed rune.)
    const wrongSlot = inst.attempts[0].guess.findIndex((g, j) => g !== inst.secret[j]);
    const allHints = [
      `Each dead attempt is information: the glow marks tell you how close it came.`,
      `Any rune in an attempt that drew no glow at all cannot be in the answer.`,
      `DC ${dc} Investigation: scratch-tallies beside the first attempt cross out ${runes[inst.attempts[0].guess[wrongSlot]]} in position ${wrongSlot + 1} — it does not belong there.`,
      `Only one combination agrees with every attempt's feedback at once.`,
    ];
    return {
      name: 'The Rune-Sealed Lock',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A ${k}-rune combination lock (${n} runes available, no repeats). Previous attempts and their feedback are carved beside it; exactly one combination fits all of them. Answer: ${show(inst.secret)}.`,
      readAloud: `${cap(withArticle(pack.descriptors[0]))} door of ${pack.materials[0]} bears ${k} empty sockets and a tray of carved runes — ${pack.sensory[2] ?? pack.sensory[0]}. Someone has been here before you: failed attempts are scratched into the wall, each with its runes marked by the door's answering glow.`,
      handout: {
        kind: 'attempts-ledger',
        attempts: inst.attempts.map(a => ({ guess: a.guess.map(g => runes[g]), feedback: fbText(a) })),
        runeSet: runes,
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The combination is ${show(inst.secret)}. Reasoning: it is the only ${k}-rune arrangement consistent with every carved attempt's feedback.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong combination makes the sockets flare.', save: 'DEX' }),
      reward: rewardText(levers, rng),
    };
  },
};
