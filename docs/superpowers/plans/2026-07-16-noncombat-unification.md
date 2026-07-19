# Noncombat Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/puzzles` + `/challenges` with one `/noncombat` page over a unified 18-generator orchestrator with a fresh golden-pinned seed contract.

**Architecture:** A new `src/lib/noncombat/generate.ts` flattens the existing `FAMILIES` (12) and `FRAMEWORKS` (6) registries into one `GENERATORS` list and returns a `NoncombatResult` discriminated union. Tasks are sequenced so the tree stays green: Task 1 adds the orchestrator alongside the old ones; Task 2 adds the new page; Task 3 deletes the old pages, orchestrators, tests, and routes.

**Tech Stack:** Next.js 14 static export, TypeScript strict, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-16-noncombat-unification-amendment.md` (authority for every constant; amends the v2 design).

## Global Constraints

- Engines, frameworks, data pools, theming, levers, PuzzleHandout: UNTOUCHED.
- New frozen draw order (permanent once merged): difficulty (explicit or ONE draw) → theme (`resolveTheme`) → generator (ONE uniform draw over `eligibleGenerators(kind)`, always exactly one draw) → construction. Golden-pinned fresh; the OLD pins/orchestrators retire in Task 3.
- `GENERATORS` order = `FAMILIES` order then `FRAMEWORKS` order — part of the contract; never reorder.
- Pure lib (no Date.now etc.); id = `nc-${seed}-${generatorKey}`; clamps 1–20 / 1–8.
- `npm run typecheck`, `npm test`, `npm run build` green at every commit (worktree lint quirk: standalone eslint fallback). Conventional commits; no AI attribution; push after every commit.

---

### Task 1: Unified orchestrator + fresh pins (old orchestrators untouched)

**Files:**
- Create: `src/lib/noncombat/generate.ts`
- Test: `src/lib/__tests__/noncombat-generate.test.ts`

**Interfaces:**
- Consumes: `FAMILIES` + `PuzzleFamily` from `src/lib/puzzle-engines`; `FRAMEWORKS` + `ChallengeFramework`/`ChallengeType`/`SkillCheck` from `src/lib/challenge-frameworks`; `resolveTheme`, `handoutToText`, `estimatedMinutes`, shared types; `pickRandom`/`randomSeed`/`seededRandom`.
- Produces (Task 2 consumes): `NoncombatKind`, `GenerateNoncombatOptions`, `PuzzleResult`, `ChallengeResult`, `NoncombatResult`, `GENERATORS`, `eligibleGenerators(kind?)`, `generateNoncombat(options)`, `getNoncombatKinds()`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/noncombat-generate.test.ts
import { describe, it, expect } from 'vitest';
import {
  GENERATORS, eligibleGenerators, generateNoncombat, getNoncombatKinds,
} from '../noncombat/generate';
import type { NoncombatKind } from '../noncombat/generate';

const PUZZLE_KINDS = ['logic', 'word', 'physical', 'minigame', 'environmental'] as const;
const CHALLENGE_KINDS = ['social', 'exploration', 'skill-challenge', 'trap', 'chase', 'investigation'] as const;
const ALL_KINDS = [...PUZZLE_KINDS, ...CHALLENGE_KINDS] as NoncombatKind[];

describe('unified registry', () => {
  it('18 generators in frozen order; eligibility per kind; 11 kind options', () => {
    expect(GENERATORS).toHaveLength(18);
    for (const k of PUZZLE_KINDS) expect(eligibleGenerators(k).length, k).toBeGreaterThanOrEqual(2);
    for (const k of CHALLENGE_KINDS) expect(eligibleGenerators(k), k).toHaveLength(1);
    expect(eligibleGenerators(undefined)).toHaveLength(18);
    expect(getNoncombatKinds()).toHaveLength(11);
    expect(getNoncombatKinds().map(k => k.value)).toEqual([...ALL_KINDS]);
  });
});

describe('coverage', () => {
  it('all 11 kinds × 3 difficulties generate with correct echoes and shapes', () => {
    for (const kind of ALL_KINDS) {
      for (const difficulty of ['Easy', 'Medium', 'Hard'] as const) {
        const r = generateNoncombat({ kind, difficulty, partyLevel: 7, seed: 99 });
        expect(r.kind).toBe(kind);
        expect(r.difficulty).toBe(difficulty);
        expect(r.resultKind).toBe((PUZZLE_KINDS as readonly string[]).includes(kind) ? 'puzzle' : 'challenge');
        expect(r.name.length).toBeGreaterThan(0);
        expect(r.reward.length).toBeGreaterThan(0);
      }
    }
  });
  it('union shapes: puzzles carry hints/solution, challenges carry skillChecks/outcomes', () => {
    const p = generateNoncombat({ kind: 'logic', seed: 7 });
    expect(p.resultKind).toBe('puzzle');
    if (p.resultKind === 'puzzle') {
      expect(p.hints.length).toBeGreaterThan(0);
      expect(p.solution.length).toBeGreaterThan(0);
      if (p.handout) expect(p.playerHandout!.length).toBeGreaterThan(0);
    }
    const c = generateNoncombat({ kind: 'social', seed: 7 });
    expect(c.resultKind).toBe('challenge');
    if (c.resultKind === 'challenge') {
      expect(c.skillChecks.length).toBeGreaterThan(0);
      expect(c.outcomes).toHaveLength(3);
    }
  });
});

describe('determinism + fresh golden pins', () => {
  it('same seed + levers ⇒ identical JSON on the all-drawn path', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { theme: 'any' as const, seed }; // kind AND difficulty both drawn
      expect(JSON.stringify(generateNoncombat(opts))).toBe(JSON.stringify(generateNoncombat(opts)));
    }
  });
  it('golden pins — the permanent /noncombat?seed= contract (never update without versioning URLs)', () => {
    const got = [1, 2, 3, 42, 1337, 424242].map(seed => {
      const r = generateNoncombat({ seed });
      return `${seed}=>${r.id}|${r.resultKind}|${r.theme}|${r.difficulty}|${r.kind}`;
    });
    expect(got).toEqual([
      // FILL: paste the six actual strings from the current implementation
      // (temporary log, delete it, run the file TWICE to confirm stability)
    ]);
  });
  it('golden pin — explicit levers consume no draws before construction', () => {
    const r = generateNoncombat({
      seed: 42, kind: 'investigation', difficulty: 'Hard', theme: 'sacred-temple',
      tone: 'grim', timeBudget: 'quick', partyLevel: 9, partySize: 6,
    });
    expect(`${r.id}|${r.resultKind}|${r.theme}|${r.kind}`).toBe(
      'FILL_FROM_CURRENT_IMPLEMENTATION',
    );
  });
  it('difficulty omitted is a seeded draw for ALL kinds — including challenges (new behavior)', () => {
    const a = generateNoncombat({ kind: 'trap', seed: 5 });
    const b = generateNoncombat({ kind: 'trap', seed: 5 });
    expect(a.difficulty).toBe(b.difficulty);
    expect(['Easy', 'Medium', 'Hard']).toContain(a.difficulty);
    // and across seeds the draw actually varies. NOTE: the LCG's first
    // draw is 'Medium' for ALL small consecutive seeds (1–250), so use
    // widely-spaced seeds (audit-verified to yield 3 distinct values):
    const diffs = new Set(Array.from({ length: 12 }, (_, i) => generateNoncombat({ kind: 'trap', seed: (i + 1) * 104729 }).difficulty));
    expect(diffs.size).toBeGreaterThan(1);
  });
  it('requested echoes raw options (undefined stays undefined)', () => {
    const r = generateNoncombat({ seed: 13 });
    expect(r.requested.kind).toBeUndefined();
    expect(r.requested.difficulty).toBeUndefined();
    expect(r.requested.theme).toBe('any');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/noncombat-generate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/noncombat/generate.ts
// ─── Unified Non-Combat Orchestrator ─────────────────────────────
// One flat registry over the 12 puzzle families and 6 challenge
// frameworks, one FROZEN draw order (difficulty → theme → generator
// → construction), one fresh ?seed= contract. Amendment spec
// 2026-07-16. Never reorder GENERATORS or change the draw order —
// shared /noncombat links replay them.

import { pickRandom as pick, randomSeed, seededRandom } from '../random';
import { estimatedMinutes } from './levers';
import { handoutToText } from './handout-text';
import { resolveTheme } from './theming';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, Difficulty, HandoutSpec, PuzzleCategory,
  ResolvedLevers, SkillChallengeStructure, ThemeChoice, ThemeId, TimeBudget, Tone,
} from './types';
import { FAMILIES } from '../puzzle-engines';
import type { PuzzleFamily } from '../puzzle-engines';
import { FRAMEWORKS } from '../challenge-frameworks';
import type { ChallengeFramework, ChallengeType, SkillCheck } from '../challenge-frameworks';

export type NoncombatKind = PuzzleCategory | ChallengeType;

interface CommonEcho {
  id: string;
  kind: NoncombatKind;
  difficulty: Difficulty;
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { kind?: NoncombatKind; difficulty?: Difficulty; theme: ThemeChoice };
}

export interface PuzzleResult extends CommonEcho {
  resultKind: 'puzzle';
  name: string;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  /** Plain-text rendering of `handout` (markdown export reuses it). */
  playerHandout?: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
}

export interface ChallengeResult extends CommonEcho {
  resultKind: 'challenge';
  name: string;
  readAloud: string;
  situation: string;
  stakes: string;
  skillChecks: SkillCheck[];
  complication: string;
  outcomes: { label: string; description: string }[];
  reward: string;
  handout?: HandoutSpec;
  stages?: { title: string; text: string }[];
  structure?: SkillChallengeStructure;
  attitudeTrack?: AttitudeTrack;
  clueWeb?: ClueWeb;
  chase?: ChasePlan;
}

export type NoncombatResult = PuzzleResult | ChallengeResult;

export type GeneratorEntry =
  | { generatorKind: 'family'; family: PuzzleFamily }
  | { generatorKind: 'framework'; framework: ChallengeFramework };

// FAMILIES order, then FRAMEWORKS order — frozen contract.
export const GENERATORS: GeneratorEntry[] = [
  ...FAMILIES.map(family => ({ generatorKind: 'family' as const, family })),
  ...FRAMEWORKS.map(framework => ({ generatorKind: 'framework' as const, framework })),
];

const PUZZLE_KINDS: readonly PuzzleCategory[] = ['logic', 'word', 'physical', 'minigame', 'environmental'];

export function eligibleGenerators(kind?: NoncombatKind): GeneratorEntry[] {
  if (!kind) return GENERATORS;
  if ((PUZZLE_KINDS as readonly string[]).includes(kind)) {
    return GENERATORS.filter(
      g => g.generatorKind === 'family' && g.family.categories.includes(kind as PuzzleCategory),
    );
  }
  return GENERATORS.filter(g => g.generatorKind === 'framework' && g.framework.key === kind);
}

export interface GenerateNoncombatOptions {
  kind?: NoncombatKind;
  difficulty?: Difficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generateNoncombat(options: GenerateNoncombatOptions = {}): NoncombatResult {
  const {
    kind, difficulty,
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — amendment spec.
  const diff: Difficulty = difficulty ?? pick(['Easy', 'Medium', 'Hard'] as Difficulty[], rng);
  const pack = resolveTheme(theme, rng);
  const entry = pick(eligibleGenerators(kind), rng);

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty: diff, theme: pack, tone, timeBudget, seed,
  };
  const requested = { kind, difficulty, theme };
  const echo = {
    difficulty: diff, seed,
    partyLevel: levers.partyLevel, partySize: levers.partySize,
    theme: pack.id, tone, timeBudget, requested,
  };

  if (entry.generatorKind === 'family') {
    const resolvedKind = (kind as PuzzleCategory | undefined) ?? entry.family.categories[0];
    const out = entry.family.generate({ levers, rng, category: resolvedKind });
    return {
      resultKind: 'puzzle',
      ...out,
      estimatedMinutes: out.estimatedMinutes || estimatedMinutes(timeBudget),
      playerHandout: out.handout ? handoutToText(out.handout) : undefined,
      id: `nc-${seed}-${entry.family.key}`,
      kind: resolvedKind,
      ...echo,
    };
  }
  const out = entry.framework.generate({ levers, rng });
  return {
    resultKind: 'challenge',
    ...out,
    id: `nc-${seed}-${entry.framework.key}`,
    kind: entry.framework.key,
    ...echo,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getNoncombatKinds(): { value: NoncombatKind; label: string; description: string }[] {
  return [
    { value: 'logic', label: 'Logic & Riddles', description: 'Verified deduction puzzles — truth-tellers, logic grids, rune locks, crossings, sequences' },
    { value: 'word', label: 'Word & Cipher', description: 'Riddles from the corpus and decodable ciphers in themed scripts' },
    { value: 'physical', label: 'Physical / Spatial', description: 'Plates, tiles, and balanced stones — grid puzzles with printable handouts' },
    { value: 'minigame', label: 'Minigames & Contests', description: 'Party-size-aware contests and riddle duels' },
    { value: 'environmental', label: 'Environmental Hazards', description: 'Escape gauntlets with phased hazards and group checks' },
    ...FRAMEWORKS.map(f => ({ value: f.key as NoncombatKind, label: f.label, description: f.description })),
  ];
}
```

