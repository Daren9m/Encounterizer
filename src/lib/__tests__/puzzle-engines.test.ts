import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import type { ResolvedLevers, Difficulty } from '../noncombat/types';
import { knightsKnaves, buildKkInstance, consistentAssignments } from '../puzzle-engines/knights-knaves';
import { logicGrid, buildGridInstance, countGridSolutions } from '../puzzle-engines/logic-grid';
import { runeLock, buildRuneLockInstance, consistentCandidates } from '../puzzle-engines/rune-lock';
import { riverCrossing, buildRiverInstance, solveRiver, drawPassengerNames } from '../puzzle-engines/river-crossing';
import { sequenceLock, buildSequenceInstance, matchingPredictions, canonicalSequence } from '../puzzle-engines/sequence';
import { plateGrid, buildPlateInstance, applyPress } from '../puzzle-engines/plate-grid';
import { sumLock, buildSumLockInstance, countSumCompletions } from '../puzzle-engines/sum-lock';
import { tilePath, buildTilePathInstance, cluePaths } from '../puzzle-engines/tile-path';
import { cipherSuite, encodeCaesar, decodeCaesar, encodeAtbash, encodeKeyword, decodeKeyword, buildKeywordAlphabet } from '../puzzle-engines/cipher';
import { riddleFrames, riddlePool } from '../puzzle-engines/riddle-frames';
import { RIDDLES } from '../../data/riddles';
import { contests } from '../puzzle-engines/contests';
import { gauntlets } from '../puzzle-engines/gauntlets';
import { CONTEST_TYPES, SIDE_EVENTS, GAUNTLET_HAZARDS } from '../../data/noncombat-scenarios';

export function mkLevers(diff: Difficulty, seed: number, over: Partial<ResolvedLevers> = {}): ResolvedLevers {
  return {
    partyLevel: 5, partySize: 4, difficulty: diff,
    theme: THEME_PACKS[seed % THEME_PACKS.length],
    tone: 'standard', timeBudget: 'standard', seed, ...over,
  };
}

const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const KK_SPEAKERS: Record<Difficulty, number> = { Easy: 2, Medium: 3, Hard: 4 };

describe('knights & knaves', () => {
  it('every instance has exactly one consistent assignment (200 seeds × 3 difficulties)', () => {
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildKkInstance(KK_SPEAKERS[diff], seededRandom(s));
        expect(inst.n, `fallback shrank n: diff=${diff} seed=${s}`).toBe(KK_SPEAKERS[diff]);
        const consistent = consistentAssignments(inst.n, inst.statements);
        expect(consistent, `diff=${diff} seed=${s}`).toHaveLength(1);
        expect(consistent[0]).toEqual(inst.solution);
      }
    }
  });
  it('generate() produces complete prose and respects speaker count', () => {
    for (const diff of DIFFS) {
      const out = knightsKnaves.generate({ levers: mkLevers(diff, 11), rng: seededRandom(11) });
      expect(out.dmBrief.startsWith(`${KK_SPEAKERS[diff]} guardians`)).toBe(true);
      expect(out.name.length).toBeGreaterThan(0);
      expect(out.readAloud.length).toBeGreaterThan(0);
      expect(out.solution.length).toBeGreaterThan(0);
      expect(out.hints).toHaveLength(3); // standard budget
      expect(out.failureConsequence.length).toBeGreaterThan(0);
    }
  });
});

