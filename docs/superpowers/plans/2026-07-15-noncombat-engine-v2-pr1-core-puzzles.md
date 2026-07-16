# Non-Combat Encounter Engine v2 — PR 1 (Core + Puzzles) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared non-combat engine core (levers, theming, handouts, seeds) and rebuild `/puzzles` on top of it with 12 puzzle families (8 constructive, machine-verified) and a 100+ riddle corpus.

**Architecture:** A pure engine core in `src/lib/noncombat/` (lever math, theme skinning, handout types) feeds a registry of puzzle-family generators in `src/lib/puzzle-engines/`. The `generatePuzzle` orchestrator in `src/lib/puzzle-generator.ts` keeps its exported name and accepts a superset of its old options. Content (themes, riddles) lives in `src/data/`. The page renders handouts through one component and adds seed/share-link support copied from `/encounters`.

**Tech Stack:** Next.js 14 static export, TypeScript strict, Tailwind, Vitest. No new runtime dependencies; one dev dependency (`subset-font`) for the runic webfont build script.

**Spec:** `docs/superpowers/specs/2026-07-15-noncombat-encounter-engine-v2-design.md` (the authority for every constant in this plan).

## Global Constraints

- Everything in `src/lib/` is pure: no DOM, storage, network, or `Date.now()`. IDs derive from the seed.
- Never modify `src/lib/random.ts` — the LCG sequence is load-bearing.
- Same seed + same levers ⇒ `JSON.stringify`-identical output. The pipeline draw order (difficulty → theme → family → construction) is a frozen contract.
- Difficulty labels are `Easy`/`Medium`/`Hard` (skill-check DCs — never combat's Low/Moderate/High).
- Riddle/content text: public-domain/traditional or original only; never verbatim from copyrighted works; the normalized denylist test must pass.
- Verification failures re-draw from the same rng stream, ≤100 attempts, then fall back to the family's canonical instance — never throw.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` must pass at every commit. Do not run `npm run build` while `npm run dev` is running.
- Conventional commits. No AI attribution anywhere.
- Worktree note: `next lint` breaks in `.claude/worktrees` checkouts — use `npx eslint --no-eslintrc` fallback if needed.

## File Structure (PR 1)

| File | Responsibility |
|---|---|
| `src/lib/noncombat/types.ts` | Create — ThemeId/Tone/TimeBudget/Difficulty, PuzzleCategory, ThemePack, HandoutSpec/HandoutCell, ResolvedLevers |
| `src/lib/noncombat/levers.ts` | Create — DC, tiers, severity table, party-size math, structural scaling constants |
| `src/lib/noncombat/theming.ts` | Create — theme resolution, tone consequence templates, option lists for UI |
| `src/lib/noncombat/handout-text.ts` | Create — `handoutToText(spec)` plain-text renderer |
| `src/data/noncombat-themes.ts` | Create — 8 ThemePack entries |
| `src/data/riddles.ts` | Create — ≥100 RiddleEntry items |
| `src/lib/puzzle-engines/*.ts` | Create — 12 family modules + `index.ts` registry |
| `src/lib/puzzle-generator.ts` | Rewrite — orchestrator; keeps `generatePuzzle`/`getPuzzleCategories` exports |
| `src/components/PuzzleHandout.tsx` | Create — renders every HandoutSpec kind |
| `src/app/puzzles/page.tsx` | Rewrite controls/hydration; keep display sections |
| `src/app/globals.css` | Modify — `@font-face` for runic subset + `.font-runic` |
| `src/app/credits/page.tsx` | Modify — OFL attribution for Noto Sans Runic |
| `src/lib/site.ts` | Modify — `/puzzles` route copy |
| `scripts/make-runic-font.mjs` | Create — one-off font subset build script |
| `src/lib/__tests__/noncombat-levers.test.ts` | Create |
| `src/lib/__tests__/noncombat-theming.test.ts` | Create |
| `src/lib/__tests__/riddles.test.ts` | Create |
| `src/lib/__tests__/puzzle-engines.test.ts` | Create |
| `src/lib/__tests__/puzzle-generator.test.ts` | Create |

Existing tests import siblings relatively (`../battle-sim`); follow that.

---

### Task 1: Shared types + lever math

**Files:**
- Create: `src/lib/noncombat/types.ts`
- Create: `src/lib/noncombat/levers.ts`
- Test: `src/lib/__tests__/noncombat-levers.test.ts`

**Interfaces:**
- Consumes: `Rng` from `src/lib/random.ts`.
- Produces (used by every later task):
  - Types: `ThemeId`, `ThemeChoice`, `Tone`, `TimeBudget`, `Difficulty`, `PuzzleCategory`, `ThemePack`, `HandoutCell`, `HandoutSpec`, `ResolvedLevers`
  - Functions: `dcFor(level, diff)`, `tierIndex(level)`, `severityDice(level, column)`, `damageDice(level, diff, kind)`, `successesNeeded(partySize, budget, diff)`, `phaseSplit(successes)`, `groupCheckThreshold(partySize)`, `contestRounds(budget)`, `contestOpponentBonus(level, diff)`, `hintCount(budget)`, `operatorCount(diff, rng)`, `estimatedMinutes(budget)`, `goldReward(level)`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/noncombat-levers.test.ts
import { describe, it, expect } from 'vitest';
import {
  dcFor, severityDice, damageDice, successesNeeded, phaseSplit,
  groupCheckThreshold, contestRounds, contestOpponentBonus, hintCount,
  operatorCount, estimatedMinutes,
} from '../noncombat/levers';
import { seededRandom } from '../random';

describe('dcFor (parity with legacy formula)', () => {
  it('matches 10 + floor(level/2) with -2/+0/+3 offsets', () => {
    expect(dcFor(5, 'Easy')).toBe(10);
    expect(dcFor(5, 'Medium')).toBe(12);
    expect(dcFor(5, 'Hard')).toBe(15);
    expect(dcFor(20, 'Hard')).toBe(23);
    expect(dcFor(1, 'Easy')).toBe(8);
  });
});

describe('severity table (spec §6.2, test-locked)', () => {
  it('pins all 12 cells', () => {
    expect(severityDice(1, 'setback')).toBe('1d10');
    expect(severityDice(4, 'deadly')).toBe('4d10');
    expect(severityDice(5, 'setback')).toBe('2d10');
    expect(severityDice(10, 'dangerous')).toBe('4d10');
    expect(severityDice(11, 'deadly')).toBe('18d10');
    expect(severityDice(16, 'setback')).toBe('4d10');
    expect(severityDice(17, 'dangerous')).toBe('18d10');
    expect(severityDice(20, 'deadly')).toBe('24d10');
  });
  it('recurring damage is always the setback column', () => {
    expect(damageDice(11, 'Hard', 'recurring')).toBe('4d10');
    expect(damageDice(11, 'Hard', 'climactic')).toBe('18d10');
    expect(damageDice(11, 'Easy', 'climactic')).toBe('4d10');
    expect(damageDice(11, 'Medium', 'climactic')).toBe('10d10');
  });
});

describe('party-size math (spec §6.3, test-locked)', () => {
  it('successesNeeded = clamp(base(budget) + diffOffset, 3, 12)', () => {
    expect(successesNeeded(4, 'standard', 'Medium')).toBe(4);
    expect(successesNeeded(4, 'quick', 'Easy')).toBe(3);      // ceil(3)=3, -1 → clamp 3
    expect(successesNeeded(4, 'set-piece', 'Hard')).toBe(7);  // 6+1
    expect(successesNeeded(8, 'set-piece', 'Hard')).toBe(11);
    expect(successesNeeded(1, 'quick', 'Easy')).toBe(3);      // clamp floor
    expect(successesNeeded(8, 'set-piece', 'Medium')).toBe(10);
  });
  it('phaseSplit: 2 phases ≤7, else 3; larger share last', () => {
    expect(phaseSplit(7)).toEqual([3, 4]);
    expect(phaseSplit(6)).toEqual([3, 3]);
    expect(phaseSplit(8)).toEqual([2, 3, 3]);
    expect(phaseSplit(11)).toEqual([3, 4, 4]);
  });
  it('groupCheckThreshold = ceil(size/2)', () => {
    expect(groupCheckThreshold(4)).toBe(2);
    expect(groupCheckThreshold(5)).toBe(3);
    expect(groupCheckThreshold(1)).toBe(1);
  });
  it('contest rounds 3/5/7 and bonus 2+floor(level/2) at Medium', () => {
    expect(contestRounds('quick')).toBe(3);
    expect(contestRounds('standard')).toBe(5);
    expect(contestRounds('set-piece')).toBe(7);
    expect(contestOpponentBonus(20, 'Medium')).toBe(12);
    expect(contestOpponentBonus(5, 'Easy')).toBe(2);
    expect(contestOpponentBonus(5, 'Hard')).toBe(6);
  });
  it('hintCount 2/3/4 by budget; operatorCount bands by difficulty', () => {
    expect(hintCount('quick')).toBe(2);
    expect(hintCount('standard')).toBe(3);
    expect(hintCount('set-piece')).toBe(4);
    const rng = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      expect(operatorCount('Easy', rng)).toBe(2);
      const m = operatorCount('Medium', rng);
      expect(m === 2 || m === 3).toBe(true);
      const h = operatorCount('Hard', rng);
      expect(h === 3 || h === 4).toBe(true);
    }
    expect(estimatedMinutes('quick')).toBe(8);
    expect(estimatedMinutes('standard')).toBe(15);
    expect(estimatedMinutes('set-piece')).toBe(30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/noncombat-levers.test.ts`
Expected: FAIL — cannot resolve `../noncombat/levers`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/noncombat/types.ts
// ─── Shared Non-Combat Types ─────────────────────────────────────
// Lever vocabulary and handout shapes shared by the puzzle and
// challenge generators. Pure types only — no logic, no imports
// besides Rng-free primitives.

export type ThemeId =
  | 'ancient-tomb' | 'wild-frontier' | 'city-streets' | 'noble-court'
  | 'sacred-temple' | 'arcane-sanctum' | 'sea-and-shore' | 'feywild-revel';
export type ThemeChoice = ThemeId | 'any';
export type Tone = 'whimsical' | 'standard' | 'grim';
export type TimeBudget = 'quick' | 'standard' | 'set-piece';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type PuzzleCategory = 'logic' | 'word' | 'physical' | 'minigame' | 'environmental';

export interface ThemePack {
  id: ThemeId;
  label: string;
  descriptors: string[];
  materials: string[];
  sensory: string[];
  symbolSets: string[][];
  glyphStyle: { name: string; flavor: string };
  phrases: string[];            // cipher plaintexts, A–Z + spaces only
  cast: string[];
  rewards: string[];
  consequences: string[];
  creatures: string[];
}

export interface HandoutCell {
  label?: string;                     // symbol/number shown to players
  state?: 'on' | 'off' | 'masked';    // plate grid on/off · sum lock masked
}

export type HandoutSpec =
  | { kind: 'text'; title?: string; body: string }
  | { kind: 'logic-grid'; categories: string[]; items: string[][]; clues: string[] }
  | { kind: 'symbol-sequence'; symbols: string[]; blanks: number[]; options?: string[] }
  | { kind: 'cipher-text'; body: string; scriptName: string; partialKey?: Record<string, string> }
  | { kind: 'grid-diagram'; rows: number; cols: number; cells: HandoutCell[]; legend?: string[] }
  | { kind: 'attempts-ledger'; attempts: { guess: string[]; feedback: string }[]; runeSet: string[] }
  | { kind: 'clue-cards'; cards: { title: string; body: string; vector: string }[] };

/** Every lever resolved to a concrete value (no 'any', no ''). */
export interface ResolvedLevers {
  partyLevel: number;
  partySize: number;
  difficulty: Difficulty;
  theme: ThemePack;
  tone: Tone;
  timeBudget: TimeBudget;
  seed: number;
}
```

```ts
// src/lib/noncombat/levers.ts
// ─── Lever Math ──────────────────────────────────────────────────
// Every number that a lever turns into lives here, test-locked.
// Spec: docs/superpowers/specs/2026-07-15-noncombat-encounter-engine-v2-design.md §6

import type { Rng } from '../random';
import type { Difficulty, TimeBudget } from './types';

export function dcFor(level: number, diff: Difficulty): number {
  const base = 10 + Math.floor(level / 2);
  if (diff === 'Easy') return base - 2;
  if (diff === 'Hard') return base + 3;
  return base;
}

export type SeverityColumn = 'setback' | 'dangerous' | 'deadly';

const SEVERITY: Record<SeverityColumn, [string, string, string, string]> = {
  setback:   ['1d10', '2d10', '4d10', '10d10'],
  dangerous: ['2d10', '4d10', '10d10', '18d10'],
  deadly:    ['4d10', '10d10', '18d10', '24d10'],
};

export function tierIndex(level: number): 0 | 1 | 2 | 3 {
  return level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3;
}

export function severityDice(level: number, column: SeverityColumn): string {
  return SEVERITY[column][tierIndex(level)];
}

/** Recurring harm stays soft (setback); climactic harm maps difficulty → column. */
export function damageDice(level: number, diff: Difficulty, kind: 'climactic' | 'recurring'): string {
  if (kind === 'recurring') return severityDice(level, 'setback');
  const col: SeverityColumn = diff === 'Easy' ? 'setback' : diff === 'Medium' ? 'dangerous' : 'deadly';
  return severityDice(level, col);
}

export function successesNeeded(partySize: number, budget: TimeBudget, diff: Difficulty): number {
  const base = budget === 'quick' ? Math.ceil(partySize * 0.75)
    : budget === 'standard' ? partySize
    : partySize + 2;
  const offset = diff === 'Easy' ? -1 : diff === 'Hard' ? 1 : 0;
  return Math.min(12, Math.max(3, base + offset));
}

/** Even split; the larger shares land in the later phases. */
export function phaseSplit(successes: number): number[] {
  const phases = successes <= 7 ? 2 : 3;
  const per = Math.floor(successes / phases);
  const out: number[] = Array(phases).fill(per);
  for (let i = 0; i < successes % phases; i++) out[phases - 1 - i] += 1;
  return out;
}

export function groupCheckThreshold(partySize: number): number {
  return Math.ceil(partySize / 2);
}

export function contestRounds(budget: TimeBudget): 3 | 5 | 7 {
  return budget === 'quick' ? 3 : budget === 'standard' ? 5 : 7;
}

export function contestOpponentBonus(level: number, diff: Difficulty): number {
  const base = Math.floor(level / 2);
  return diff === 'Easy' ? base : diff === 'Medium' ? base + 2 : base + 4;
}

export function hintCount(budget: TimeBudget): 2 | 3 | 4 {
  return budget === 'quick' ? 2 : budget === 'standard' ? 3 : 4;
}

/** How many simultaneous operators a mechanism wants (spec §6.3). */
export function operatorCount(diff: Difficulty, rng: Rng): number {
  if (diff === 'Easy') return 2;
  if (diff === 'Medium') return 2 + Math.floor(rng() * 2);
  return 3 + Math.floor(rng() * 2);
}

export function estimatedMinutes(budget: TimeBudget): number {
  return budget === 'quick' ? 8 : budget === 'standard' ? 15 : 30;
}

/** Moved verbatim from the legacy puzzle-generator goldForLevel. */
export function goldReward(level: number): string {
  if (level <= 4) return `${10 + level * 5} GP`;
  if (level <= 10) return `${50 + level * 20} GP`;
  return `${200 + level * 50} GP`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/noncombat-levers.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
```bash
git add src/lib/noncombat/ src/lib/__tests__/noncombat-levers.test.ts
git commit -m "feat(noncombat): shared lever types and test-locked lever math"
```

---

### Task 2: Theme packs + theming helpers

**Files:**
- Create: `src/data/noncombat-themes.ts`
- Create: `src/lib/noncombat/theming.ts`
- Test: `src/lib/__tests__/noncombat-theming.test.ts`

**Interfaces:**
- Consumes: `ThemePack`, `ThemeChoice`, `ThemeId`, `Tone`, `ResolvedLevers` from Task 1; `Rng`, `pickRandom` from `src/lib/random.ts`.
- Produces:
  - `THEME_PACKS: ThemePack[]` (exactly 8) from `src/data/noncombat-themes.ts`
  - `resolveTheme(choice: ThemeChoice, rng: Rng): ThemePack`
  - `failureText(levers: ResolvedLevers, rng: Rng, opts: { kind: 'climactic' | 'recurring'; context: string; save?: string }): string`
  - `rewardText(levers: ResolvedLevers, rng: Rng): string`
  - `THEME_OPTIONS`, `TONE_OPTIONS`, `TIME_OPTIONS` — `{ value, label }[]` for UI selects
  - `RUNE_GLYPHS: string[]` — 24 Elder Futhark glyphs (U+16A0 block) used by cipher + rune-lock handouts

**Content requirement (deliverable, enforced by test):** 8 packs — `ancient-tomb`, `wild-frontier`, `city-streets`, `noble-court`, `sacred-temple`, `arcane-sanctum`, `sea-and-shore`, `feywild-revel`. Per pack minimums: 6 descriptors, 6 materials, 6 sensory, 2 symbolSets (each 5–8 symbols, plain words like "Sun"/"Serpent" — the theming layer supplies words, not emoji), 8 phrases (uppercase A–Z and spaces only, 20–40 chars, imperative dungeon-message register like `THE KEY SLEEPS BELOW THE ALTAR`), 6 cast, 6 rewards, 6 consequences, 4 creatures (SRD names only). **Authoring rule (tone contract, spec §6.6):** `consequences` and `rewards` entries are narrative only — no dice expressions (`NdN`), no DCs — because the tone layer decides whether damage text appears. One complete example pack (`ancient-tomb`) to set the register:

```ts
// src/data/noncombat-themes.ts (excerpt — first of 8 packs)
import type { ThemePack } from '../lib/noncombat/types';

export const THEME_PACKS: ThemePack[] = [
  {
    id: 'ancient-tomb',
    label: 'Ancient Tomb',
    descriptors: ['dust-choked', 'echoing', 'crumbling', 'torch-scarred', 'sealed', 'forgotten'],
    materials: ['sandstone', 'verdigrised bronze', 'cracked marble', 'bone inlay', 'faded fresco', 'black basalt'],
    sensory: ['the smell of old incense', 'a draft that should not exist', 'grit underfoot', 'the distant drip of water', 'your torchlight swallowed by the dark', 'utter silence between your footfalls'],
    symbolSets: [
      ['Scarab', 'Jackal', 'Eye', 'Ankh', 'Serpent', 'Falcon'],
      ['Crown', 'Scepter', 'Mask', 'Urn', 'Chariot', 'Star'],
    ],
    glyphStyle: { name: 'Tomb-script', flavor: 'angular funerary glyphs chiseled deep into the stone' },
    phrases: [
      'THE KEY SLEEPS BELOW THE ALTAR',
      'ONLY THE DEAD MAY PASS UNBURNED',
      'SPEAK THE NAME OF THE FIRST KING',
      'THE THIRD DOOR IS THE TRUE DOOR',
      'BOW BEFORE THE SUN LEAVES THE WALL',
      'THE GUARDIAN HUNGERS FOR SILVER',
      'TURN BACK OR JOIN THE COURT OF DUST',
      'HER TOMB LIES UNDER THE FALSE FLOOR',
    ],
    cast: ['a dust-wreathed tomb keeper', 'the ghost of a minor official', 'a grave-robber playing scholar', 'an embalmed advisor who still whispers', 'a stone sentinel with one duty left', 'a pilgrim who knows too much'],
    rewards: ['a burial mask worth a noble ransom', 'a canopic jar holding a preserved secret', 'a king\'s seal that still commands respect', 'a map of the necropolis\'s true layout', 'grave goods of surprising craftsmanship', 'a blessing of the honored dead'],
    consequences: ['the tomb\'s dead take notice of you', 'a sealed door grinds shut somewhere deeper in', 'the air turns thin and stale', 'your light sources gutter to embers', 'word of desecration will reach the surface', 'the floor plan seems to rearrange behind you'],
    creatures: ['Skeleton', 'Mummy', 'Ghoul', 'Specter'],
  },
  // ...7 more packs at the same fidelity (see content requirement above)
];
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/noncombat-theming.test.ts
import { describe, it, expect } from 'vitest';
import { THEME_PACKS } from '../../data/noncombat-themes';
import { resolveTheme, failureText, THEME_OPTIONS, RUNE_GLYPHS } from '../noncombat/theming';
import { seededRandom } from '../random';
import type { ResolvedLevers } from '../noncombat/types';

const IDS = ['ancient-tomb', 'wild-frontier', 'city-streets', 'noble-court',
  'sacred-temple', 'arcane-sanctum', 'sea-and-shore', 'feywild-revel'];

describe('theme pack corpus lint', () => {
  it('has exactly the 8 spec packs', () => {
    expect(THEME_PACKS.map(p => p.id).sort()).toEqual([...IDS].sort());
  });
  it.each(THEME_PACKS.map(p => [p.id, p] as const))('%s meets minimum pool sizes', (_id, p) => {
    expect(p.descriptors.length).toBeGreaterThanOrEqual(6);
    expect(p.materials.length).toBeGreaterThanOrEqual(6);
    expect(p.sensory.length).toBeGreaterThanOrEqual(6);
    expect(p.symbolSets.length).toBeGreaterThanOrEqual(2);
    for (const set of p.symbolSets) {
      expect(set.length).toBeGreaterThanOrEqual(5);
      // Grid handouts abbreviate symbols to 2-char labels — prefixes must
      // be distinct within a set or the printed grid becomes ambiguous.
      expect(new Set(set.map(s => s.slice(0, 2))).size, `${p.id}: 2-char prefixes collide`).toBe(set.length);
    }
    expect(p.phrases.length).toBeGreaterThanOrEqual(8);
    for (const ph of p.phrases) expect(ph).toMatch(/^[A-Z ]{20,40}$/);
    expect(p.cast.length).toBeGreaterThanOrEqual(6);
    expect(p.rewards.length).toBeGreaterThanOrEqual(6);
    expect(p.consequences.length).toBeGreaterThanOrEqual(6);
    expect(p.creatures.length).toBeGreaterThanOrEqual(4);
  });
});

describe('resolveTheme', () => {
  it('returns the named pack for explicit ids without consuming rng', () => {
    let draws = 0;
    const countingRng = () => { draws++; return 0.5; };
    const pack = resolveTheme('noble-court', countingRng);
    expect(pack.id).toBe('noble-court');
    expect(draws).toBe(0);
  });
  it("'any' is a deterministic seeded draw", () => {
    const a = resolveTheme('any', seededRandom(42));
    const b = resolveTheme('any', seededRandom(42));
    expect(a.id).toBe(b.id);
  });
});

describe('failureText tone contract (spec §6.6)', () => {
  const base = (tone: ResolvedLevers['tone']): ResolvedLevers => ({
    partyLevel: 5, partySize: 4, difficulty: 'Hard',
    theme: THEME_PACKS[0], tone, timeBudget: 'standard', seed: 1,
  });
  it('whimsical failure text carries no damage dice', () => {
    const t = failureText(base('whimsical'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.' });
    expect(t).not.toMatch(/\d+d\d+/);
  });
  it('standard emits severity damage; grim adds a lasting-cost rider', () => {
    const std = failureText(base('standard'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.', save: 'DEX' });
    expect(std).toMatch(/10d10/); // level 5, Hard, climactic = deadly column
    const grim = failureText(base('grim'), seededRandom(3), { kind: 'climactic', context: 'The lock spits sparks.', save: 'DEX' });
    expect(grim).toMatch(/10d10/);
    expect(grim.length).toBeGreaterThan(std.length); // rider appended
  });
});

describe('UI option lists + runes', () => {
  it('THEME_OPTIONS = any + 8 packs; 24 futhark glyphs', () => {
    expect(THEME_OPTIONS).toHaveLength(9);
    expect(THEME_OPTIONS[0].value).toBe('any');
    expect(RUNE_GLYPHS).toHaveLength(24);
    for (const g of RUNE_GLYPHS) {
      const cp = g.codePointAt(0)!;
      expect(cp).toBeGreaterThanOrEqual(0x16a0);
      expect(cp).toBeLessThanOrEqual(0x16f8);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/noncombat-theming.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementation**

Author all 8 packs in `src/data/noncombat-themes.ts` per the content
requirement (the `ancient-tomb` example above is entry 1; write the other 7
at the same fidelity — this is authored content, acceptance is the lint
test plus PR review for register/quality). Then:

```ts
// src/lib/noncombat/theming.ts
// ─── Theming & Tone ──────────────────────────────────────────────
// Theme resolution and the tone consequence templates. Tone never
// changes DCs, dice values, or structure sizes — it selects which
// consequence template is emitted (spec §6.6).

import { THEME_PACKS } from '../../data/noncombat-themes';
import { pickRandom as pick } from '../random';
import type { Rng } from '../random';
import type { ResolvedLevers, ThemeChoice, ThemePack, TimeBudget, Tone } from './types';
import { damageDice, dcFor } from './levers';

export function resolveTheme(choice: ThemeChoice, rng: Rng): ThemePack {
  if (choice !== 'any') return THEME_PACKS.find(p => p.id === choice) ?? THEME_PACKS[0];
  return pick(THEME_PACKS, rng);
}

const WHIMSY_SETBACKS = [
  'the mechanism douses the offender in harmless but vivid dye that lasts a tenday',
  'a chorus of tiny enchanted voices loudly mocks the attempt',
  'the offender\'s boots are magically swapped to the wrong feet until the puzzle is solved',
  'a puff of glitter marks the culprit — locals will recognize it and grin',
  'the room applauds sarcastically; morale, not hit points, takes the hit',
  'the offender must speak in rhyme until the next dawn (or until the party solves it)',
];

const GRIM_RIDERS = [
  'and the victim gains 1 level of exhaustion',
  'and the wound refuses magical healing until the next dawn',
  'and a black mark appears on the victim\'s hand — something now knows their name',
  'and the victim\'s next long rest grants no benefit unless the puzzle is solved',
  'and something in the dark marks the sound, and begins to move closer',
  'and the victim owes the place a debt it will collect at the worst moment',
];

export function failureText(
  levers: ResolvedLevers,
  rng: Rng,
  opts: { kind: 'climactic' | 'recurring'; context: string; save?: string },
): string {
  const themed = pick(levers.theme.consequences, rng);
  if (levers.tone === 'whimsical') {
    return `${opts.context} ${capitalize(pick(WHIMSY_SETBACKS, rng))}. Also: ${themed}.`;
  }
  const dice = damageDice(levers.partyLevel, levers.difficulty, opts.kind);
  const save = opts.save
    ? ` (DC ${dcFor(levers.partyLevel, levers.difficulty)} ${opts.save} save for half)`
    : '';
  const core = `${opts.context} ${dice} damage${save}, ${themed}`;
  if (levers.tone === 'grim') return `${core} — ${pick(GRIM_RIDERS, rng)}.`;
  return `${core}.`;
}

export function rewardText(levers: ResolvedLevers, rng: Rng): string {
  const themed = pick(levers.theme.rewards, rng);
  if (levers.tone === 'grim') return `${themed} — though taking it feels like signing something.`;
  if (levers.tone === 'whimsical') return `${themed}, presented with entirely unnecessary ceremony.`;
  return themed;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'any', label: 'Any Theme' },
  ...THEME_PACKS.map(p => ({ value: p.id as ThemeChoice, label: p.label })),
];

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'whimsical', label: 'Whimsical' },
  { value: 'standard', label: 'Standard' },
  { value: 'grim', label: 'Grim' },
];

export const TIME_OPTIONS: { value: TimeBudget; label: string }[] = [
  { value: 'quick', label: 'Quick (~5–10 min)' },
  { value: 'standard', label: 'Standard (~15–20 min)' },
  { value: 'set-piece', label: 'Set piece (~30+ min)' },
];

/** Elder Futhark, U+16A0–U+16B8 range subset — 24 glyphs. */
export const RUNE_GLYPHS: string[] = [
  'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ',
  'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ',
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/noncombat-theming.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/noncombat-themes.ts src/lib/noncombat/theming.ts src/lib/__tests__/noncombat-theming.test.ts
git commit -m "feat(noncombat): eight theme packs, tone templates, theming helpers"
```

---

### Task 3: Riddle corpus + licensing lint

**Files:**
- Create: `src/data/riddles.ts`
- Test: `src/lib/__tests__/riddles.test.ts`

**Interfaces:**
- Consumes: `ThemeId` from Task 1.
- Produces: `RIDDLES: RiddleEntry[]` (≥100) and the `RiddleEntry` interface, consumed by the riddle-frames engine (Task 13).

**Content requirement (deliverable, enforced by test):** ≥100 riddles.
Sourcing: traditional/anonymous folk riddles and original compositions in
that register. Paraphrases of old sources must derive from the
public-domain original, never a modern translation's wording. Spread:
≥30 entries at obscurity 1, ≥30 at obscurity 2, ≥15 at obscurity 3.
Answers that D&D players might phrase differently get `altAnswers`.
Eight complete entries to set the register:

```ts
// src/data/riddles.ts (excerpt)
import type { ThemeId } from '../lib/noncombat/types';

export interface RiddleEntry {
  id: string;
  text: string;
  answer: string;
  altAnswers: string[];
  obscurity: 1 | 2 | 3;
  themes: ThemeId[];   // [] = fits everywhere
  origin: 'traditional' | 'original';
}

export const RIDDLES: RiddleEntry[] = [
  { id: 'map', text: 'I have cities, but no houses; forests, but no trees; rivers, but no fish. What am I?', answer: 'A map', altAnswers: ['map'], obscurity: 1, themes: [], origin: 'traditional' },
  { id: 'footsteps', text: 'The more you take, the more you leave behind. What am I?', answer: 'Footsteps', altAnswers: ['footprints', 'steps'], obscurity: 1, themes: [], origin: 'traditional' },
  { id: 'candle', text: 'I am tall when I am young, and short when I am old. What am I?', answer: 'A candle', altAnswers: ['candle', 'a torch'], obscurity: 1, themes: ['ancient-tomb', 'sacred-temple'], origin: 'traditional' },
  { id: 'egg-marble-halls', text: 'In marble halls as white as milk, lined with skin as soft as silk, within a fountain crystal clear, a golden apple doth appear. No doors there are to this stronghold, yet thieves break in and steal the gold.', answer: 'An egg', altAnswers: ['egg'], obscurity: 2, themes: ['noble-court', 'feywild-revel'], origin: 'traditional' },
  { id: 'river', text: 'I have a mouth but never speak, a bed but never sleep. What am I?', answer: 'A river', altAnswers: ['river'], obscurity: 1, themes: ['wild-frontier', 'sea-and-shore'], origin: 'traditional' },
  { id: 'silence', text: 'Speak my name and I am broken. What am I?', answer: 'Silence', altAnswers: ['silence'], obscurity: 2, themes: ['sacred-temple', 'ancient-tomb'], origin: 'traditional' },
  { id: 'hole', text: 'The more you take away from me, the larger I grow. What am I?', answer: 'A hole', altAnswers: ['hole', 'a pit'], obscurity: 2, themes: [], origin: 'traditional' },
  { id: 'tide-original', text: 'Twice a day I steal the shore, yet give back all I took — and more. What am I?', answer: 'The tide', altAnswers: ['tide', 'the sea'], obscurity: 2, themes: ['sea-and-shore'], origin: 'original' },
  // ...92+ more at the same fidelity (see content requirement above)
];
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/riddles.test.ts
import { describe, it, expect } from 'vitest';
import { RIDDLES } from '../../data/riddles';

// Distinctive lines from copyrighted riddles (The Hobbit). Normalized
// substring match — reformatting does not evade it. Extend this list
// whenever a copyrighted riddle is discovered near the corpus.
const DENYLIST = [
  'roots as nobody sees',
  'up up it goes and yet never grows',
  'voiceless it cries',
  'wingless flutters',
  'toothless bites',
  'mouthless mutters',
  'alive without breath as cold as death',
  'never thirsty ever drinking',
  'this thing all things devours',
  'slays king ruins town',
  'box without hinges key or lid',
  'cannot be seen cannot be felt',
  'cannot be heard cannot be smelt',
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

describe('riddle corpus lint (spec §7.2–7.3)', () => {
  it('has at least 100 riddles', () => {
    expect(RIDDLES.length).toBeGreaterThanOrEqual(100);
  });
  it('has unique ids and unique normalized texts', () => {
    expect(new Set(RIDDLES.map(r => r.id)).size).toBe(RIDDLES.length);
    expect(new Set(RIDDLES.map(r => norm(r.text))).size).toBe(RIDDLES.length);
  });
  it('every entry has an answer and a valid obscurity', () => {
    for (const r of RIDDLES) {
      expect(r.answer.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(r.obscurity);
      expect(['traditional', 'original']).toContain(r.origin);
    }
  });
  it('meets the obscurity spread minimums (30/30/15)', () => {
    expect(RIDDLES.filter(r => r.obscurity === 1).length).toBeGreaterThanOrEqual(30);
    expect(RIDDLES.filter(r => r.obscurity === 2).length).toBeGreaterThanOrEqual(30);
    expect(RIDDLES.filter(r => r.obscurity === 3).length).toBeGreaterThanOrEqual(15);
  });
  it('contains no denylisted copyrighted lines (normalized)', () => {
    for (const r of RIDDLES) {
      const t = norm(r.text);
      for (const d of DENYLIST) {
        expect(t.includes(norm(d)), `riddle "${r.id}" matches denylist "${d}"`).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/riddles.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Author the corpus**

Write `src/data/riddles.ts` with the interface + ≥100 entries per the
content requirement. Good traditional wells to draw on (write your own
phrasings): map, footsteps, echo, coin, fire, darkness, candle, egg,
river, silence, hole, shadow, onion, needle, ice, breath, teeth, key,
name, age, tomorrow, stars, wind (original wording only — the famous
verse is copyrighted), mountain (same warning), clock, glove, well,
bridge, salt, smoke, seed, bell, anchor, net, lantern, mirror, bone,
crown, oath, tide, grave, door, ladder, wheel, rope, honey, frost.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/riddles.test.ts`
Expected: PASS, including the denylist scan.

- [ ] **Step 5: Commit**

```bash
git add src/data/riddles.ts src/lib/__tests__/riddles.test.ts
git commit -m "feat(data): 100+ riddle corpus with licensing denylist lint"
```

---

### Task 4: Handout plain-text renderer

**Files:**
- Create: `src/lib/noncombat/handout-text.ts`
- Test: `src/lib/__tests__/handout-text.test.ts`

**Interfaces:**
- Consumes: `HandoutSpec` from Task 1.
- Produces: `handoutToText(spec: HandoutSpec): string` — used by the orchestrator (Task 15) to populate the deprecated `playerHandout` field and by the page markdown export (Task 17).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/handout-text.test.ts
import { describe, it, expect } from 'vitest';
import { handoutToText } from '../noncombat/handout-text';

describe('handoutToText', () => {
  it('renders text handouts with optional title', () => {
    expect(handoutToText({ kind: 'text', body: 'Hello' })).toBe('Hello');
    expect(handoutToText({ kind: 'text', title: 'Sign', body: 'Hello' })).toBe('Sign\n\nHello');
  });
  it('renders a logic grid with numbered clues', () => {
    const t = handoutToText({
      kind: 'logic-grid',
      categories: ['Guardian', 'Sigil'],
      items: [['Ox', 'Ram'], ['Sun', 'Moon']],
      clues: ['The Ox bears the Sun.'],
    });
    expect(t).toContain('Guardian: Ox, Ram');
    expect(t).toContain('1. The Ox bears the Sun.');
  });
  it('renders a symbol sequence with blanks and options', () => {
    const t = handoutToText({ kind: 'symbol-sequence', symbols: ['Sun', 'Moon', 'Sun', 'Moon', 'Sun'], blanks: [4], options: ['Sun', 'Star'] });
    expect(t).toContain('Sun → Moon → Sun → Moon → ___');
    expect(t).toContain('Options: Sun, Star');
  });
  it('renders a grid diagram row by row with legend', () => {
    const t = handoutToText({
      kind: 'grid-diagram', rows: 2, cols: 2,
      cells: [{ state: 'on' }, { state: 'off' }, { state: 'masked' }, { label: '7' }],
      legend: ['* lit', '. dark'],
    });
    expect(t).toContain('[*] [.]');
    expect(t).toContain('[ ] [7]');
    expect(t).toContain('Legend: * lit · . dark');
  });
  it('renders an attempts ledger', () => {
    const t = handoutToText({
      kind: 'attempts-ledger',
      attempts: [{ guess: ['ᚠ', 'ᚢ', 'ᚦ'], feedback: '1 bright, 1 faint' }],
      runeSet: ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'],
    });
    expect(t).toContain('1. ᚠ ᚢ ᚦ — 1 bright, 1 faint');
    expect(t).toContain('Runes available: ᚠ ᚢ ᚦ ᚨ');
  });
  it('renders cipher text with partial key, and clue cards', () => {
    expect(handoutToText({ kind: 'cipher-text', body: 'IFMMP', scriptName: 'Tomb-script', partialKey: { I: 'H' } }))
      .toContain('Partial key: I=H');
    expect(handoutToText({ kind: 'clue-cards', cards: [{ title: 'Ash', body: 'Burned twice.', vector: 'scene' }] }))
      .toContain('[scene] Ash: Burned twice.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/handout-text.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/noncombat/handout-text.ts
// ─── Handout → plain text ────────────────────────────────────────
// One text rendering shared by the deprecated Puzzle.playerHandout
// field and the page markdown export, so both always agree.

import type { HandoutSpec } from './types';

export function handoutToText(spec: HandoutSpec): string {
  switch (spec.kind) {
    case 'text':
      return spec.title ? `${spec.title}\n\n${spec.body}` : spec.body;
    case 'logic-grid':
      return [
        ...spec.categories.map((c, i) => `${c}: ${spec.items[i].join(', ')}`),
        '',
        'Clues:',
        ...spec.clues.map((c, i) => `${i + 1}. ${c}`),
      ].join('\n');
    case 'symbol-sequence': {
      const seq = spec.symbols.map((s, i) => (spec.blanks.includes(i) ? '___' : s)).join(' → ');
      const opts = spec.options?.length ? `\nOptions: ${spec.options.join(', ')}` : '';
      return `Sequence: ${seq}${opts}`;
    }
    case 'cipher-text': {
      const key = spec.partialKey
        ? `\n\nPartial key: ${Object.entries(spec.partialKey).map(([c, p]) => `${c}=${p}`).join(', ')}`
        : '';
      return `${spec.scriptName}:\n\n${spec.body}${key}`;
    }
    case 'grid-diagram': {
      const lines: string[] = [];
      for (let r = 0; r < spec.rows; r++) {
        lines.push(
          spec.cells
            .slice(r * spec.cols, (r + 1) * spec.cols)
            .map(c => c.state === 'on' ? '[*]' : c.state === 'off' ? '[.]' : c.state === 'masked' ? '[ ]' : `[${c.label ?? ' '}]`)
            .join(' '),
        );
      }
      if (spec.legend?.length) lines.push('', `Legend: ${spec.legend.join(' · ')}`);
      return lines.join('\n');
    }
    case 'attempts-ledger':
      return [
        'Previous attempts:',
        ...spec.attempts.map((a, i) => `${i + 1}. ${a.guess.join(' ')} — ${a.feedback}`),
        '',
        `Runes available: ${spec.runeSet.join(' ')}`,
      ].join('\n');
    case 'clue-cards':
      return spec.cards.map(c => `[${c.vector}] ${c.title}: ${c.body}`).join('\n\n');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/handout-text.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/noncombat/handout-text.ts src/lib/__tests__/handout-text.test.ts
git commit -m "feat(noncombat): plain-text handout renderer"
```

---

### Task 5: Engine contract + Knights & Knaves

**Files:**
- Create: `src/lib/puzzle-engines/family.ts`
- Create: `src/lib/puzzle-engines/knights-knaves.ts`
- Test: `src/lib/__tests__/puzzle-engines.test.ts` (started here, grows through Task 14)

**Interfaces:**
- Consumes: Task 1 types + levers, Task 2 theming (`failureText`, `rewardText`), `pickRandom`/`shuffleArray` from `src/lib/random.ts`.
- Produces:
  - `EngineInput { levers: ResolvedLevers; rng: Rng }`, `EngineOutput` (name, estimatedMinutes, dmBrief, readAloud, handout?, hints, solution, failureConsequence, reward, dmAdjudication?, stages?), `PuzzleFamily { key, label, categories, generate }` — the contract every engine task implements.
  - `verified<T>(attempts, construct, valid, canonical): T` — the shared rejection-sampling helper.
  - `knightsKnaves: PuzzleFamily` plus exported pure internals for property tests: `buildKkInstance(n: number, rng: Rng): KkInstance`, `consistentAssignments(n: number, statements: KkStatement[]): boolean[][]`.

**Every engine task (5–14) follows this test pattern:** the module exports
its pure instance-builder and verifier; property tests run the builder
across 200 seeds per difficulty and assert the verifier's promise; a final
smoke test calls `family.generate` and asserts non-empty prose fields.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/puzzle-engines.test.ts
import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import type { ResolvedLevers, Difficulty } from '../noncombat/types';
import { knightsKnaves, buildKkInstance, consistentAssignments } from '../puzzle-engines/knights-knaves';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/family.ts
// ─── Puzzle Family Contract ──────────────────────────────────────
import type { Rng } from '../random';
import type { HandoutSpec, PuzzleCategory, ResolvedLevers } from '../noncombat/types';

export interface EngineInput {
  levers: ResolvedLevers;
  rng: Rng;
  /** Resolved category — the orchestrator always provides it; multi-category
   *  families (riddle-frames) branch on it. Optional so direct test calls
   *  may omit it. */
  category?: PuzzleCategory;
}

export interface EngineOutput {
  name: string;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
}

export interface PuzzleFamily {
  key: string;
  label: string;
  categories: PuzzleCategory[];
  generate(input: EngineInput): EngineOutput;
}

/** Bounded rejection sampling (spec §5.1): never throws, falls back to canonical. */
export function verified<T>(attempts: number, construct: () => T, valid: (t: T) => boolean, canonical: () => T): T {
  for (let i = 0; i < attempts; i++) {
    const candidate = construct();
    if (valid(candidate)) return candidate;
  }
  return canonical();
}
```

```ts
// src/lib/puzzle-engines/knights-knaves.ts
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
  'accuse-liar': (_a, b) => `“${b} always lies.”`,
  'accuse-knight': (_a, b) => `“${b} speaks only truth.”`,
  'same-kind': (_a, b) => `“${b} and I are of one nature.”`,
  'different-kind': (_a, b) => `“${b} and I are not alike.”`,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS — 600 instances verified unique + smoke test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/ src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): engine contract and verified knights-and-knaves family"
```

---

### Task 6: Logic grid engine

**Files:**
- Create: `src/lib/puzzle-engines/logic-grid.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract (`PuzzleFamily`, `verified`), Task 1–2 helpers.
- Produces: `logicGrid: PuzzleFamily`; test exports `buildGridInstance(nCats: number, nItems: number, pools: string[][], rng: Rng): GridInstance` and `countGridSolutions(inst: GridInstance, limit: number): number`.

Sizes (spec-locked): Easy 3 cat × 3 items, Medium 3 × 4, Hard 4 × 4.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { logicGrid, buildGridInstance, countGridSolutions } from '../puzzle-engines/logic-grid';

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
  });
  it('generate() emits a logic-grid handout with clues and locked sizes', () => {
    const out = logicGrid.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    expect(out.handout?.kind).toBe('logic-grid');
    if (out.handout?.kind === 'logic-grid') {
      expect(out.handout.categories).toHaveLength(4);
      expect(out.handout.items[0]).toHaveLength(4);
      expect(out.handout.clues.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — `logic-grid` module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/logic-grid.ts
// ─── Logic Grid (zebra-style) ────────────────────────────────────
// Solution generated first; a covering clue set is pruned greedily
// while a brute-force count over category permutations proves the
// solution stays unique (spec §7.1). Search space ≤ 4!^3 = 13,824.

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface GridClue { kind: 'is' | 'not'; a: [number, number]; b: [number, number] }
export interface GridInstance {
  nCats: number;
  nItems: number;
  items: string[][];           // items[cat][idx]
  solution: number[][];        // solution[cat][entity] = item idx; solution[0] = identity
  clues: GridClue[];
}

function allPermutations(n: number): number[][] {
  if (n === 1) return [[0]];
  const out: number[][] = [];
  for (const rest of allPermutations(n - 1)) {
    for (let i = 0; i <= rest.length; i++) {
      out.push([...rest.slice(0, i), n - 1, ...rest.slice(i)]);
    }
  }
  return out;
}

function cluesHold(assign: number[][], clues: GridClue[]): boolean {
  return clues.every(c => {
    const entity = assign[c.a[0]].indexOf(c.a[1]);
    const match = assign[c.b[0]][entity] === c.b[1];
    return c.kind === 'is' ? match : !match;
  });
}

/** Counts assignments satisfying all clues, early-exits at `limit`. */
export function countGridSolutions(inst: GridInstance, limit: number): number {
  const perms = allPermutations(inst.nItems);
  const identity = Array.from({ length: inst.nItems }, (_, i) => i);
  let count = 0;
  const recurse = (cat: number, acc: number[][]): void => {
    if (count >= limit) return;
    if (cat === inst.nCats) {
      if (cluesHold(acc, inst.clues)) count++;
      return;
    }
    for (const p of perms) recurse(cat + 1, [...acc, p]);
  };
  recurse(1, [identity]);
  return count;
}

export function buildGridInstance(nCats: number, nItems: number, pools: string[][], rng: Rng): GridInstance {
  const construct = (): GridInstance => {
    const items = pools.slice(0, nCats).map(pool => shuffleArray(pool, rng).slice(0, nItems));
    const identity = Array.from({ length: nItems }, (_, i) => i);
    const solution = [identity, ...Array.from({ length: nCats - 1 }, () => shuffleArray(identity, rng))];
    // Full positive clue set: every entity × category pair (anchored on cat 0).
    const all: GridClue[] = [];
    for (let e = 0; e < nItems; e++) {
      for (let c1 = 0; c1 < nCats; c1++) {
        for (let c2 = c1 + 1; c2 < nCats; c2++) {
          all.push({ kind: 'is', a: [c1, solution[c1][e]], b: [c2, solution[c2][e]] });
        }
      }
    }
    // A few negative clues for texture (false pairs by construction).
    for (let i = 0; i < nItems; i++) {
      const c2 = 1 + Math.floor(rng() * (nCats - 1));
      const e = Math.floor(rng() * nItems);
      const wrong = (solution[c2][e] + 1 + Math.floor(rng() * (nItems - 1))) % nItems;
      all.push({ kind: 'not', a: [0, e], b: [c2, wrong] });
    }
    // Greedy prune, preserving uniqueness at every step.
    const inst: GridInstance = { nCats, nItems, items, solution, clues: shuffleArray(all, rng) };
    for (let i = inst.clues.length - 1; i >= 0; i--) {
      const removed = inst.clues.splice(i, 1)[0];
      if (countGridSolutions(inst, 2) !== 1) inst.clues.splice(i, 0, removed);
    }
    return inst;
  };
  return verified(
    10, // pruning preserves uniqueness by construction; retries are a safety net
    construct,
    inst => countGridSolutions(inst, 2) === 1,
    construct, // construction is self-correcting; reuse it as canonical
  );
}

function clueText(inst: GridInstance, c: GridClue, catNames: string[]): string {
  const a = inst.items[c.a[0]][c.a[1]];
  const b = inst.items[c.b[0]][c.b[1]];
  const bCat = catNames[c.b[0]].toLowerCase();
  return c.kind === 'is'
    ? `${a} is bound to the ${bCat} ${b}.`
    : `${a} is NOT bound to the ${bCat} ${b}.`;
}

const SIZES = { Easy: [3, 3], Medium: [3, 4], Hard: [4, 4] } as const;
const CAT_NAMES = ['Figure', 'Sigil', 'Relic', 'Quarter'];

export const logicGrid: PuzzleFamily = {
  key: 'logic-grid',
  label: 'The Grid of Correspondences',
  categories: ['logic'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [nCats, nItems] = SIZES[levers.difficulty];
    const pack = levers.theme;
    const pools = [
      pack.symbolSets[0],
      pack.symbolSets[1] ?? pack.symbolSets[0],
      pack.materials.map(m => m.charAt(0).toUpperCase() + m.slice(1)),
      ['North', 'South', 'East', 'West'],
    ];
    const inst = buildGridInstance(nCats, nItems, pools, rng);
    const catNames = CAT_NAMES.slice(0, nCats);
    const clues = inst.clues.map(c => clueText(inst, c, catNames));
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const answerLines = Array.from({ length: nItems }, (_, e) =>
      catNames.map((cn, c) => `${cn}: ${inst.items[c][inst.solution[c][e]]}`).join(' · '),
    );
    const allHints = [
      `Chart it: one row per ${catNames[0].toLowerCase()}, one column per category. Strike out what the clues forbid.`,
      `Start with the clue that names the same ${catNames[0].toLowerCase()} twice — it anchors a full row.`,
      `DC ${dc} Investigation: faint wear marks confirm one pairing outright (give the players one row of the answer).`,
      `Every clue matters — if a pairing seems undetermined, a clue has gone unused.`,
    ];
    return {
      name: 'The Grid of Correspondences',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A matching puzzle: ${nItems} ${catNames[0].toLowerCase()}s each bind one item per category (${catNames.join(', ')}). The clue set admits exactly one arrangement. Full answer:\n${answerLines.join('\n')}`,
      readAloud: `${pack.sensory[1] ?? pack.sensory[0]}. A ${pick(pack.descriptors, rng)} wall of ${pick(pack.materials, rng)} bears ${nItems * nCats} inlaid sockets in a grid, and beneath them, an inscription lists what goes with what — almost.`,
      handout: { kind: 'logic-grid', categories: catNames, items: inst.items, clues },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The unique arrangement:\n${answerLines.join('\n')}\nSetting every socket correctly unseals the way.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong arrangement snaps a jolt through the sockets.', save: 'CON' }),
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS. (If the 4×4 uniqueness loop exceeds ~20 s, reduce that family's loop to 100 seeds and note it in the test.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/logic-grid.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): logic grid family with unique-solution pruning"
```

---

### Task 7: Rune lock (Mastermind) engine

**Files:**
- Create: `src/lib/puzzle-engines/rune-lock.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract; `RUNE_GLYPHS` from Task 2 theming.
- Produces: `runeLock: PuzzleFamily`; test exports `buildRuneLockInstance(n: number, k: number, attemptCount: number, rng: Rng): RuneLockInstance`, `consistentCandidates(inst: RuneLockInstance): number[][]`, `feedback(guess: number[], secret: number[]): { exact: number; near: number }`.

Params (spec-locked, `(n symbols, k slots, attempts)`): Easy (4,3,3), Medium (5,3,4), Hard (6,4,4). Secrets and guesses use **distinct** runes (k-permutations of n), so the candidate space is at most 6P4 = 360.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { runeLock, buildRuneLockInstance, consistentCandidates } from '../puzzle-engines/rune-lock';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/rune-lock.ts
// ─── Rune Lock (Mastermind deduction) ────────────────────────────
// Dead adventurers' previous attempts, each with feedback, narrow the
// combination space to exactly one answer (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, RUNE_GLYPHS } from '../noncombat/theming';
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
      readAloud: `A ${pack.descriptors[0]} door of ${pack.materials[0]} bears ${k} empty sockets and a tray of carved runes — ${pack.sensory[2] ?? pack.sensory[0]}. Someone has been here before you: failed attempts are scratched into the wall, each with its runes marked by the door's answering glow.`,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/rune-lock.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): rune lock family with consistency-verified attempts"
```

---

### Task 8: River crossing engine

**Files:**
- Create: `src/lib/puzzle-engines/river-crossing.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract.
- Produces: `riverCrossing: PuzzleFamily`; test exports `buildRiverInstance(diff: Difficulty, rng: Rng): RiverInstance`, `solveRiver(m: number, capacity: number, constraints: [number, number][]): { moves: number; plan: number[][] } | null`.

Min-move bands (spec-locked): Easy 3–5, Medium 6–9, Hard 10–14.
Parameter pools per difficulty: Easy m=2–3 items, capacity 1, 0–1 constraints; Medium m=3–4, capacity 1, 1–3 constraints; Hard m=5, capacity 1, **exactly 2 constraints sharing one passenger** (a "star" around one troublemaker). The Hard shape is deliberate: exhaustive enumeration shows arbitrary capacity-1 draws with ≥3 constraints are unsolvable and capacity-2 draws finish in ≤7 moves — the shared-passenger star is the capacity-1 shape whose minimum (11) lands in the 10–14 band. Draw, BFS-solve, accept when the min-move count lands in band.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { riverCrossing, buildRiverInstance, solveRiver } from '../puzzle-engines/river-crossing';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/river-crossing.ts
// ─── River Crossing ──────────────────────────────────────────────
// Incompatible passengers, a small boat, and a BFS over the state
// graph proving solvability with min-moves inside the difficulty
// band (spec §7.1). State: bitmask of items on the far side + boat.

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import type { Difficulty } from '../noncombat/types';
import { estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface RiverInstance { m: number; capacity: number; constraints: [number, number][] }

function sideSafe(mask: number, constraints: [number, number][]): boolean {
  // `mask` = items present on the UNATTENDED side.
  return constraints.every(([a, b]) => !((mask & (1 << a)) && (mask & (1 << b))));
}

function subsetsUpTo(mask: number, m: number, cap: number): number[] {
  // All non-empty cargo subsets of `mask` with ≤cap items, plus the empty trip.
  const items: number[] = [];
  for (let i = 0; i < m; i++) if (mask & (1 << i)) items.push(i);
  const out: number[] = [0];
  const recurse = (idx: number, chosen: number, count: number) => {
    if (count > 0) out.push(chosen);
    if (count === cap) return;
    for (let i = idx; i < items.length; i++) recurse(i + 1, chosen | (1 << items[i]), count + 1);
  };
  recurse(0, 0, 0);
  return out;
}

/** BFS; returns min crossings and one optimal plan (cargo mask per crossing), or null. */
export function solveRiver(m: number, capacity: number, constraints: [number, number][]): { moves: number; plan: number[][] } | null {
  const full = (1 << m) - 1;
  const encode = (far: number, boatFar: boolean) => far * 2 + (boatFar ? 1 : 0);
  const start = encode(0, false);
  const goal = encode(full, true);
  const prev = new Map<number, { state: number; cargo: number }>();
  const seen = new Set([start]);
  let frontier = [start];
  while (frontier.length > 0) {
    if (frontier.includes(goal)) break;
    const next: number[] = [];
    for (const state of frontier) {
      const far = state >> 1;
      const boatFar = (state & 1) === 1;
      const boatSideMask = boatFar ? far : (full & ~far);
      for (const cargo of subsetsUpTo(boatSideMask, m, capacity)) {
        const newFar = boatFar ? far & ~cargo : far | cargo;
        const leftBehind = boatFar ? newFar : full & ~newFar;
        if (!sideSafe(leftBehind, constraints)) continue;
        const ns = encode(newFar, !boatFar);
        if (seen.has(ns)) continue;
        seen.add(ns);
        prev.set(ns, { state, cargo });
        next.push(ns);
      }
    }
    frontier = next;
  }
  if (!frontier.includes(goal)) return null;
  const plan: number[][] = [];
  let cur = goal;
  while (cur !== start) {
    const p = prev.get(cur)!;
    const cargoItems: number[] = [];
    for (let i = 0; i < m; i++) if (p.cargo & (1 << i)) cargoItems.push(i);
    plan.unshift(cargoItems);
    cur = p.state;
  }
  return { moves: plan.length, plan };
}

const BANDS: Record<Difficulty, [number, number]> = { Easy: [3, 5], Medium: [6, 9], Hard: [10, 14] };

export function buildRiverInstance(diff: Difficulty, rng: Rng): RiverInstance {
  const draw = (): RiverInstance => {
    if (diff === 'Hard') {
      // m=5, capacity 1, two constraints sharing one passenger — the only
      // capacity-1 shape whose minimum lands in the 10–14 band (see task
      // header). Variety comes from WHICH passengers conflict.
      const m = 5;
      const center = Math.floor(rng() * m);
      const others = shuffleArray(
        Array.from({ length: m }, (_, i) => i).filter(i => i !== center), rng,
      ).slice(0, 2);
      return { m, capacity: 1, constraints: others.map(o => [center, o] as [number, number]) };
    }
    const m = diff === 'Easy' ? 2 + Math.floor(rng() * 2) : 3 + Math.floor(rng() * 2);
    const nCon = diff === 'Easy' ? Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
    const pairs: [number, number][] = [];
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push([a, b]);
    return { m, capacity: 1, constraints: shuffleArray(pairs, rng).slice(0, Math.min(nCon, pairs.length)) };
  };
  const inBand = (inst: RiverInstance): boolean => {
    const sol = solveRiver(inst.m, inst.capacity, inst.constraints);
    return sol !== null && sol.moves >= BANDS[diff][0] && sol.moves <= BANDS[diff][1];
  };
  return verified(100, draw, inBand,
    // Deterministic canonical: scan a fixed parameter grid until in band.
    () => {
      for (let m = 2; m <= 5; m++) {
        for (const capacity of [1, 2]) {
          const pairs: [number, number][] = [];
          for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push([a, b]);
          for (let nCon = 0; nCon <= pairs.length; nCon++) {
            const inst = { m, capacity, constraints: pairs.slice(0, nCon) };
            if (inBand(inst)) return inst;
          }
        }
      }
      return { m: 3, capacity: 1, constraints: [[0, 1], [1, 2]] as [number, number][] }; // classic (7 moves)
    },
  );
}

export const riverCrossing: PuzzleFamily = {
  key: 'river-crossing',
  label: 'The Ferry Dilemma',
  categories: ['logic', 'environmental'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const inst = buildRiverInstance(levers.difficulty, rng);
    const sol = solveRiver(inst.m, inst.capacity, inst.constraints)!;
    const pack = levers.theme;
    const names = shuffleArray([...pack.creatures, ...pack.symbolSets[0]], rng).slice(0, inst.m).map(n => `the ${n}`);
    const conText = inst.constraints.map(([a, b]) => `${names[a]} cannot be left alone with ${names[b]}`);
    const planText = sol.plan.map((cargo, i) =>
      cargo.length === 0
        ? `${i + 1}. Cross ${i % 2 === 0 ? 'over' : 'back'} with an empty ferry.`
        : `${i + 1}. Ferry ${cargo.map(c => names[c]).join(' and ')} ${i % 2 === 0 ? 'across' : 'back'}.`,
    );
    const allHints = [
      `Sometimes the ferry must carry a passenger BACK — the shortest path is not always forward.`,
      `Count what each bank holds after every trip; the troublesome pair${inst.constraints.length > 1 ? 's' : ''} must never share an unattended bank.`,
      `Start with the passenger involved in the most restrictions.`,
      `It can be done in exactly ${sol.moves} crossings.`,
    ];
    return {
      name: 'The Ferry Dilemma',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A crossing puzzle: ${inst.m} passengers (${names.join(', ')}), a craft that holds ${inst.capacity} beside the operator. Restrictions: ${conText.join('; ')}. Minimum: ${sol.moves} crossings. Full plan below.`,
      readAloud: `${pack.sensory[3] ?? pack.sensory[0]}. The only way across is a ${pick(pack.materials, rng)} ferry that bears the ferryman and ${inst.capacity} passenger${inst.capacity > 1 ? 's' : ''} at a time. Waiting to cross: ${names.join(', ')}. ${conText.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join('. ')}.`,
      handout: { kind: 'text', title: 'The Ferry Rules', body: [`Capacity: ferryman + ${inst.capacity}`, ...conText].join('\n') },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Minimum ${sol.moves} crossings:\n${planText.join('\n')}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'An unattended clash breaks out on the bank.', save: 'WIS' }),
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS, including the classic 7-crossing check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/river-crossing.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): river crossing family with BFS-verified move bands"
```

---

### Task 9: Sequence lock engine

**Files:**
- Create: `src/lib/puzzle-engines/sequence.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract.
- Produces: `sequenceLock: PuzzleFamily`; test exports `buildSequenceInstance(diff: Difficulty, symbolSets: string[][], rng: Rng): SequenceInstance`, `matchingPredictions(inst: SequenceInstance): Set<string>`.

Structure (spec-locked): Easy = single cycle rule (period 2–3), 4 shown terms + 1 blank; Medium = cycle (period 3–4) or arithmetic-on-numbers, 5 shown + 1 blank; Hard = two interleaved rules (even/odd positions), 6 shown + 1 blank. **Uniqueness rule (spec §7.1):** enumerate every rule-grammar instance that matches the visible terms (for interleaved, only the blank's parity matters); all matches must agree on the blank, else redraw. Distractor options (3) are verified to differ from the predicted blank.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { sequenceLock, buildSequenceInstance, matchingPredictions } from '../puzzle-engines/sequence';

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
  it('generate() emits a symbol-sequence handout with options', () => {
    const out = sequenceLock.generate({ levers: mkLevers('Easy', 3), rng: seededRandom(3) });
    expect(out.handout?.kind).toBe('symbol-sequence');
    if (out.handout?.kind === 'symbol-sequence') {
      expect(out.handout.blanks).toHaveLength(1);
      expect(out.handout.options?.length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS. Note: `matchingPredictions` enumerates ~1,000 cycle
arrangements + 54 arithmetic rules per call — fast, but if the 200-seed
loop is slow, memoize `allCycleRules` per symbolSets reference.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/sequence.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): sequence lock family with cross-rule uniqueness check"
```

---

### Task 10: Plate grid + sum lock engines

**Files:**
- Create: `src/lib/puzzle-engines/plate-grid.ts`
- Create: `src/lib/puzzle-engines/sum-lock.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract.
- Produces: `plateGrid: PuzzleFamily`, `sumLock: PuzzleFamily`; test exports `buildPlateInstance(size: number, presses: number, rng: Rng): PlateInstance` (with `applyPress(cells: boolean[], size: number, idx: number): void`), `buildSumLockInstance(masked: number, rng: Rng): SumLockInstance`, `countSumCompletions(inst: SumLockInstance, limit: number): number`.

Plate grid (spec-locked): Easy 3×3 k=3, Medium 4×4 k=4, Hard 5×5 k=5; presses are **distinct cells** (mod-2 cancellation would shorten the effective solution). Pressing toggles the cell and orthogonal neighbors; all-lit opens the door; construction works backward from all-lit, so the press set is one valid solution (alternates may exist on 4×4/5×5 — singular press matrices — and the solution text must say "one valid solution").

Sum lock (spec-locked): Lo Shu 3×3 magic square, one of 8 symmetries, +constant c ∈ 0–4 (all cells), so stones are c+1…c+9 and every line sums to 15+3c; mask 3/4/5 cells (Easy/Medium/Hard); brute-force verify the masked cells admit exactly one completion (else re-draw the mask).

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { plateGrid, buildPlateInstance, applyPress } from '../puzzle-engines/plate-grid';
import { sumLock, buildSumLockInstance, countSumCompletions } from '../puzzle-engines/sum-lock';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementations**

```ts
// src/lib/puzzle-engines/plate-grid.ts
// ─── Plate Grid (Lights-Out) ─────────────────────────────────────
// Built backward from the all-lit goal with k distinct presses, so
// the construction IS one valid solution (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { estimatedMinutes, hintCount, operatorCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

export interface PlateInstance { size: number; initial: boolean[]; presses: number[] }

export function applyPress(cells: boolean[], size: number, idx: number): void {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const flip = (rr: number, cc: number) => {
    if (rr < 0 || cc < 0 || rr >= size || cc >= size) return;
    cells[rr * size + cc] = !cells[rr * size + cc];
  };
  flip(r, c); flip(r - 1, c); flip(r + 1, c); flip(r, c - 1); flip(r, c + 1);
}

export function buildPlateInstance(size: number, k: number, rng: Rng): PlateInstance {
  // Work backward from all-lit. Presses are involutions, so re-applying
  // the same k distinct presses restores all-lit. No verification loop
  // needed — correct by construction (all-lit start is never emitted
  // because k ≥ 1 distinct presses always change at least one cell).
  const cells = Array(size * size).fill(true);
  const presses = shuffleArray(Array.from({ length: size * size }, (_, i) => i), rng).slice(0, k);
  for (const p of presses) applyPress(cells, size, p);
  return { size, initial: cells, presses };
}

const PARAMS = { Easy: [3, 3], Medium: [4, 4], Hard: [5, 5] } as const;

export const plateGrid: PuzzleFamily = {
  key: 'plate-grid',
  label: 'The Waking Floor',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [size, k] = PARAMS[levers.difficulty];
    const inst = buildPlateInstance(size, k, rng);
    const pack = levers.theme;
    const ops = operatorCount(levers.difficulty, rng);
    const coord = (i: number) => `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`;
    const pressList = inst.presses.map(coord).join('; ');
    const allHints = [
      `Stepping on a plate flips it AND its four neighbors — corners touch three plates, edges four, the middle five.`,
      `Work on one row at a time: clear the darkness downward like sweeping dust.`,
      `It can be done in ${k} steps.`,
      `Two people pressing the same plate twice cancels out — waste no steps.`,
    ];
    return {
      name: 'The Waking Floor',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A ${size}×${size} grid of glowing floor plates. Stepping on a plate toggles it and its orthogonal neighbors. All plates lit ⇒ the way opens. One valid solution (${k} presses): ${pressList}. The mechanism wants ${Math.min(levers.partySize, ops)} bodies standing on activated corner sigils to stay open afterward.`,
      readAloud: `The floor ahead is a grid of ${size} by ${size} plates of ${pack.materials[1] ?? pack.materials[0]}, some glowing softly, some dark — ${pack.sensory[0]}. A carved footprint marks the first plate invitingly.`,
      handout: {
        kind: 'grid-diagram', rows: size, cols: size,
        cells: inst.initial.map(on => ({ state: on ? 'on' as const : 'off' as const })),
        legend: ['* lit plate', '. dark plate', 'stepping flips a plate and its four neighbors'],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `One valid solution — press, in any order: ${pressList}. (Other press sets may also work; all-lit is what matters.)`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'Each fully-dark row pulses a warning through the chamber.', save: 'DEX' }),
      reward: rewardText(levers, rng),
    };
  },
};
```

```ts
// src/lib/puzzle-engines/sum-lock.ts
// ─── Sum Lock (masked magic square) ──────────────────────────────
// A Lo Shu variant with masked cells, brute-force verified to admit
// exactly one completion (spec §7.1).

import { shuffleArray } from '../random';
import type { Rng } from '../random';
import { estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface SumLockInstance {
  grid: number[];        // 9 values, row-major
  masked: number[];      // indices hidden from players
  target: number;        // line sum
}

const LO_SHU = [8, 1, 6, 3, 5, 7, 4, 9, 2];

function transform(base: number[], variant: number): number[] {
  // 8 symmetries of the square: 4 rotations × optional mirror.
  const idx = (r: number, c: number) => r * 3 + c;
  let cells = base.map((_, i) => base[i]);
  const rotate = (g: number[]) => {
    const out = Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[idx(c, 2 - r)] = g[idx(r, c)];
    return out;
  };
  const mirror = (g: number[]) => {
    const out = Array(9).fill(0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[idx(r, 2 - c)] = g[idx(r, c)];
    return out;
  };
  for (let i = 0; i < variant % 4; i++) cells = rotate(cells);
  if (variant >= 4) cells = mirror(cells);
  return cells;
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

export function countSumCompletions(inst: SumLockInstance, limit: number): number {
  const missing = inst.masked.map(i => inst.grid[i]);
  const perms = permute(missing);
  let count = 0;
  for (const p of perms) {
    const g = [...inst.grid];
    inst.masked.forEach((cell, i) => { g[cell] = p[i]; });
    if (LINES.every(line => line.reduce((sum, i) => sum + g[i], 0) === inst.target)) count++;
    if (count >= limit) break;
  }
  return count;
}

function permute(values: number[]): number[][] {
  if (values.length <= 1) return [values];
  const out: number[][] = [];
  values.forEach((v, i) => {
    for (const rest of permute([...values.slice(0, i), ...values.slice(i + 1)])) out.push([v, ...rest]);
  });
  return out;
}

export function buildSumLockInstance(masked: number, rng: Rng): SumLockInstance {
  return verified(
    100,
    () => {
      const variant = Math.floor(rng() * 8);
      const c = Math.floor(rng() * 5);
      const grid = transform(LO_SHU, variant).map(v => v + c);
      const maskedIdx = shuffleArray(Array.from({ length: 9 }, (_, i) => i), rng).slice(0, masked);
      return { grid, masked: maskedIdx, target: 15 + 3 * c };
    },
    inst => countSumCompletions(inst, 2) === 1,
    // Canonical: masking a prefix of cells 0..4 of plain Lo Shu admits a
    // unique completion for 3, 4, and 5 masks (verified by the same brute
    // force) — and it honors the requested mask count.
    () => ({ grid: [...LO_SHU], masked: [0, 1, 2, 3, 4].slice(0, masked), target: 15 }),
  );
}

const MASKED = { Easy: 3, Medium: 4, Hard: 5 } as const;

export const sumLock: PuzzleFamily = {
  key: 'sum-lock',
  label: 'The Balanced Stones',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const masked = MASKED[levers.difficulty];
    const inst = buildSumLockInstance(masked, rng);
    const pack = levers.theme;
    const loose = inst.masked.map(i => inst.grid[i]).sort((a, b) => a - b);
    const answer = inst.masked.map(i => `${inst.grid[i]} at row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}`).join('; ');
    const allHints = [
      `Every row, column, and diagonal must sum to the same number.`,
      `Add up a complete line to find the target: ${inst.target}.`,
      `The center stone belongs to four different lines — place it first if it is missing.`,
      `Each loose stone is used exactly once.`,
    ];
    return {
      name: 'The Balanced Stones',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A 3×3 grid of numbered stones; ${masked} are missing and lie loose nearby (${loose.join(', ')}). Every line must sum to ${inst.target}. Unique placement: ${answer}.`,
      readAloud: `Set into the ${pack.materials[2] ?? pack.materials[0]} floor is a three-by-three frame of numbered stones — but ${masked} sockets gape empty, their stones scattered ${pack.sensory[4] ?? 'nearby'}.`,
      handout: {
        kind: 'grid-diagram', rows: 3, cols: 3,
        cells: inst.grid.map((v, i) => inst.masked.includes(i) ? { state: 'masked' as const } : { label: String(v) }),
        legend: [`Loose stones: ${loose.join(', ')}`, `Every line must balance`],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `Place ${answer}. Every row, column, and diagonal then sums to ${inst.target}.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'An unbalanced line makes the frame shudder and spit its stones.', save: 'STR' }),
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/plate-grid.ts src/lib/puzzle-engines/sum-lock.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): plate grid and sum lock families"
```

---

### Task 11: Tile path engine

**Files:**
- Create: `src/lib/puzzle-engines/tile-path.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract.
- Produces: `tilePath: PuzzleFamily`; test exports `buildTilePathInstance(size: number, pathLen: number, symbols: string[], rng: Rng): TilePathInstance`, `cluePaths(inst: TilePathInstance): number[][]` (all south-edge→north-edge self-avoiding paths matching the clue).

Sizes (spec-locked): Easy 4×4 path 4, Medium 5×5 path 5, Hard 6×6 path 7.
**Ambiguity check (spec §7.1):** after filling decoy tiles, enumerate every south→north self-avoiding path of the clue's length whose symbol sequence equals the clue; exactly one must exist (the real path), else redraw the decoy fill. Canonical fallback: fill every off-path tile with a symbol absent from the clue — trivially unique.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { tilePath, buildTilePathInstance, cluePaths } from '../puzzle-engines/tile-path';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/tile-path.ts
// ─── Tile Path (the Deadly Floor, evolved) ───────────────────────
// A safe path across a symbol grid, matching a "constellation" clue.
// DFS-verified: exactly one clue-consistent path exists (spec §7.1).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { damageDice, dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';
import { verified } from './family';

export interface TilePathInstance {
  size: number;
  symbols: string[];     // tile symbol per cell, row-major; row 0 = north (far) edge
  clue: string[];        // symbol sequence along the safe path, south → north
  path: number[];        // cell indices, south → north
}

/** All self-avoiding south-edge→north-edge paths of exactly clue.length cells matching the clue. */
export function cluePaths(inst: TilePathInstance): number[][] {
  const { size, symbols, clue } = inst;
  const found: number[][] = [];
  const visited = new Set<number>();
  const step = (cell: number, depth: number, acc: number[]) => {
    if (symbols[cell] !== clue[depth]) return;
    acc.push(cell); visited.add(cell);
    if (depth === clue.length - 1) {
      if (cell < size) found.push([...acc]); // reached north row
    } else {
      const r = Math.floor(cell / size);
      const c = cell % size;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const nxt = rr * size + cc;
        if (!visited.has(nxt)) step(nxt, depth + 1, acc);
      }
    }
    acc.pop(); visited.delete(cell);
  };
  for (let c = 0; c < size; c++) step((size - 1) * size + c, 0, []); // south row starts
  return found;
}

/** Random self-avoiding path of exact length from south row to north row, or null. */
function drawPath(size: number, len: number, rng: Rng): number[] | null {
  const starts = shuffleArray(Array.from({ length: size }, (_, c) => (size - 1) * size + c), rng);
  const visited = new Set<number>();
  let result: number[] | null = null;
  const walk = (cell: number, acc: number[]): boolean => {
    acc.push(cell); visited.add(cell);
    if (acc.length === len) {
      if (cell < size) { result = [...acc]; return true; }
    } else {
      const r = Math.floor(cell / size);
      const c = cell % size;
      const dirs = shuffleArray([[-1, 0], [1, 0], [0, -1], [0, 1]], rng);
      for (const [dr, dc] of dirs) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const nxt = rr * size + cc;
        if (!visited.has(nxt) && walk(nxt, acc)) return true;
      }
    }
    acc.pop(); visited.delete(cell);
    return false;
  };
  for (const s of starts) {
    if (walk(s, [])) return result;
    visited.clear();
  }
  return null;
}

export function buildTilePathInstance(size: number, pathLen: number, symbolPool: string[], rng: Rng): TilePathInstance {
  const mkWithFill = (fill: (pathSet: Set<number>, clueSet: Set<string>) => (cell: number) => string): TilePathInstance | null => {
    const path = drawPath(size, pathLen, rng);
    if (!path) return null;
    const clue = path.map(() => pick(symbolPool.slice(0, 4), rng)); // clue uses ≤4 of 5 symbols
    const symbols: string[] = Array(size * size).fill('');
    const pathSet = new Set(path);
    path.forEach((cell, i) => { symbols[cell] = clue[i]; });
    const filler = fill(pathSet, new Set(clue));
    for (let cell = 0; cell < size * size; cell++) {
      if (!pathSet.has(cell)) symbols[cell] = filler(cell);
    }
    return { size, symbols, clue, path };
  };
  return verified(
    100,
    () => mkWithFill(() => () => pick(symbolPool, rng))
      ?? { size, symbols: [], clue: [], path: [] },
    inst => inst.path.length === pathLen && cluePaths(inst).length === 1,
    // Canonical: off-path tiles all get a symbol the clue never uses.
    () => {
      const inst = mkWithFill((_pathSet, clueSet) => () => symbolPool.find(s => !clueSet.has(s)) ?? symbolPool[4])!;
      return inst;
    },
  );
}

const PARAMS = { Easy: [4, 4], Medium: [5, 5], Hard: [6, 7] } as const;

export const tilePath: PuzzleFamily = {
  key: 'tile-path',
  label: 'The Constellation Floor',
  categories: ['physical'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const [size, len] = PARAMS[levers.difficulty];
    const pack = levers.theme;
    const pool = pack.symbolSets[0].slice(0, 5);
    const inst = buildTilePathInstance(size, len, pool, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const coord = (i: number) => `row ${Math.floor(i / size) + 1}, column ${i % size + 1}`;
    const pathText = inst.path.map(coord).join(' → ');
    const allHints = [
      `The ceiling pattern is a MAP: its symbols, in order, are the safe tiles from the near edge to the far edge.`,
      `DC ${dc} Perception: the safe tiles' engravings are minutely deeper-cut than the others.`,
      `A tossed coin triggers a wrong tile harmlessly from a distance.`,
      `The path never doubles back onto itself.`,
    ];
    return {
      name: 'The Constellation Floor',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A ${size}×${size} tiled floor; only one ${len}-tile path (matching the ceiling sequence ${inst.clue.join(' → ')}) is safe. Safe path from the near edge: ${pathText}. Wrong tiles: ${damageDice(levers.partyLevel, levers.difficulty, 'recurring')} piercing (DC ${dc} DEX save for half). Row 1 on the handout is the FAR edge.`,
      readAloud: `The chamber floor is a grid of engraved tiles — ${pack.sensory[0]}. High above, inlaid in the ceiling of ${pick(pack.materials, rng)}, a sequence of symbols glimmers faintly: ${inst.clue.join(', ')}.`,
      handout: {
        kind: 'grid-diagram', rows: size, cols: size,
        cells: inst.symbols.map(s => ({ label: s.slice(0, 2) })),
        legend: [
          `Ceiling sequence: ${inst.clue.join(' → ')}`,
          `Symbols: ${pool.map(s => `${s.slice(0, 2)}=${s}`).join(', ')}`,
          `Enter from the bottom row; reach the top row`,
        ],
      },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The only safe path: ${pathText}. Each tile matches the ceiling sequence in order.`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'A wrong tile fires darts from the walls.', save: 'DEX' }),
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/tile-path.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): tile path family with unique-path verification"
```

---

### Task 12: Cipher suite engine

**Files:**
- Create: `src/lib/puzzle-engines/cipher.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract; `RUNE_GLYPHS` from theming; theme pack `phrases` + `glyphStyle`.
- Produces: `cipherSuite: PuzzleFamily`; test exports `encodeCaesar(text: string, shift: number): string`, `decodeCaesar(text: string, shift: number): string`, `encodeAtbash(text: string): string`, `buildKeywordAlphabet(keyword: string): string`, `encodeKeyword(text: string, keyword: string): string`, `decodeKeyword(text: string, keyword: string): string`.

Types by difficulty (spec-locked): Easy = Caesar **or** Atbash with a `partialKey` (the 3 most frequent ciphertext letters, correctly mapped); Medium = keyword substitution; Hard = symbol substitution into runic glyphs (no partial key; hints lean on word shapes and frequency).

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { cipherSuite, encodeCaesar, decodeCaesar, encodeAtbash, encodeKeyword, decodeKeyword, buildKeywordAlphabet } from '../puzzle-engines/cipher';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/cipher.ts
// ─── Cipher Suite ────────────────────────────────────────────────
// Caesar/Atbash (Easy, with partial key), keyword (Medium), runic
// symbol substitution (Hard). Decodable by construction (spec §7.1).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, RUNE_GLYPHS } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

const A = 'A'.charCodeAt(0);
const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(A + i)).join('');

function mapLetters(text: string, map: (c: string) => string): string {
  return text.split('').map(ch => (ch >= 'A' && ch <= 'Z' ? map(ch) : ch)).join('');
}

export function encodeCaesar(text: string, shift: number): string {
  return mapLetters(text, c => String.fromCharCode(((c.charCodeAt(0) - A + shift) % 26) + A));
}
export function decodeCaesar(text: string, shift: number): string {
  return encodeCaesar(text, 26 - (shift % 26));
}
export function encodeAtbash(text: string): string {
  return mapLetters(text, c => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A)));
}
export function buildKeywordAlphabet(keyword: string): string {
  const seen = new Set<string>();
  const head = keyword.toUpperCase().split('').filter(c => c >= 'A' && c <= 'Z' && !seen.has(c) && (seen.add(c), true));
  const tail = ALPHABET.split('').filter(c => !seen.has(c));
  return [...head, ...tail].join('');
}
export function encodeKeyword(text: string, keyword: string): string {
  const cipher = buildKeywordAlphabet(keyword);
  return mapLetters(text, c => cipher[c.charCodeAt(0) - A]);
}
export function decodeKeyword(text: string, keyword: string): string {
  const cipher = buildKeywordAlphabet(keyword);
  return mapLetters(text, c => String.fromCharCode(A + cipher.indexOf(c)));
}

function topLetters(text: string, n: number): string[] {
  const freq = new Map<string, number>();
  for (const ch of text) if (ch >= 'A' && ch <= 'Z') freq.set(ch, (freq.get(ch) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(e => e[0]);
}

export const cipherSuite: PuzzleFamily = {
  key: 'cipher-suite',
  label: 'The Encoded Message',
  categories: ['word'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const plain = pick(pack.phrases, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    let body: string;
    let method: string;
    let solutionNote: string;
    let partialKey: Record<string, string> | undefined;
    if (levers.difficulty === 'Easy') {
      const useAtbash = rng() < 0.5;
      const shift = 1 + Math.floor(rng() * 25);
      body = useAtbash ? encodeAtbash(plain) : encodeCaesar(plain, shift);
      method = useAtbash ? 'an Atbash mirror (A↔Z, B↔Y, …)' : `a Caesar shift of ${shift}`;
      solutionNote = useAtbash ? 'Mirror each letter across the alphabet.' : `Shift each letter back by ${shift}.`;
      partialKey = Object.fromEntries(topLetters(body, 3).map(c => {
        const plainChar = useAtbash ? encodeAtbash(c) : decodeCaesar(c, shift);
        return [c, plainChar];
      }));
    } else if (levers.difficulty === 'Medium') {
      const keyword = pick(pack.symbolSets[0], rng).toUpperCase().replace(/[^A-Z]/g, '');
      body = encodeKeyword(plain, keyword);
      method = `a keyword cipher (keyword: ${keyword})`;
      solutionNote = `The cipher alphabet starts with ${keyword} (duplicates dropped), then the remaining letters in order.`;
    } else {
      // 26 distinct glyphs — RUNE_GLYPHS (24) plus two extras from the same
      // runic block — so no two letters ever share a glyph (decodability).
      const CIPHER_GLYPHS = [...RUNE_GLYPHS, 'ᛠ', 'ᛡ'];
      const glyphMap = shuffleArray(CIPHER_GLYPHS, rng);
      body = mapLetters(plain, c => glyphMap[c.charCodeAt(0) - A]);
      method = 'a full symbol substitution into runic glyphs';
      solutionNote = `Mapping (letter → glyph): ${ALPHABET.split('').map((c, i) => `${c}=${glyphMap[i]}`).join(' ')}`;
    }
    const allHints = [
      `Short words betray the code: one-letter words are A or I; the most common three-letter word is THE.`,
      `DC ${dc} Arcana or History: recognize the encoding style — ${method}.`,
      `The most frequent symbol likely stands for E, T, or A.`,
      `A character who studies ${pack.glyphStyle.name} script gains advantage on any check to decode it.`,
    ];
    return {
      name: 'The Encoded Message',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A message in ${pack.glyphStyle.name} — ${pack.glyphStyle.flavor} — encoded with ${method}. Plaintext: "${plain}". ${solutionNote}`,
      readAloud: `${pack.sensory[5] ?? pack.sensory[0]}. Across the ${pick(pack.materials, rng)} surface, someone has left a message in ${pack.glyphStyle.name}: recognizable script, unreadable words. It has been encoded.`,
      handout: { kind: 'cipher-text', body, scriptName: pack.glyphStyle.name, partialKey },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The message reads: "${plain}". ${solutionNote}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'Time bleeds away while the message goes unread.', save: undefined }),
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/cipher.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): cipher suite with caesar, atbash, keyword, and runic substitution"
```

---

### Task 13: Riddle frames engine

**Files:**
- Create: `src/lib/puzzle-engines/riddle-frames.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract; `RIDDLES`/`RiddleEntry` from Task 3.
- Produces: `riddleFrames: PuzzleFamily` (categories `['word', 'minigame']`); test export `riddlePool(diff: Difficulty, themeId: ThemeId): RiddleEntry[]`.
- **Contract note:** this family reads `input.category` (see Task 5's `EngineInput` — the orchestrator always passes the resolved category): `word` ⇒ riddle-door frame; `minigame` ⇒ sphinx duel (best-of-3 riddles).

Obscurity mapping (spec-locked): Easy → obscurity 1; Medium → ≤2; Hard → 2–3. Theme filter prefers entries whose `themes` include the pack id or are empty; if that leaves <5 entries, fall back to the obscurity filter alone.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { riddleFrames, riddlePool } from '../puzzle-engines/riddle-frames';
import { RIDDLES } from '../../data/riddles';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/riddle-frames.ts
// ─── Riddle Frames ───────────────────────────────────────────────
// Corpus-driven riddles in three presentations: the riddle door
// (word) and the sphinx duel / best-of-3 contest (minigame).

import { shuffleArray, pickRandom as pick } from '../random';
import { RIDDLES, type RiddleEntry } from '../../data/riddles';
import type { Difficulty, ThemeId } from '../noncombat/types';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
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
        readAloud: `A ${pick(pack.descriptors, rng)} door of ${pick(pack.materials, rng)} bars the way — ${pack.sensory[0]}. A carved face opens its eyes and speaks:\n\n"${r.text}"`,
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
      dmBrief: `${challenger} challenges the party to a riddle duel, best of 3. ${stakes}\n${riddleList}`,
      readAloud: `${challenger.charAt(0).toUpperCase() + challenger.slice(1)} regards you with ancient amusement. "A game, then. Three riddles. Answer true and pass with my blessing; fail, and pay my price."`,
      handout: { kind: 'text', title: 'Terms of the Duel', body: `Best of 3 riddles.\nConfer freely; one voice answers.\nA repeat may be asked once, free.` },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The riddles and answers:\n${riddleList}`,
      failureConsequence: failureText(levers, rng, { kind: 'climactic', context: 'Losing the duel invokes the price.', save: undefined }),
      reward: rewardText(levers, rng),
      dmAdjudication: ADJUDICATION,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/riddle-frames.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): riddle door and sphinx duel frames over the corpus"
```

---

### Task 14: Contests + hazard gauntlets engines

**Files:**
- Create: `src/data/noncombat-scenarios.ts`
- Create: `src/lib/puzzle-engines/contests.ts`
- Create: `src/lib/puzzle-engines/gauntlets.ts`
- Test: extend `src/lib/__tests__/puzzle-engines.test.ts`

**Interfaces:**
- Consumes: Task 5 contract; `contestRounds`, `contestOpponentBonus`, `groupCheckThreshold`, `operatorCount` from levers.
- Produces: `contests: PuzzleFamily` (categories `['minigame']`), `gauntlets: PuzzleFamily` (categories `['environmental']`); data exports `CONTEST_TYPES` (≥10: `{ name, skill, flavor }`), `SIDE_EVENTS` (≥6: `{ role, skill, effect }`), `GAUNTLET_HAZARDS` (≥10: `{ name, hazard, escape, skills: string[] }`) from `src/data/noncombat-scenarios.ts`. PR 2 extends this same data file with challenge-framework pools.

**Content requirement (deliverable, enforced by test):** ≥10 contest types
(e.g. arm wrestling, dart throwing, log rolling, boasting, liar's dice,
dancing, rowing race, climbing race, drinking, trivia of the local land),
≥6 side events (bet-taking/Insight, crowd-working/Performance, rival-
scouting/Perception, cheat-spotting/Investigation, morale/Charisma,
odds-running/Sleight of Hand), ≥10 gauntlet hazards (flooding chamber,
shrinking walls, poison gas, freezing vault, gravity flux, sand cascade,
pendulum blades, swarm release, collapsing floor, rising water + live
current), each with an escape mechanism and 2–3 relevant skills.

**Behavior:**
- Contests: rounds = `contestRounds(timeBudget)`; opponent bonus =
  `contestOpponentBonus(partyLevel, difficulty)`; one side event per
  non-competing party member up to `partySize − 1` (cap 4), each granting
  advantage on one round when successful. Win = majority of rounds.
- Gauntlets: phases = 1 (quick) / 2 (standard) / 3 (set-piece), rendered as
  `stages` when >1; escape window = 6/5/4 rounds (Easy/Medium/Hard); one
  group check (`groupCheckThreshold`) to operate the escape; recurring
  setback damage per round after the window closes; mechanisms may demand
  `min(partySize, operatorCount(difficulty, rng))` simultaneous operators.

- [ ] **Step 1: Write the failing test** (append to `puzzle-engines.test.ts`)

```ts
import { contests } from '../puzzle-engines/contests';
import { gauntlets } from '../puzzle-engines/gauntlets';
import { CONTEST_TYPES, SIDE_EVENTS, GAUNTLET_HAZARDS } from '../../data/noncombat-scenarios';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementations**

Author `src/data/noncombat-scenarios.ts` with the three pools (shape below,
content per the requirement), then the two engines. Scenario data shape:

```ts
// src/data/noncombat-scenarios.ts (shape + one example entry each)
export interface ContestType { name: string; skill: string; flavor: string }
export interface SideEvent { role: string; skill: string; effect: string }
export interface GauntletHazard { name: string; hazard: string; escape: string; skills: string[] }

export const CONTEST_TYPES: ContestType[] = [
  { name: 'Arm Wrestling', skill: 'Athletics', flavor: 'a scarred veteran who has not lost in years' },
  // ...9+ more
];
export const SIDE_EVENTS: SideEvent[] = [
  { role: 'Read the rival', skill: 'Insight', effect: 'learn their tell — grant advantage on one round' },
  // ...5+ more
];
export const GAUNTLET_HAZARDS: GauntletHazard[] = [
  { name: 'The Flooding Chamber', hazard: 'water rises one foot per round', escape: 'find and wrench open the drain gate', skills: ['Athletics', 'Investigation'] },
  // ...9+ more
];
```

Contest engine core (structure only — flavor assembly mirrors Task 13's
patterns; the DM brief must include `${rounds} rounds`, the opponent bonus
as `+${bonus}`, and one "Side event:" line per assigned member):

```ts
// src/lib/puzzle-engines/contests.ts — generate() core
const rounds = contestRounds(levers.timeBudget);
const bonus = contestOpponentBonus(levers.partyLevel, levers.difficulty);
const contest = pick(CONTEST_TYPES, rng);
const sideCount = Math.min(Math.max(levers.partySize - 1, 0), 4);
const sides = shuffleArray(SIDE_EVENTS, rng).slice(0, sideCount);
const dc = dcFor(levers.partyLevel, levers.difficulty);
// dmBrief must read: `${contest.name}: best of ${rounds} rounds of opposed
// ${contest.skill} checks; the challenger rolls at +${bonus}. Win
// ${Math.ceil(rounds / 2)} rounds to take the wager.` plus, per side event:
// `Side event (${s.role}): DC ${dc} ${s.skill} — ${s.effect}.`
```

Gauntlet engine core:

```ts
// src/lib/puzzle-engines/gauntlets.ts — generate() core
const phaseCount = levers.timeBudget === 'quick' ? 1 : levers.timeBudget === 'standard' ? 2 : 3;
const windowRounds = levers.difficulty === 'Easy' ? 6 : levers.difficulty === 'Medium' ? 5 : 4;
const hazards = shuffleArray(GAUNTLET_HAZARDS, rng).slice(0, phaseCount);
const ops = Math.min(levers.partySize, operatorCount(levers.difficulty, rng));
const threshold = groupCheckThreshold(levers.partySize);
const dc = dcFor(levers.partyLevel, levers.difficulty);
const dice = damageDice(levers.partyLevel, levers.difficulty, 'recurring');
// dmBrief must include `${windowRounds} rounds` per phase, the group check
// (`at least ${threshold} of ${levers.partySize} must succeed on DC ${dc}`),
// the operator demand (`${ops} operators at once`), and per-round `${dice}`
// after the window. stages = phaseCount > 1
//   ? hazards.map((h, i) => ({ title: `Phase ${i + 1}: ${h.name}`, text: `${h.hazard}. Escape: ${h.escape}.` }))
//   : undefined (single hazard inlined in readAloud/dmBrief).
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/noncombat-scenarios.ts src/lib/puzzle-engines/contests.ts src/lib/puzzle-engines/gauntlets.ts src/lib/__tests__/puzzle-engines.test.ts
git commit -m "feat(puzzles): party-size-aware contests and phased hazard gauntlets"
```

---

### Task 15: Registry + orchestrator rewrite

**Files:**
- Create: `src/lib/puzzle-engines/index.ts`
- Rewrite: `src/lib/puzzle-generator.ts`
- Test: `src/lib/__tests__/puzzle-generator.test.ts`

**Interfaces:**
- Consumes: all 12 families; `resolveTheme`; `handoutToText`; `randomSeed`, `seededRandom`, `pickRandom`.
- Produces (the page consumes these in Task 17):
  - `FAMILIES: PuzzleFamily[]`, `eligibleFamilies(category?: PuzzleCategory): PuzzleFamily[]` from the registry
  - `generatePuzzle(options: GeneratePuzzleOptions): Puzzle` — options is a superset of the legacy shape `{ category?, difficulty?, partyLevel?, seed? }`, adding `partySize?`, `theme?`, `tone?`, `timeBudget?`
  - `Puzzle` — every legacy field (`id, name, category, difficulty, estimatedMinutes, dmBrief, readAloud, playerHandout?, hints, solution, failureConsequence, reward`) **plus** `seed, partyLevel, partySize, theme: ThemeId, tone, timeBudget, handout?, stages?, dmAdjudication?, requested: { category?: PuzzleCategory; difficulty?: PuzzleDifficulty; theme: ThemeChoice }` (the `requested` echo is what share links serialize — spec §6.5 requires links to carry levers as the user set them)
  - Re-exports for back-compat: `PuzzleCategory`, `PuzzleDifficulty` (alias of `Difficulty`), `getPuzzleCategories()` unchanged

**Frozen draw order** (spec §5.1/§6.1/§6.5 — determinism contract):
1. `difficulty` concrete? else one draw from `['Easy', 'Medium', 'Hard']`
2. `theme` pack: explicit or one draw over the 8 packs
3. family: one uniform draw over `eligibleFamilies(category)` (deduplicated by construction — each family appears once in `FAMILIES`)
4. resolved category = `options.category ?? family.categories[0]`
5. `family.generate({ levers, rng, category })` (construction + verification draws)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/puzzle-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generatePuzzle, getPuzzleCategories } from '../puzzle-generator';
import type { PuzzleCategory, PuzzleDifficulty } from '../puzzle-generator';
import { eligibleFamilies } from '../puzzle-engines';

const CATS: PuzzleCategory[] = ['logic', 'word', 'physical', 'minigame', 'environmental'];
const DIFFS: PuzzleDifficulty[] = ['Easy', 'Medium', 'Hard'];

describe('registry coverage (spec §7.1 — fixes P1/P2)', () => {
  it('every category has ≥2 eligible families', () => {
    for (const cat of CATS) {
      expect(eligibleFamilies(cat).length, cat).toBeGreaterThanOrEqual(2);
    }
  });
  it('every category × difficulty generates without silent fallback', () => {
    for (const cat of CATS) {
      for (const diff of DIFFS) {
        const p = generatePuzzle({ category: cat, difficulty: diff, partyLevel: 7, seed: 99 });
        expect(p.category).toBe(cat);
        expect(p.difficulty).toBe(diff);
        expect(p.dmBrief.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('determinism (spec §2)', () => {
  it('same seed + levers ⇒ identical JSON, including any-theme and any-difficulty paths', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { partyLevel: 9, partySize: 5, theme: 'any' as const, seed };
      expect(JSON.stringify(generatePuzzle(opts))).toBe(JSON.stringify(generatePuzzle(opts)));
    }
  });
  it('distinct seeds vary the output', () => {
    const briefs = new Set(Array.from({ length: 10 }, (_, i) => generatePuzzle({ seed: i + 1 }).dmBrief));
    expect(briefs.size).toBeGreaterThan(3);
  });
});

describe('lever influence (spec §12)', () => {
  it('theme changes output for the same seed', () => {
    const a = generatePuzzle({ theme: 'ancient-tomb', seed: 5 });
    const b = generatePuzzle({ theme: 'feywild-revel', seed: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it('tone: whimsical failure text carries no damage dice; grim does', () => {
    const w = generatePuzzle({ tone: 'whimsical', seed: 8 });
    expect(w.failureConsequence).not.toMatch(/\d+d\d+/);
    const g = generatePuzzle({ tone: 'grim', seed: 8 });
    expect(g.failureConsequence).toMatch(/\d+d\d+/);
  });
  it('time budget drives hint count', () => {
    expect(generatePuzzle({ timeBudget: 'quick', seed: 4 }).hints).toHaveLength(2);
    expect(generatePuzzle({ timeBudget: 'set-piece', seed: 4 }).hints).toHaveLength(4);
  });
});

describe('back-compat (spec §5/§11)', () => {
  it('legacy option shape works, including the formerly-empty word+Hard combo', () => {
    const p = generatePuzzle({ category: 'word', difficulty: 'Hard', partyLevel: 9, seed: 42 });
    expect(p.category).toBe('word');
    expect(p.difficulty).toBe('Hard');
  });
  it('playerHandout mirrors handout as text; requested echoes user levers', () => {
    const p = generatePuzzle({ category: 'logic', difficulty: 'Medium', theme: 'any', seed: 13 });
    if (p.handout) expect(p.playerHandout?.length).toBeGreaterThan(0);
    expect(p.requested.theme).toBe('any');
    expect(p.requested.category).toBe('logic');
    expect(p.seed).toBe(13);
    expect(p.id).toContain('13');
  });
  it('getPuzzleCategories keeps its five entries', () => {
    expect(getPuzzleCategories()).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/puzzle-generator.test.ts`
Expected: FAIL — `eligibleFamilies` missing; `generatePuzzle` lacks new fields.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/puzzle-engines/index.ts
// ─── Family Registry ─────────────────────────────────────────────
import type { PuzzleCategory } from '../noncombat/types';
import type { PuzzleFamily } from './family';
import { knightsKnaves } from './knights-knaves';
import { logicGrid } from './logic-grid';
import { runeLock } from './rune-lock';
import { riverCrossing } from './river-crossing';
import { sequenceLock } from './sequence';
import { cipherSuite } from './cipher';
import { riddleFrames } from './riddle-frames';
import { plateGrid } from './plate-grid';
import { sumLock } from './sum-lock';
import { tilePath } from './tile-path';
import { contests } from './contests';
import { gauntlets } from './gauntlets';

export const FAMILIES: PuzzleFamily[] = [
  knightsKnaves, logicGrid, runeLock, riverCrossing, sequenceLock,
  cipherSuite, riddleFrames, plateGrid, sumLock, tilePath, contests, gauntlets,
];

export function eligibleFamilies(category?: PuzzleCategory): PuzzleFamily[] {
  return category ? FAMILIES.filter(f => f.categories.includes(category)) : FAMILIES;
}

export type { PuzzleFamily, EngineInput, EngineOutput } from './family';
```

```ts
// src/lib/puzzle-generator.ts (full rewrite)
// ─── Puzzle Orchestrator ─────────────────────────────────────────
// Resolves levers in a FROZEN draw order (difficulty → theme →
// family → construction), dispatches to the family registry, and
// assembles the final Puzzle. Spec §5.1. Never change the draw
// order — shared ?seed= links replay it.

import { pickRandom as pick, randomSeed, seededRandom } from './random';
import { estimatedMinutes } from './noncombat/levers';
import { handoutToText } from './noncombat/handout-text';
import { resolveTheme } from './noncombat/theming';
import type {
  Difficulty, HandoutSpec, PuzzleCategory, ResolvedLevers,
  ThemeChoice, ThemeId, TimeBudget, Tone,
} from './noncombat/types';
import { eligibleFamilies } from './puzzle-engines';

export type { PuzzleCategory } from './noncombat/types';
export type PuzzleDifficulty = Difficulty;

export interface Puzzle {
  id: string;
  name: string;
  category: PuzzleCategory;
  difficulty: PuzzleDifficulty;
  estimatedMinutes: number;
  dmBrief: string;
  readAloud: string;
  /** @deprecated text rendering of `handout`; prefer `handout`. */
  playerHandout?: string;
  handout?: HandoutSpec;
  hints: string[];
  solution: string;
  failureConsequence: string;
  reward: string;
  dmAdjudication?: string;
  stages?: { title: string; text: string }[];
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { category?: PuzzleCategory; difficulty?: PuzzleDifficulty; theme: ThemeChoice };
}

export interface GeneratePuzzleOptions {
  category?: PuzzleCategory;
  difficulty?: PuzzleDifficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generatePuzzle(options: GeneratePuzzleOptions = {}): Puzzle {
  const {
    category, difficulty,
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — spec §5.1.
  const diff: Difficulty = difficulty ?? pick(['Easy', 'Medium', 'Hard'] as Difficulty[], rng);
  const pack = resolveTheme(theme, rng);
  const family = pick(eligibleFamilies(category), rng);
  const resolvedCategory = category ?? family.categories[0];

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty: diff, theme: pack, tone, timeBudget, seed,
  };
  const out = family.generate({ levers, rng, category: resolvedCategory });

  return {
    id: `puzzle-${seed}-${family.key}`,
    category: resolvedCategory,
    difficulty: diff,
    ...out,
    estimatedMinutes: out.estimatedMinutes || estimatedMinutes(timeBudget),
    playerHandout: out.handout ? handoutToText(out.handout) : undefined,
    seed,
    partyLevel: levers.partyLevel,
    partySize: levers.partySize,
    theme: pack.id,
    tone, timeBudget,
    requested: { category, difficulty, theme },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getPuzzleCategories(): { value: PuzzleCategory; label: string }[] {
  return [
    { value: 'logic', label: 'Logic & Riddles' },
    { value: 'word', label: 'Word & Cipher' },
    { value: 'physical', label: 'Physical / Spatial' },
    { value: 'minigame', label: 'Minigames & Contests' },
    { value: 'environmental', label: 'Environmental Hazards' },
  ];
}
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — including all pre-existing tests (nothing else imports the removed template internals; verify with `grep -r "RIDDLES\|TEMPLATES" src/ --include="*.ts" --include="*.tsx" -l` that only the new modules match).

- [ ] **Step 5: Commit**

```bash
git add src/lib/puzzle-engines/index.ts src/lib/puzzle-generator.ts src/lib/__tests__/puzzle-generator.test.ts
git commit -m "feat(puzzles): registry orchestrator with frozen seeded draw order"
```

---

### Task 16: Handout component + runic webfont + credits

**Files:**
- Create: `src/components/PuzzleHandout.tsx`
- Create: `scripts/make-runic-font.mjs`
- Create: `public/fonts/noto-sans-runic-subset.woff2` (build artifact, committed)
- Create: `public/fonts/OFL-NotoSansRunic.txt`
- Modify: `src/app/globals.css` (append `@font-face` + `.font-runic`)
- Modify: `src/app/credits/page.tsx` (attribution entry)
- Modify: `package.json` (devDependency `subset-font`, script `make:runic-font`)
- Modify: `.gitignore` (add `scripts/vendor/`)

- [ ] **Step 1: Build the font subset**

```bash
npm install -D subset-font
mkdir -p scripts/vendor
curl -L -o scripts/vendor/NotoSansRunic-Regular.ttf "https://github.com/notofonts/runic/raw/main/fonts/NotoSansRunic/hinted/ttf/NotoSansRunic-Regular.ttf"
```

(If that URL 404s, fetch Noto Sans Runic from Google Fonts and place the
TTF at the same path. Also download the OFL.txt license from the same
repository into `public/fonts/OFL-NotoSansRunic.txt`.)

```js
// scripts/make-runic-font.mjs
// One-off build: subsets Noto Sans Runic to U+16A0–16F8 as woff2.
// Usage: npm run make:runic-font  (expects scripts/vendor/NotoSansRunic-Regular.ttf)
import { readFile, writeFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

const source = await readFile('scripts/vendor/NotoSansRunic-Regular.ttf');
const runes = Array.from({ length: 0x16f9 - 0x16a0 }, (_, i) => String.fromCodePoint(0x16a0 + i)).join('');
const woff2 = await subsetFont(source, runes, { targetFormat: 'woff2' });
await writeFile('public/fonts/noto-sans-runic-subset.woff2', woff2);
console.log(`wrote public/fonts/noto-sans-runic-subset.woff2 (${woff2.length} bytes)`);
```

Add to `package.json` scripts: `"make:runic-font": "node scripts/make-runic-font.mjs"`, run it, and confirm the woff2 is under ~20 KB.

- [ ] **Step 2: Wire the font into globals.css**

```css
/* Runic glyphs for cipher/rune-lock handouts. unicode-range scopes the
   font to the runic block, so it can sit first in any font stack. */
@font-face {
  font-family: 'Noto Sans Runic';
  src: url('/fonts/noto-sans-runic-subset.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+16A0-16F8;
}
.font-runic {
  font-family: 'Noto Sans Runic', var(--font-body, sans-serif);
}
```

(Check how globals.css names its body font variable and use that in the
fallback position.)

- [ ] **Step 3: Write the component**

```tsx
// src/components/PuzzleHandout.tsx
// Renders every HandoutSpec kind inside the light-island card used for
// player-facing material. Runic text always gets .font-runic — the
// unicode-range keeps Latin text unaffected.
import type { HandoutSpec } from '@/lib/noncombat/types';

export default function PuzzleHandout({ spec }: { spec: HandoutSpec }) {
  return (
    <div className="card light-island">
      <h3 className="text-lg mb-2 text-[var(--statblock-light-accent)]">Player Handout</h3>
      <HandoutBody spec={spec} />
    </div>
  );
}

function HandoutBody({ spec }: { spec: HandoutSpec }) {
  switch (spec.kind) {
    case 'text':
      return (
        <div>
          {spec.title && <h4 className="text-sm font-bold mb-1">{spec.title}</h4>}
          <p className="text-sm whitespace-pre-line font-display">{spec.body}</p>
        </div>
      );
    case 'logic-grid':
      return (
        <div className="space-y-3">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="border px-2 py-1 text-left">{spec.categories[0]}</th>
                {spec.categories.slice(1).map(c => (
                  <th key={c} className="border px-2 py-1 text-left">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.items[0].map(anchor => (
                <tr key={anchor}>
                  <td className="border px-2 py-1 font-bold">{anchor}</td>
                  {spec.categories.slice(1).map(c => (
                    <td key={c} className="border px-2 py-1 min-w-16" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-xs">
            {spec.categories.map((c, i) => (
              <div key={c}><span className="font-bold">{c}:</span> {spec.items[i].join(', ')}</div>
            ))}
          </div>
          <ol className="text-sm list-decimal list-inside space-y-1">
            {spec.clues.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        </div>
      );
    case 'symbol-sequence':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-lg font-display">
            {spec.symbols.map((s, i) => (
              <span key={i} className={`px-2 py-1 rounded border ${spec.blanks.includes(i) ? 'border-dashed text-transparent min-w-10' : ''}`}>
                {spec.blanks.includes(i) ? '?' : s}
              </span>
            ))}
          </div>
          {spec.options && <p className="text-sm">Loose pieces: {spec.options.join(', ')}</p>}
        </div>
      );
    case 'cipher-text':
      return (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide">{spec.scriptName}</p>
          <p className="text-xl font-runic break-words leading-relaxed">{spec.body}</p>
          {spec.partialKey && (
            <p className="text-sm">
              Partial key: {Object.entries(spec.partialKey).map(([c, p]) => `${c} = ${p}`).join(' · ')}
            </p>
          )}
        </div>
      );
    case 'grid-diagram':
      return (
        <div className="space-y-2">
          <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${spec.cols}, minmax(2rem, auto))` }}>
            {spec.cells.map((c, i) => (
              <div
                key={i}
                className={`aspect-square flex items-center justify-center rounded border text-sm font-bold ${
                  c.state === 'on' ? 'bg-[var(--bronze)] text-[var(--steel-950)]'
                  : c.state === 'off' ? 'bg-[var(--steel-950)] text-[var(--text-2)]'
                  : c.state === 'masked' ? 'border-dashed'
                  : ''
                }`}
              >
                {c.label ?? ''}
              </div>
            ))}
          </div>
          {spec.legend && (
            <ul className="text-xs space-y-0.5">
              {spec.legend.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      );
    case 'attempts-ledger':
      return (
        <div className="space-y-2 text-sm">
          <p className="font-bold">Previous attempts:</p>
          <ol className="list-decimal list-inside space-y-1">
            {spec.attempts.map((a, i) => (
              <li key={i}>
                <span className="font-runic text-lg mr-2">{a.guess.join(' ')}</span>
                <span className="text-xs">{a.feedback}</span>
              </li>
            ))}
          </ol>
          <p>Runes available: <span className="font-runic text-lg">{spec.runeSet.join(' ')}</span></p>
        </div>
      );
    case 'clue-cards':
      return (
        <div className="grid sm:grid-cols-2 gap-2">
          {spec.cards.map((c, i) => (
            <div key={i} className="p-2 rounded border text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold">{c.title}</span>
                <span className="text-xs uppercase tracking-wide">{c.vector}</span>
              </div>
              {c.body}
            </div>
          ))}
        </div>
      );
  }
}
```

- [ ] **Step 4: Credits + verification**

Add to the credits page's license list (match its existing entry markup):
"Noto Sans Runic — © Google, SIL Open Font License 1.1 (subset, runic
block only)". Then:

Run: `npm run typecheck && npm run build`
Expected: both pass; `out/fonts/noto-sans-runic-subset.woff2` exists in the export.

- [ ] **Step 5: Commit**

```bash
git add src/components/PuzzleHandout.tsx scripts/make-runic-font.mjs public/fonts/ src/app/globals.css src/app/credits/page.tsx package.json package-lock.json .gitignore
git commit -m "feat(ui): handout renderer for all spec kinds plus subsetted runic webfont"
```

---

### Task 17: Puzzles page — levers, seeds, share links

**Files:**
- Rewrite (controls + wiring; keep display sections): `src/app/puzzles/page.tsx`

**Interfaces:**
- Consumes: `generatePuzzle`, `getPuzzleCategories`, `Puzzle`, `GeneratePuzzleOptions` (Task 15); `THEME_OPTIONS`, `TONE_OPTIONS`, `TIME_OPTIONS` (Task 2); `PuzzleHandout` (Task 16); `handoutToText` (Task 4); `usePersistentState`; `randomSeed` from `src/lib/random.ts`.
- Produces: the shipped page. URL contract (permanent, spec §6.8): `/puzzles?seed=&cat=&diff=&lvl=&size=&theme=&tone=&time=` — omitted params mean "Any"/default.

**Requirements (all from spec §6.8/§10):**
1. Keep existing lever keys (`puzzleCategory`, `puzzleDifficulty` — `''` still means Any — `puzzlePartyLevel`); add `puzzlePartySize` (default 4), `puzzleTheme` (`'any'`), `puzzleTone` (`'standard'`), `puzzleTime` (`'standard'`). History moves to `puzzleHistory2` (old key simply ignored).
2. The component using `useSearchParams` sits under a `<Suspense>` boundary (copy the wrapper pattern from `src/app/encounters/page.tsx` — static prerender requirement), and persisted lever state is declared **before** the one-shot URL-hydration effect so shared links override stored preferences.
3. Hydration validation split: numeric params clamped into range (`lvl=25`→20, `size=0`→1, seed into 0–0x7FFFFFFF); unparseable/unknown enum values dropped (take defaults). If a valid `seed` is present, hydrate levers then generate immediately with exactly those values.
4. Generate uses `randomSeed()` (not `Date.now()`); the result card shows a seed chip (`Seed: {puzzle.seed}` — click rerolls with a fresh seed and same levers) and a **Share Link** button that writes the URL (from `puzzle.requested` + concrete lvl/size/tone/time + `puzzle.seed`) to the clipboard with a "Copied ✓" state for ~2 s.
5. Render `puzzle.handout` via `<PuzzleHandout spec={…}/>` (replacing the old `playerHandout` `<pre>` block); render `stages` (when present) as titled cards between Read Aloud and Hints; render `dmAdjudication` (when present) inside the DM Brief card under a "Adjudication" subheading.
6. Markdown export: extend the existing builder with a levers line (`Theme: … | Tone: … | Time: … | Party: N × level L | Seed: S`), the handout via `handoutToText(puzzle.handout)`, stages, and adjudication.
7. History cards add `· {theme label} · {time label}` to their meta line.

Core additions (exact code — merge into the existing component structure):

```tsx
// Hydration (inside the inner component, after ALL usePersistentState declarations):
const CATS = getPuzzleCategories().map(c => c.value);
const searchParams = useSearchParams();
const hydratedRef = useRef(false);
useEffect(() => {
  if (hydratedRef.current) return;
  hydratedRef.current = true;
  const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
  };
  const seedParam = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
  if (seedParam === null) return;
  const catP = searchParams.get('cat');
  const cat = CATS.includes(catP as PuzzleCategory) ? (catP as PuzzleCategory) : undefined;
  const diffP = searchParams.get('diff');
  const diff = (['Easy', 'Medium', 'Hard'] as const).includes(diffP as PuzzleDifficulty) ? (diffP as PuzzleDifficulty) : undefined;
  const lvl = clampInt(searchParams.get('lvl'), 1, 20) ?? 5;
  const size = clampInt(searchParams.get('size'), 1, 8) ?? 4;
  const themeP = searchParams.get('theme');
  const themeV = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
  const toneP = searchParams.get('tone');
  const toneV = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
  const timeP = searchParams.get('time');
  const timeV = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
  setCategory(cat ?? ''); setDifficulty(diff ?? ''); setPartyLevel(lvl); setPartySize(size);
  setTheme(themeV); setTone(toneV); setTimeBudget(timeV);
  const p = generatePuzzle({ category: cat, difficulty: diff, partyLevel: lvl, partySize: size, theme: themeV, tone: toneV, timeBudget: timeV, seed: seedParam });
  setPuzzle(p);
  setHistory(prev => [p, ...prev.filter(h => h.id !== p.id).slice(0, 9)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Share link:
function buildShareUrl(p: Puzzle): string {
  const params = new URLSearchParams();
  params.set('seed', String(p.seed));
  if (p.requested.category) params.set('cat', p.requested.category);
  if (p.requested.difficulty) params.set('diff', p.requested.difficulty);
  params.set('lvl', String(p.partyLevel));
  params.set('size', String(p.partySize));
  params.set('theme', p.requested.theme);
  params.set('tone', p.tone);
  params.set('time', p.timeBudget);
  return `${window.location.origin}/puzzles?${params.toString()}`;
}
```

Steps:

- [ ] **Step 1:** Implement all seven requirements. Reroll = `handleGenerate` with `seed: randomSeed()`; the share button uses `navigator.clipboard.writeText(buildShareUrl(puzzle))`.
- [ ] **Step 2:** Run `npm run typecheck` — PASS.
- [ ] **Step 3:** Run `npm test` — PASS (no page tests exist; suite guards the engine).
- [ ] **Step 4:** Manual verification with the dev server (use the browser preview, never Bash): load `/puzzles`, generate with each lever combination, confirm the seed chip, copy a share link, open it in a new tab, and confirm the identical puzzle reappears; print-preview one puzzle with a grid handout.
- [ ] **Step 5: Commit**

```bash
git add src/app/puzzles/page.tsx
git commit -m "feat(puzzles): lever controls, seed chip, and share links on the puzzles page"
```

---

### Task 18: Route copy + final verification + PR

**Files:**
- Modify: `src/lib/site.ts` (the `/puzzles` route entry)

- [ ] **Step 1:** Update the `/puzzles` route copy in `src/lib/site.ts` to name the new capabilities. Replace the existing description with:
  "Verified logic puzzles, riddles, ciphers, and contests — themed, seeded, and shareable, with print-ready player handouts." Check the homepage string mentioning puzzles (`site.ts:10`) still reads correctly.
- [ ] **Step 2:** Full gate: `npm run typecheck && npm test && npm run build` — all pass, 0 errors. Lint via `npm run lint` (or the worktree fallback noted in Global Constraints).
- [ ] **Step 3:** Browser pass over `/puzzles` (dev server via the preview tool): one generation per category, one per theme, a whimsical-tone and grim-tone generation, a set-piece gauntlet (stages render), a Hard cipher (runic glyphs render in the shipped webfont — check the Network tab that the woff2 loads), and a share-link round-trip.
- [ ] **Step 4:** Commit any copy tweaks; push the branch.

```bash
git add src/lib/site.ts
git commit -m "feat(site): puzzles route copy for engine v2"
git push
```

- [ ] **Step 5:** Open the PR (base `main`) titled `feat(puzzles): non-combat engine v2 — core + puzzles overhaul`, with a body summarizing: shared lever core, 12 families (8 verified-constructive), 100+ riddle corpus, licensing remediation (Hobbit riddles removed + denylist CI), rendered handouts + runic webfont, seeds/share links, and the test additions. Link the spec and this plan. Reference the tracking issue (see Delivery wrap-up).

---

## Delivery wrap-up (for the orchestrating session, not a plan task)

- Create milestone **"Non-Combat Encounter Engine v2"** and three issues:
  1. `feat: puzzles overhaul — shared core + 12 families + riddle corpus` (this plan; closes with PR 1)
  2. `feat: challenges overhaul — six frameworks incl. chase + investigation` (PR 2; plan to be written after PR 1 merges, against the merged codebase)
  3. `enhancement: player-facing screen mode for puzzle handouts` (backlog fast-follow, spec §3)
- PR 2 plan lives at `docs/superpowers/plans/<date>-noncombat-engine-v2-pr2-challenges.md` when written; it consumes Tasks 1–4's shared core unchanged and extends `src/data/noncombat-scenarios.ts` and `src/data/noncombat-cast.ts`.