- [ ] **Step 3b: Fill the golden pins**

Fill both golden-pin FILL slots from the current implementation (temporary log → paste the actual strings → delete the log → run the test file TWICE to confirm stability). Do NOT proceed to Step 4 with placeholders in place.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/noncombat-generate.test.ts` (twice) then `npm test` and `npm run typecheck`.
Expected: all PASS — the old orchestrators and their tests still exist and still pass (they are deleted in Task 3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/noncombat/generate.ts src/lib/__tests__/noncombat-generate.test.ts
git commit -m "feat(noncombat): unified 18-generator orchestrator with fresh seed contract"
git push
```

---

### Task 2: The `/noncombat` page

**Files:**
- Modify: `src/lib/site.ts` — ADD the `/noncombat` entry (additive; the old two entries survive until Task 3 removes them; nav briefly shows 7 tools mid-branch — acceptable). Full `RouteInfo` shape: `path: '/noncombat'`, `label: 'Puzzles & Challenges'`, `title: 'Puzzles & Challenges'`, `icon: 'puzzle'` (existing icon-union member), `description: "Verified puzzles, riddles, ciphers, contests, social encounters, journeys, traps, chases, and investigations — one levered, themed, seeded generator."` — match the exact field set of the neighboring entries.
- Create: `src/app/noncombat/layout.tsx` — mirror `src/app/puzzles/layout.tsx`'s metadata-from-route pattern, pointed at the new `/noncombat` entry.
- Create: `src/app/noncombat/page.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces; `THEME_OPTIONS`/`TONE_OPTIONS`/`TIME_OPTIONS`; `PuzzleHandout`; `handoutToText`; `usePersistentState`; `randomSeed`.
- Produces: the shipped page. URL contract (permanent): `/noncombat?seed=&kind=&diff=&lvl=&size=&theme=&tone=&time=` — `kind` omitted = Any; `diff` omitted = Any (seeded draw, ALL kinds).

**The two shipped pages are the reference implementations** — `src/app/puzzles/page.tsx` (Suspense, hydration ordering, clamp/enum-drop, handleGenerate vs handleReroll + copied-flag reset, buildShareUrl from `requested`, seed chip, HintReveal, print blocks) and `src/app/challenges/page.tsx` (challenge display sections). Read both before writing.

**Requirements:**
1. Storage keys (all new): `noncombatKind` (`''` = Any), `noncombatDifficulty` (`''` = Any), `noncombatPartyLevel` (5), `noncombatPartySize` (4), `noncombatTheme` ('any'), `noncombatTone` ('standard'), `noncombatTime` ('standard'), `noncombatHistory1` (`NoncombatResult[]`, 10 entries, dedupe-by-id).
2. Controls row: Kind select (Any + 11 from `getNoncombatKinds()`), Difficulty select (**Any**/Easy/Medium/Hard — Any is now valid for every kind), Party Level, Party Size, Theme, Tone, Time budget. Kind quick-cards: all 11, `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`, click = set kind + generate (pass the kind explicitly to avoid the stale-closure bug the challenges page fixed).
3. Suspense + one-shot hydration (numeric clamp lvl 1–20 / size 1–8 / seed 0–0x7FFFFFFF; enum-drop kind/diff to `''`-equivalent undefined, theme/tone/time to defaults; valid seed ⇒ hydrate + generate immediately with exactly those values).
4. Seed chip + reroll from the DISPLAYED result's `requested` + echoes (fresh seed, reset copied flag); Share Link builds the URL from `requested` (omit `kind`/`diff` when undefined) + concrete lvl/size/tone/time + seed, with ~2 s "Copied ✓".
5. Result rendering: shared header (name, difficulty badge, kind label from `getNoncombatKinds()`, theme · party echo, seed chip), then branch on `resultKind`:
   - `'puzzle'`: DM Brief card (+ Adjudication subheading when present), Read Aloud, `<PuzzleHandout>` when handout present, Stages, Hints (click-to-reveal, lift the `HintReveal` helper component from the puzzles page into this file), Solution collapse (Answer / On Failure / Reward), print-only expanded blocks — same idiom as the puzzles page.
   - `'challenge'`: Read Aloud, Situation/Stakes grid, Skill Checks, Challenge Structure, Stages, Attitude Track, Chase Rounds, Clue Web (eyes only), `<PuzzleHandout>`, Complication, Outcomes, Reward — same idiom as the challenges page.
6. Markdown export: one builder branching on `resultKind`, blank line before every `## ` heading, handout via `handoutToText`.
7. History: mixed union list; cards show name · kind label · difficulty · theme label · time label (single JSX expression).