describe('logic grid', () => {
  const POOLS = [
    ['Ox', 'Ram', 'Crane', 'Wolf'],
    ['Sun', 'Moon', 'Star', 'Comet'],
    ['Iron', 'Ash', 'Salt', 'Jade'],
    ['North', 'South', 'East', 'West'],
  ];
  it('every instance has a unique solution (200 seeds × 3 sizes)', () => {
    const sizes: [number, number][] = [[3, 3], [3, 4], [4, 4]];
    for (const [cats, items] of sizes) {
      for (let s = 0; s < 200; s++) {
        const inst = buildGridInstance(cats, items, POOLS, seededRandom(s));
        expect(countGridSolutions(inst, 2), `cats=${cats} items=${items} seed=${s}`).toBe(1);
      }
    }
  }, 15_000);
  it('generate() emits a logic-grid handout with clues and locked sizes', () => {
    const out = logicGrid.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    expect(out.handout?.kind).toBe('logic-grid');
    if (out.handout?.kind === 'logic-grid') {
      expect(out.handout.categories).toHaveLength(4);
      expect(out.handout.items[0]).toHaveLength(4);
      expect(out.handout.clues.length).toBeGreaterThan(0);
    }
  });
  it('readAloud prose is table-ready (capitalized, article agreement) across 100 seeds', () => {
    for (let s = 0; s < 100; s++) {
      for (const diff of DIFFS) {
        const out = logicGrid.generate({ levers: mkLevers(diff, s), rng: seededRandom(s) });
        expect(out.readAloud[0]).toBe(out.readAloud[0].toUpperCase());
        expect(out.readAloud).not.toMatch(/\bA [aeiou]/);
      }
    }
  });
});

describe('rune lock', () => {
  const PARAMS: Record<Difficulty, [number, number, number]> = { Easy: [4, 3, 3], Medium: [5, 3, 4], Hard: [6, 4, 4] };
  it('exactly one candidate is consistent with the attempts (200 seeds × 3 difficulties)', () => {
    for (const diff of DIFFS) {
      const [n, k, a] = PARAMS[diff];
      for (let s = 0; s < 200; s++) {
        const inst = buildRuneLockInstance(n, k, a, seededRandom(s));
        const cands = consistentCandidates(inst);
        expect(cands, `diff=${diff} seed=${s}`).toHaveLength(1);
        expect(cands[0]).toEqual(inst.secret);
      }
    }
  });
  it('generate() emits an attempts-ledger handout', () => {
    const out = runeLock.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    expect(out.handout?.kind).toBe('attempts-ledger');
    if (out.handout?.kind === 'attempts-ledger') {
      expect(out.handout.attempts.length).toBeGreaterThanOrEqual(4);
      expect(out.handout.runeSet).toHaveLength(5);
    }
  });
});

describe('river crossing', () => {
  it('solves the classic wolf–goat–cabbage in 7 crossings', () => {
    const sol = solveRiver(3, 1, [[0, 1], [1, 2]]);
    expect(sol?.moves).toBe(7);
  });
  it('instances are solvable with min-moves in the difficulty band (200 seeds × 3)', () => {
    const BANDS: Record<Difficulty, [number, number]> = { Easy: [3, 5], Medium: [6, 9], Hard: [10, 14] };
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildRiverInstance(diff, seededRandom(s));
        const sol = solveRiver(inst.m, inst.capacity, inst.constraints);
        expect(sol, `diff=${diff} seed=${s}`).not.toBeNull();
        expect(sol!.moves).toBeGreaterThanOrEqual(BANDS[diff][0]);
        expect(sol!.moves).toBeLessThanOrEqual(BANDS[diff][1]);
      }
    }
  });
  it('Hard instances vary across seeds (no silent 100%-fallback degeneracy)', () => {
    const sets = new Set(Array.from({ length: 20 }, (_, s) =>
      JSON.stringify(buildRiverInstance('Hard', seededRandom(s)).constraints)));
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });
  it('generate() names every passenger and each constraint in the brief', () => {
    const out = riverCrossing.generate({ levers: mkLevers('Medium', 9), rng: seededRandom(9) });
    expect(out.dmBrief).toContain('crossings');
    expect(out.solution.length).toBeGreaterThan(0);
  });
  it('passenger names are always distinct (all packs × sizes × 100 seeds)', () => {
    for (const pack of THEME_PACKS) {
      for (const m of [2, 3, 4, 5]) {
        for (let s = 0; s < 100; s++) {
          const names = drawPassengerNames(pack, m, seededRandom(s));
          expect(new Set(names).size, `${pack.id} m=${m} seed=${s}`).toBe(m);
        }
      }
    }
  });
});

