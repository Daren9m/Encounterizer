// ─── Knights & Knaves ────────────────────────────────────────────
// Guardians who only tell the truth or only lie. Constructed from a
// random truth assignment; brute-force verified to have exactly one
// consistent assignment (spec §7.1).

import { pickRandom as pick } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export type KkKind = 'accuse-liar' | 'accuse-knight' | 'same-kind' | 'different-kind';
export interface KkStatement { speaker: number; target: number; kind: KkKind }
export interface KkInstance { n: number; statements: KkStatement[]; solution: boolean[] }

function statementHolds(s: KkStatement, t: boolean[]): boolean {
  switch (s.kind) {
    case 'accuse-liar': return t[s.target] === false;
    case 'accuse-knight': return t[s.target] === true;
    case 'same-kind': return t[s.speaker] === t[s.target];
    case 'different-kind': return t[s.speaker] !== t[s.target];
  }
}

export function consistentAssignments(n: number, statements: KkStatement[]): boolean[][] {
  const out: boolean[][] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const t = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
    // A knight's statement is true; a liar's statement is false.
    if (statements.every(s => statementHolds(s, t) === t[s.speaker])) out.push(t);
  }
  return out;
}

const FLIP: Record<KkKind, KkKind> = {
  'accuse-liar': 'accuse-knight',
  'accuse-knight': 'accuse-liar',
  'same-kind': 'different-kind',
  'different-kind': 'same-kind',
};

/** A statement consistent-by-construction with the target assignment. */
function drawStatement(n: number, truth: boolean[], speaker: number, rng: Rng): KkStatement {
  const targets = Array.from({ length: n }, (_, i) => i).filter(i => i !== speaker);
  const target = pick(targets, rng);
  const kind = pick(['accuse-liar', 'accuse-knight', 'same-kind', 'different-kind'] as KkKind[], rng);
  const s: KkStatement = { speaker, target, kind };
  // A knight must speak truth, a liar must speak falsehood — flip if mismatched.
  if (statementHolds(s, truth) !== truth[speaker]) s.kind = FLIP[kind];
  return s;
}

export function buildKkInstance(n: number, rng: Rng): KkInstance {
  return verified(
    100,
    () => {
      const mask = Math.floor(rng() * (1 << n));
      const truth = Array.from({ length: n }, (_, i) => Boolean(mask & (1 << i)));
      const statements = Array.from({ length: n }, (_, sp) => drawStatement(n, truth, sp, rng));
      // Add up to 2 extra statements while ambiguous.
      for (let extra = 0; extra < 2 && consistentAssignments(n, statements).length > 1; extra++) {
        statements.push(drawStatement(n, truth, Math.floor(rng() * n), rng));
      }
      return { n, statements, solution: truth };
    },
    inst => consistentAssignments(inst.n, inst.statements).length === 1,
    // Canonical 2-speaker instance, unique by enumeration:
    // A: "B and I are not alike." B: "A always lies."  ⇒ A knight, B liar.
    () => ({
      n: 2,
      statements: [
        { speaker: 0, target: 1, kind: 'different-kind' },
        { speaker: 1, target: 0, kind: 'accuse-liar' },
      ],
      solution: [true, false],
    }),
  );
}

const STATEMENT_TEXT: Record<KkKind, (a: string, b: string) => string> = {
  'accuse-liar': (_a, b) => `"${b} always lies."`,
  'accuse-knight': (_a, b) => `"${b} speaks only truth."`,
  'same-kind': (_a, b) => `"${b} and I are of one nature."`,
  'different-kind': (_a, b) => `"${b} and I are not alike."`,
};

const SPEAKERS_BY_DIFF = { Easy: 2, Medium: 3, Hard: 4 } as const;

export const knightsKnaves: PuzzleFamily = {
  key: 'knights-knaves',
  label: 'The Truthful and the False',
  categories: ['logic'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const n = SPEAKERS_BY_DIFF[levers.difficulty];
    const inst = buildKkInstance(n, rng);
    const pack = levers.theme;
    const material = (i: number) => pack.materials[i % pack.materials.length];
    const names = Array.from({ length: inst.n }, (_, i) => `the ${material(i)} guardian`);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const lines = inst.statements.map(s => `${cap(names[s.speaker])} intones: ${STATEMENT_TEXT[s.kind](names[s.speaker], names[s.target])}`);
    const verdict = inst.solution.map((t, i) => `${cap(names[i])} ${t ? 'tells the truth' : 'lies'}`).join('; ');
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    // The Insight hint must not invent a liar when the unique solution is
    // all-knights (common at 2 speakers) — that would misdirect the table.
    const firstLiar = inst.solution.findIndex(t => !t);
    const insightHint = firstLiar >= 0
      ? `DC ${dc} Insight: one guardian's delivery falters — ${names[firstLiar]} seems rehearsed.`
      : `DC ${dc} Insight: not one of the guardians falters — perhaps every one of them speaks true.`;
    const allHints = [
      `Pick one guardian, assume it speaks truth, and follow the chain — a contradiction means the assumption was wrong.`,
      `A liar's claim about another guardian is always false: invert it and it becomes evidence.`,
      insightHint,
      `Only one combination of truth-tellers and liars fits every statement at once. Test them methodically.`,
    ];
    return {
      name: 'The Truthful and the False',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `${inst.n} guardians; each only tells the truth or only lies. Statements are consistent with exactly one assignment: ${verdict}. The party must name each guardian's nature to pass.`,
      readAloud: `${cap(pick(pack.descriptors, rng))} figures of ${pick(pack.materials, rng)} bar the way — ${pack.sensory[0]}. As you approach, they speak in turn:\n\n${lines.join('\n')}`,
      handout: { kind: 'text', title: 'The Guardians Speak', body: lines.join('\n') },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `${verdict}. Declaring each guardian's nature correctly causes them to stand aside.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong declaration draws a lash of force from the guardians.', save: 'DEX' }),
      reward: rewardText(levers, rng),
      dmAdjudication: `Accept any correct assignment however phrased. If players interrogate further, guardians repeat their statements verbatim — liars lie, truth-tellers answer truthfully.`,
    };
  },
};