Steps:

- [ ] **Step 1:** Add the site.ts `/noncombat` entry (additive) + layout.tsx (mirror an existing tool layout).
- [ ] **Step 2:** Implement page.tsx per requirements 1–7.
- [ ] **Step 3:** `npm run typecheck` → PASS; `npm test` → PASS; `npm run build` → PASS (three-page overlap state builds fine; controller runs the browser pass after Task 3).
- [ ] **Step 4: Commit**

```bash
git add src/app/noncombat/ src/lib/site.ts
git commit -m "feat(noncombat): unified page — flat kind picker, seeds, share links"
git push
```

---

### Task 3: Route surgery — delete the old world

**Files:**
- Delete: `src/app/puzzles/` (layout + page), `src/app/challenges/` (layout + page)
- Delete: `src/lib/puzzle-generator.ts`, `src/lib/noncombat-generator.ts`
- Delete: `src/lib/__tests__/puzzle-generator.test.ts`, `src/lib/__tests__/noncombat-generator.test.ts`
- Modify: `src/lib/site.ts` (remove the `/puzzles` and `/challenges` entries; the `/noncombat` entry from Task 2 stays; update the homepage blurb string if it names puzzles/challenges as separate tools)

Steps:

- [ ] **Step 1:** Confirm nothing else IMPORTS the deleted modules: `grep -rnE "from ['\"].*(puzzle-generator|noncombat-generator)['\"]" src/ --include="*.ts" --include="*.tsx"` — expected hits ONLY in the files being deleted. (A known benign non-import hit exists: a comment in `src/lib/noncombat/levers.ts` mentioning "puzzle-generator" — the import-scoped grep above excludes it.) If any OTHER file imports them, STOP and report (NEEDS_CONTEXT) rather than breaking it.
- [ ] **Step 2:** Delete the six files/dirs; edit site.ts.
- [ ] **Step 3:** Full gate: `npm run typecheck && npm test && npm run build` — the build must emit `out/noncombat/index.html` and must NOT emit `out/puzzles/` or `out/challenges/`. Check the sitemap output includes `/noncombat` and excludes the old routes.
- [ ] **Step 4:** Grep the built HTML for stale nav links: `grep -rl "puzzles\|challenges" out/index.html` — nav must reference only `/noncombat` (hits inside descriptive COPY text are fine; hits in `href` attributes to the dead routes are not).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(noncombat): retire /puzzles and /challenges routes and orchestrators"
git push
```

---

## Delivery wrap-up (controller)

- Browser pass on the finished branch: /noncombat with each of several kinds (one puzzle kind, one challenge kind, Any×Any), share-link round trip, old routes 404 in the static build, nav shows 5 tools.
- Final whole-branch review (most capable model) over `git merge-base origin/main HEAD`..HEAD with ledger triage; one fix wave; PR closing #71.