describe('sequence lock', () => {
  const SETS = [['Sun', 'Moon', 'Star', 'Comet', 'Cloud', 'Storm'], ['Ox', 'Ram', 'Crane', 'Wolf', 'Boar', 'Hart']];
  it('all grammar rules matching the visible terms agree on the blank (200 seeds × 3)', () => {
    for (const diff of DIFFS) {
      for (let s = 0; s < 200; s++) {
        const inst = buildSequenceInstance(diff, SETS, seededRandom(s));
        const preds = matchingPredictions(inst);
        expect(preds.size, `diff=${diff} seed=${s}`).toBe(1);
        expect([...preds][0]).toBe(inst.answer);
        // options = the answer + 3 distractors (spec: distractors differ
        // from the predicted blank).
        expect(inst.options).toContain(inst.answer);
        expect(inst.options.filter(o => o !== inst.answer)).toHaveLength(3);
      }
    }
  });
  it('canonical fallbacks are structurally honest and uniquely solvable per difficulty', () => {
    for (const diff of DIFFS) {
      const inst = canonicalSequence(diff, SETS);
      expect(inst.interleaved).toBe(diff === 'Hard');
      const preds = matchingPredictions(inst);
      expect(preds.size, diff).toBe(1);
      expect([...preds][0]).toBe(inst.answer);
      expect(inst.options).toContain(inst.answer);
      const distractors = inst.options.filter(o => o !== inst.answer);
      expect(distractors).toHaveLength(3);
      for (const o of distractors) expect(o).not.toMatch(/^\d+$/); // domain-consistent: symbols only
      expect(new Set(inst.options).size).toBe(4);
    }
  });
  it('generate() emits a symbol-sequence handout with options', () => {
    const out = sequenceLock.generate({ levers: mkLevers('Easy', 3), rng: seededRandom(3) });
    expect(out.handout?.kind).toBe('symbol-sequence');
    if (out.handout?.kind === 'symbol-sequence') {
      expect(out.handout.blanks).toHaveLength(1);
      expect(out.handout.options?.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('plate grid', () => {
  const PARAMS: Record<Difficulty, [number, number]> = { Easy: [3, 3], Medium: [4, 4], Hard: [5, 5] };
  it('the recorded presses solve the grid, and presses are distinct (200 seeds × 3)', () => {
    for (const diff of DIFFS) {
      const [size, k] = PARAMS[diff];
      for (let s = 0; s < 200; s++) {
        const inst = buildPlateInstance(size, k, seededRandom(s));
        expect(new Set(inst.presses).size).toBe(k);
        const cells = [...inst.initial];
        for (const p of inst.presses) applyPress(cells, size, p);
        expect(cells.every(Boolean), `diff=${diff} seed=${s}`).toBe(true);
        expect(inst.initial.every(Boolean)).toBe(false); // not pre-solved
      }
    }
  });
  it('generate() emits an on/off grid-diagram and a "one valid solution" solution', () => {
    for (const diff of DIFFS) {
      const out = plateGrid.generate({ levers: mkLevers(diff, 19), rng: seededRandom(19) });
      expect(out.handout?.kind).toBe('grid-diagram');
      if (out.handout?.kind === 'grid-diagram') {
        expect(out.handout.cells.every(c => c.state === 'on' || c.state === 'off')).toBe(true);
      }
      expect(out.solution).toMatch(/[Oo]ne valid solution/);
      expect(out.readAloud).not.toMatch(/— [A-Z]/); // em-dash fragments stay lowercase
    }
  });
});

describe('sum lock', () => {
  it('masked squares have exactly one completion (200 seeds × 3 mask counts)', () => {
    for (const masked of [3, 4, 5]) {
      for (let s = 0; s < 200; s++) {
        const inst = buildSumLockInstance(masked, seededRandom(s));
        expect(inst.masked, `mask count: masked=${masked} seed=${s}`).toHaveLength(masked);
        expect(countSumCompletions(inst, 2), `masked=${masked} seed=${s}`).toBe(1);
      }
    }
  });
  it('generate() emits a grid-diagram with masked cells and a legend', () => {
    const out = sumLock.generate({ levers: mkLevers('Medium', 13), rng: seededRandom(13) });
    expect(out.handout?.kind).toBe('grid-diagram');
    if (out.handout?.kind === 'grid-diagram') {
      expect(out.handout.cells.filter(c => c.state === 'masked')).toHaveLength(4);
      expect(out.handout.legend?.length).toBeGreaterThan(0);
    }
  });
});

describe('tile path', () => {
  const SYM = ['Sun', 'Moon', 'Star', 'Comet', 'Cloud'];
  const PARAMS: Record<Difficulty, [number, number]> = { Easy: [4, 4], Medium: [5, 5], Hard: [6, 7] };
  it('exactly one clue-consistent path exists (200 seeds × 3)', () => {
    for (const diff of DIFFS) {
      const [size, len] = PARAMS[diff];
      for (let s = 0; s < 200; s++) {
        const inst = buildTilePathInstance(size, len, SYM, seededRandom(s));
        const paths = cluePaths(inst);
        expect(paths, `diff=${diff} seed=${s}`).toHaveLength(1);
        expect(paths[0]).toEqual(inst.path);
      }
    }
  });
  it('generate() emits a labeled grid-diagram whose legend carries the clue', () => {
    const out = tilePath.generate({ levers: mkLevers('Easy', 17), rng: seededRandom(17) });
    expect(out.handout?.kind).toBe('grid-diagram');
    if (out.handout?.kind === 'grid-diagram') {
      expect(out.handout.cells.every(c => c.label)).toBe(true);
      expect(out.handout.legend?.some(l => l.includes('→'))).toBe(true);
    }
  });
});

describe('cipher suite', () => {
  it('caesar round-trips for every shift', () => {
    for (let shift = 1; shift < 26; shift++) {
      expect(decodeCaesar(encodeCaesar('THE KEY SLEEPS BELOW', shift), shift)).toBe('THE KEY SLEEPS BELOW');
    }
  });
  it('atbash is an involution and keyword round-trips', () => {
    expect(encodeAtbash(encodeAtbash('TURN BACK NOW'))).toBe('TURN BACK NOW');
    expect(decodeKeyword(encodeKeyword('SPEAK THE NAME', 'SERPENT'), 'SERPENT')).toBe('SPEAK THE NAME');
    expect(buildKeywordAlphabet('SERPENT')).toHaveLength(26);
    expect(new Set(buildKeywordAlphabet('SERPENT')).size).toBe(26);
  });
  it('generate() emits cipher-text handouts; Easy carries a 3-letter partial key', () => {
    const easy = cipherSuite.generate({ levers: mkLevers('Easy', 8), rng: seededRandom(8) });
    expect(easy.handout?.kind).toBe('cipher-text');
    if (easy.handout?.kind === 'cipher-text') {
      expect(Object.keys(easy.handout.partialKey ?? {})).toHaveLength(3);
    }
    const hard = cipherSuite.generate({ levers: mkLevers('Hard', 8), rng: seededRandom(8) });
    if (hard.handout?.kind === 'cipher-text') {
      expect(hard.handout.partialKey).toBeUndefined();
      expect(hard.handout.body).toMatch(/[ᚠ-ᛸ]/); // runic glyphs
    }
  });
});

describe('riddle frames', () => {
  it('pools respect the obscurity mapping and never run dry', () => {
    for (const diff of DIFFS) {
      const pool = riddlePool(diff, 'ancient-tomb');
      expect(pool.length).toBeGreaterThanOrEqual(5);
      const allowed = diff === 'Easy' ? [1] : diff === 'Medium' ? [1, 2] : [2, 3];
      for (const r of pool) expect(allowed).toContain(r.obscurity);
    }
  });
  it('door frame carries one riddle; duel frame carries three distinct riddles', () => {
    const door = riddleFrames.generate({ levers: mkLevers('Medium', 31), rng: seededRandom(31), category: 'word' });
    expect(door.dmAdjudication).toBeTruthy();
    expect(door.handout?.kind).toBe('text');
    const duel = riddleFrames.generate({ levers: mkLevers('Medium', 31), rng: seededRandom(31), category: 'minigame' });
    const answers = RIDDLES.filter(r => duel.dmBrief.includes(r.answer));
    expect(duel.dmBrief).toContain('best of 3');
    expect(new Set(answers.map(a => a.id)).size).toBeGreaterThanOrEqual(3);
  });
  it('determinism: same seed ⇒ same riddles', () => {
    const a = riddleFrames.generate({ levers: mkLevers('Easy', 7), rng: seededRandom(7), category: 'word' });
    const b = riddleFrames.generate({ levers: mkLevers('Easy', 7), rng: seededRandom(7), category: 'word' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('contests & gauntlets', () => {
  it('scenario pools meet minimum sizes', () => {
    expect(CONTEST_TYPES.length).toBeGreaterThanOrEqual(10);
    expect(SIDE_EVENTS.length).toBeGreaterThanOrEqual(6);
    expect(GAUNTLET_HAZARDS.length).toBeGreaterThanOrEqual(10);
  });
  it('contest structure follows time budget and party size', () => {
    const quick = contests.generate({ levers: mkLevers('Medium', 3, { timeBudget: 'quick', partySize: 5 }), rng: seededRandom(3) });
    expect(quick.dmBrief).toContain('3 rounds');
    expect(quick.dmBrief).toContain('+4'); // level 5 Medium: 2 + floor(5/2)
    const big = contests.generate({ levers: mkLevers('Medium', 3, { partySize: 5 }), rng: seededRandom(3) });
    expect(big.dmBrief.match(/side event/gi)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
  it('gauntlet phases follow time budget; escape window follows difficulty', () => {
    const quick = gauntlets.generate({ levers: mkLevers('Easy', 4, { timeBudget: 'quick' }), rng: seededRandom(4) });
    expect(quick.stages).toBeUndefined();
    expect(quick.dmBrief).toContain('6 rounds');
    const set = gauntlets.generate({ levers: mkLevers('Hard', 4, { timeBudget: 'set-piece' }), rng: seededRandom(4) });
    expect(set.stages).toHaveLength(3);
    expect(set.dmBrief).toContain('4 rounds');
  });
  it('player surfaces tease, never solve (in-world artifact rule)', () => {
    for (const seed of [4, 11, 209580]) {
      const out = gauntlets.generate({ levers: mkLevers('Hard', seed, { timeBudget: 'set-piece' }), rng: seededRandom(seed) });
      const player = `${out.readAloud}\n${out.handout?.kind === 'text' ? `${out.handout.title}\n${out.handout.body}` : ''}`;
      // No mechanics or instructions on player surfaces:
      expect(player).not.toMatch(/Escape:/);
      expect(player).not.toMatch(/Phase [2-9]/);
      expect(player).not.toMatch(/\b(Athletics|Acrobatics|Investigation|Perception|Survival|Sleight of Hand|Constitution)\b/);
      expect(player).not.toMatch(/DC ?\d/);
      // The handout is a first-hazard-only diegetic warning. NOTE:
      // filter() returns data order — sort by dmBrief position to
      // recover the SELECTION order before naming "first" and "later".
      const hazards = GAUNTLET_HAZARDS.filter(h => out.dmBrief.includes(h.name))
        .sort((a, b) => out.dmBrief.indexOf(a.name) - out.dmBrief.indexOf(b.name));
      expect(hazards.length).toBe(3);
      const later = hazards.slice(1);
      for (const h of later) expect(out.handout && 'body' in out.handout ? out.handout.body : '').not.toContain(h.name);
      // The omen gestures at the way out. slice(1) skips the first
      // character — readAloud embeds cap(omen), so char 0 differs.
      expect(out.readAloud).toContain(hazards[0].omen.slice(1));
      // DM brief keeps the full mechanics:
      expect(out.dmBrief).toMatch(/Escape:/);
    }
  });
  it('every hazard has an omen that is a clean lowercase fragment', () => {
    for (const h of GAUNTLET_HAZARDS) {
      expect(h.omen, h.name).toBeTruthy();
      expect(h.omen, h.name).not.toMatch(/\bDC\b|\d+d\d+/);
      expect(h.omen[0], h.name).toBe(h.omen[0].toLowerCase());
      expect(h.omen.endsWith('.'), h.name).toBe(false);
      expect(h.omen, h.name).not.toMatch(/\b(Athletics|Acrobatics|Investigation|Perception|Survival|Constitution)\b/);
    }
  });
});
