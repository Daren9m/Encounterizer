# Non-Combat Encounter Engine v2 — PR 2 (Challenges) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/challenges` on the shared non-combat core with six frameworks — skill challenges, social encounters, exploration chains, complex traps, and the new chases and investigations — all levered, themed, seeded, and shareable.

**Architecture:** Six framework modules in `src/lib/challenge-frameworks/` (mirroring `puzzle-engines/`) generate structured encounters from `ResolvedLevers` + the shared theming layer. The `generateNoncombatEncounter` orchestrator in `src/lib/noncombat-generator.ts` keeps its exported names, resolves levers in a frozen draw order (type → theme → construction), and echoes `requested` levers for share links. Content lives in `src/data/` (`noncombat-cast.ts` new; `noncombat-scenarios.ts` extended). The page mirrors the shipped puzzles page.

**Tech Stack:** Next.js 14 static export, TypeScript strict, Tailwind, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-noncombat-encounter-engine-v2-design.md` §6, §8, §9–§12 (§7 puzzles shipped in PR 1).

## Global Constraints

- Everything in `src/lib/` is pure: no DOM, storage, network, `Date.now()`. IDs derive from the seed (`nc-${seed}-${type}`).
- Never modify `src/lib/random.ts`, the shipped puzzle engines, or the PR-1 golden pins.
- Frozen draw order for challenges (permanent `?seed=` contract): 1) `type` explicit or ONE uniform draw over the six types; 2) theme via `resolveTheme(choice, rng)`; 3) framework construction. **Difficulty is never drawn** — challenges has no "Any" difficulty (default `'Medium'`, spec §6).
- Same seed + levers ⇒ `JSON.stringify`-identical output. Golden-pin tests lock the draw order, including one explicit-lever pin (PR-1 lesson).
- Difficulty labels `Easy`/`Medium`/`Hard`. Damage text comes only from `damageDice` (§6.2 column rule: climactic = difficulty-mapped, recurring = setback). Tone owns consequence templates via `failureText`/`rewardText` — **no dice/DC text inside data-pool strings**.
- Prose conventions (PR-1 review-locked): `cap()` only for the first token of `readAloud`; em-dash `pack.sensory` fragments stay lowercase; `withArticle()` wherever `a`/`A` precedes a pack-supplied word.
- `npm run typecheck`, `npm test`, `npm run build` green at every commit. `next lint` breaks in `.claude/worktrees` checkouts — standalone eslint fallback. Conventional commits; no AI attribution; push after every commit.

## Shared core already shipped (consume, don't rebuild)

From `src/lib/noncombat/levers.ts`: `dcFor(level, diff)`, `damageDice(level, diff, kind)`, `successesNeeded(partySize, budget, diff)`, `phaseSplit(successes)`, `groupCheckThreshold(partySize)`, `contestRounds(budget)` (3/5/7 — chases reuse it per spec §8.5), `tierIndex(level)`, `estimatedMinutes(budget)`, `hintCount(budget)`.
From `src/lib/noncombat/theming.ts`: `resolveTheme`, `failureText`, `rewardText`, `cap`, `withArticle`, `THEME_OPTIONS`, `TONE_OPTIONS`, `TIME_OPTIONS`.
From `src/lib/noncombat/types.ts`: `ThemeId`, `ThemeChoice`, `Tone`, `TimeBudget`, `Difficulty`, `ThemePack`, `HandoutSpec`, `ResolvedLevers`.
From `src/lib/noncombat/handout-text.ts`: `handoutToText`.
Component: `src/components/PuzzleHandout.tsx` (default export) renders every `HandoutSpec` kind, including `clue-cards`.

## File Structure (PR 2)

| File | Responsibility |
|---|---|
| `src/lib/noncombat/types.ts` | Modify — add `SkillChallengeStructure`, `AttitudeTrack`, `ClueWeb`, `ChasePlan` (spec §11 shapes) |
| `src/lib/challenge-frameworks/frame.ts` | Create — `FrameworkInput`/`FrameworkOutput`/`ChallengeFramework` contract |
| `src/lib/challenge-frameworks/{skill-challenge,social,exploration,trap,chase,investigation}.ts` | Create — one framework each |
| `src/lib/challenge-frameworks/index.ts` | Create — `FRAMEWORKS` registry (exactly 6) |
| `src/lib/noncombat-generator.ts` | Rewrite — orchestrator; keeps `generateNoncombatEncounter`, `getChallengeTypes`, `NoncombatEncounter`, `SkillCheck`, `ChallengeType` exports |
| `src/data/noncombat-cast.ts` | Create — personas/wants/secrets/leverage + social complication/interruption pools |
| `src/data/noncombat-scenarios.ts` | Extend — objectives, obstacles, trap frames, quarries, waypoint complications, investigation frames (existing contest/gauntlet pools untouched) |
| `src/app/challenges/page.tsx` | Rewrite controls/wiring (mirror `src/app/puzzles/page.tsx`); keep display idiom |
| `src/lib/site.ts` | Modify — `/challenges` route copy |
| `src/lib/__tests__/noncombat-cast.test.ts` | Create — cast pool lint |
| `src/lib/__tests__/challenge-frameworks.test.ts` | Create — per-framework property tests (grows Tasks 2–7) |
| `src/lib/__tests__/noncombat-generator.test.ts` | Create — orchestrator determinism/golden/coverage/back-compat |

---

### Task 1: Challenge content — cast file + scenario extensions + lints

**Files:**
- Create: `src/data/noncombat-cast.ts`
- Modify: `src/data/noncombat-scenarios.ts` (append new sections; do not touch CONTEST_TYPES/SIDE_EVENTS/GAUNTLET_HAZARDS)
- Test: `src/lib/__tests__/noncombat-cast.test.ts` (covers both files' new pools)

**Interfaces:**
- Consumes: nothing new.
- Produces (Tasks 2–7 consume these exact names):
  - From `noncombat-cast.ts`: `PERSONAS: Persona[]` (≥12, `{ archetype: string; quirk: string; speech: string }`), `WANTS: string[]` (≥16), `SECRETS: string[]` (≥16), `LEVERAGE: Leverage[]` (exactly 6, `{ kind: 'coin' | 'flattery' | 'threat' | 'logic' | 'favor' | 'secret-for-secret'; approach: string; counter: string }`), `SOCIAL_COMPLICATIONS: string[]` (≥8), `INTERRUPTIONS: string[]` (≥6)
  - From `noncombat-scenarios.ts`: `SKILL_OBJECTIVES: SkillObjective[]` (≥12, `{ name: string; setup: string; phaseTitles: [string, string, string]; primarySkills: string[]; secondarySkills: string[] }`), `OBSTACLES: Obstacle[]` (≥15, `{ name: string; desc: string; skills: string[]; creative: string }`), `WEATHER: string[]` (≥8 travel-weather lines, e.g. 'a sideways sleet that erases tracks within minutes' — spec §8.3's terrain × weather × theme), `TRAP_FRAMES: TrapFrame[]` (≥12, `{ name: string; trigger: string; effect: string; escalation: string; countermeasures: { skill: string; action: string }[]; clues: string[]; reset: string; twist: string }`), `QUARRIES: Quarry[]` (≥10, `{ archetype: string; speedNote: string; trick: string; desperation: string }`), `WAYPOINTS: Waypoint[]` (≥12, `{ text: string; skill: string }`), `INVESTIGATION_FRAMES: InvestigationFrame[]` (≥10, `{ crime: string; methods: string[]; motives: string[] }`)

**Content requirements (deliverable, enforced by the lint test + PR review):**
- Vivid, table-ready medieval-fantasy register. **No anachronisms** (no firearms, wire, clockwork-industrial). **No dice expressions (`NdN`) or `DC` text in any string** — engines add all numbers.
- `primarySkills`: ≥4 skills spanning ≥4 different ability scores (the lint maps skills→abilities); `secondarySkills` ≥3.
- `TRAP_FRAMES[i].countermeasures` exactly 3 steps (engines slice 2/2/3 by difficulty), each a different skill; `clues` ≥2.
- `INVESTIGATION_FRAMES[i].methods` ≥2, `motives` ≥2.
- Two complete example entries per pool below; author the rest at the same fidelity.

```ts
// src/data/noncombat-cast.ts (excerpt — shapes + register examples)
export interface Persona { archetype: string; quirk: string; speech: string }
export interface Leverage {
  kind: 'coin' | 'flattery' | 'threat' | 'logic' | 'favor' | 'secret-for-secret';
  approach: string;   // what moves them
  counter: string;    // what backfires
}

export const PERSONAS: Persona[] = [
  { archetype: 'a guild clerk drowning in ledgers', quirk: 'stacks and restacks papers when nervous', speech: 'answers questions with smaller questions' },
  { archetype: 'a retired sell-sword turned innkeep', quirk: 'polishes the same tankard throughout', speech: 'short sentences, long pauses' },
  // ...10+ more
];

export const WANTS: string[] = [
  'safe passage for a wagon that must not be inspected',
  'a rival\'s letter retrieved before it is read aloud at council',
  // ...14+ more
];

export const SECRETS: string[] = [
  'the debt they owe is to someone who does not forgive in coin',
  'they witnessed the crime everyone is asking about — from the wrong side',
  // ...14+ more
];

export const LEVERAGE: Leverage[] = [
  { kind: 'coin', approach: 'a fair price named plainly, half up front', counter: 'haggling insults them — the price rises' },
  { kind: 'secret-for-secret', approach: 'trade a confidence of equal weight', counter: 'a hollow or invented secret ends all trust' },
  // ...4 more (flattery, threat, logic, favor)
];

export const SOCIAL_COMPLICATIONS: string[] = [
  'a rival faction watches the conversation and will act on whatever is agreed',
  // ...7+ more
];

export const INTERRUPTIONS: string[] = [
  'a third party arrives mid-conversation with a competing offer',
  // ...5+ more
];
```

```ts
// src/data/noncombat-scenarios.ts (appended sections — shapes + examples)
export interface SkillObjective {
  name: string; setup: string;
  phaseTitles: [string, string, string];
  primarySkills: string[]; secondarySkills: string[];
}
export interface Obstacle { name: string; desc: string; skills: string[]; creative: string }
export interface TrapFrame {
  name: string; trigger: string; effect: string; escalation: string;
  countermeasures: { skill: string; action: string }[];
  clues: string[]; reset: string; twist: string;
}
export interface Quarry { archetype: string; speedNote: string; trick: string; desperation: string }
export interface Waypoint { text: string; skill: string }
export interface InvestigationFrame { crime: string; methods: string[]; motives: string[] }

export const SKILL_OBJECTIVES: SkillObjective[] = [
  {
    name: 'Escape the Burning Granary',
    setup: 'Smoke fills the rafters and the only stair is already alight; the harvest — and the workers — are still inside.',
    phaseTitles: ['Raise the alarm', 'Clear a path', 'The last dash'],
    primarySkills: ['Athletics', 'Perception', 'Investigation', 'Persuasion'],
    secondarySkills: ['Arcana', 'Survival', 'Sleight of Hand'],
  },
  // ...11+ more
];

export const TRAP_FRAMES: TrapFrame[] = [
  {
    name: 'The Tithing Scale',
    trigger: 'lifting the offering bowl without leaving equal weight',
    effect: 'the dais tilts and a ring of blades sweeps the platform',
    escalation: 'each round the ring tightens, shrinking the safe center',
    countermeasures: [
      { skill: 'Sleight of Hand', action: 'feed coins onto the pan as the bowl lifts, keeping the balance true' },
      { skill: 'Athletics', action: 'jam the dais gears with a pry bar and hold them' },
      { skill: 'Arcana', action: 'still the counterweight enchantment at its rune cluster' },
    ],
    clues: ['the platform edge is scarred in a perfect circle', 'old coins lie fused to the pan in a thin wax of dried blood'],
    reset: 'the ring retracts and the scale rebalances one minute after weight is restored',
    twist: 'the counterweight vault below holds the previous offerings — and a way down',
  },
  // ...11+ more
];
// OBSTACLES (≥15), QUARRIES (≥10), WAYPOINTS (≥12), INVESTIGATION_FRAMES (≥10) at the same fidelity
```

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/noncombat-cast.test.ts
import { describe, it, expect } from 'vitest';
import { PERSONAS, WANTS, SECRETS, LEVERAGE, SOCIAL_COMPLICATIONS, INTERRUPTIONS } from '../../data/noncombat-cast';
import { SKILL_OBJECTIVES, OBSTACLES, WEATHER, TRAP_FRAMES, QUARRIES, WAYPOINTS, INVESTIGATION_FRAMES } from '../../data/noncombat-scenarios';

const SKILL_ABILITY: Record<string, string> = {
  Athletics: 'STR',
  Acrobatics: 'DEX', 'Sleight of Hand': 'DEX', Stealth: 'DEX',
  Arcana: 'INT', History: 'INT', Investigation: 'INT', Nature: 'INT', Religion: 'INT',
  'Animal Handling': 'WIS', Insight: 'WIS', Medicine: 'WIS', Perception: 'WIS', Survival: 'WIS',
  Deception: 'CHA', Intimidation: 'CHA', Performance: 'CHA', Persuasion: 'CHA',
  Constitution: 'CON', "Thieves' Tools": 'DEX',
};

const NO_MECHANICS = (pools: string[][]) => {
  for (const pool of pools) {
    for (const s of pool) {
      expect(s, s).not.toMatch(/\d+d\d+/);
      expect(s, s).not.toMatch(/\bDC\b/);
    }
  }
};

describe('cast pools (spec §8.2)', () => {
  it('meets minimum sizes', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(12);
    expect(WANTS.length).toBeGreaterThanOrEqual(16);
    expect(SECRETS.length).toBeGreaterThanOrEqual(16);
    expect(LEVERAGE).toHaveLength(6);
    expect(SOCIAL_COMPLICATIONS.length).toBeGreaterThanOrEqual(8);
    expect(INTERRUPTIONS.length).toBeGreaterThanOrEqual(6);
  });
  it('leverage covers all six kinds exactly once', () => {
    expect(new Set(LEVERAGE.map(l => l.kind)).size).toBe(6);
  });
  it('carries no dice or DC text (tone/severity layers own numbers)', () => {
    NO_MECHANICS([
      PERSONAS.flatMap(p => [p.archetype, p.quirk, p.speech]),
      WANTS, SECRETS,
      LEVERAGE.flatMap(l => [l.approach, l.counter]),
      SOCIAL_COMPLICATIONS, INTERRUPTIONS,
    ]);
  });
});

describe('scenario pools (spec §8)', () => {
  it('meets minimum sizes', () => {
    expect(SKILL_OBJECTIVES.length).toBeGreaterThanOrEqual(12);
    expect(OBSTACLES.length).toBeGreaterThanOrEqual(15);
    expect(WEATHER.length).toBeGreaterThanOrEqual(8);
    expect(TRAP_FRAMES.length).toBeGreaterThanOrEqual(12);
    expect(QUARRIES.length).toBeGreaterThanOrEqual(10);
    expect(WAYPOINTS.length).toBeGreaterThanOrEqual(12);
    expect(INVESTIGATION_FRAMES.length).toBeGreaterThanOrEqual(10);
  });
  it.each(SKILL_OBJECTIVES.map(o => [o.name, o] as const))('%s: primary skills span ≥4 abilities', (_n, o) => {
    expect(o.primarySkills.length).toBeGreaterThanOrEqual(4);
    expect(o.secondarySkills.length).toBeGreaterThanOrEqual(3);
    const abilities = new Set(o.primarySkills.map(s => {
      expect(SKILL_ABILITY[s], `unknown skill ${s}`).toBeDefined();
      return SKILL_ABILITY[s];
    }));
    expect(abilities.size).toBeGreaterThanOrEqual(4);
    expect(o.phaseTitles).toHaveLength(3);
  });
  it.each(TRAP_FRAMES.map(t => [t.name, t] as const))('%s: 3 distinct-skill countermeasures, ≥2 clues', (_n, t) => {
    expect(t.countermeasures).toHaveLength(3);
    expect(new Set(t.countermeasures.map(c => c.skill)).size).toBe(3);
    expect(t.clues.length).toBeGreaterThanOrEqual(2);
  });
  it('obstacles carry 2–3 skills; investigation frames carry ≥2 methods and motives', () => {
    for (const o of OBSTACLES) {
      expect(o.skills.length).toBeGreaterThanOrEqual(2);
      expect(o.skills.length).toBeLessThanOrEqual(3);
    }
    for (const f of INVESTIGATION_FRAMES) {
      expect(f.methods.length).toBeGreaterThanOrEqual(2);
      expect(f.motives.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('carries no dice or DC text', () => {
    NO_MECHANICS([
      SKILL_OBJECTIVES.flatMap(o => [o.name, o.setup, ...o.phaseTitles]),
      OBSTACLES.flatMap(o => [o.name, o.desc, o.creative]),
      WEATHER,
      TRAP_FRAMES.flatMap(t => [t.name, t.trigger, t.effect, t.escalation, t.reset, t.twist, ...t.clues, ...t.countermeasures.map(c => c.action)]),
      QUARRIES.flatMap(q => [q.archetype, q.speedNote, q.trick, q.desperation]),
      WAYPOINTS.map(w => w.text),
      INVESTIGATION_FRAMES.flatMap(f => [f.crime, ...f.methods, ...f.motives]),
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/noncombat-cast.test.ts`
Expected: FAIL — `noncombat-cast` module missing; scenario exports missing.

- [ ] **Step 3: Author the content**

Create `src/data/noncombat-cast.ts` and append the six new sections to `src/data/noncombat-scenarios.ts` per the shapes, minimums, and register above. Do not modify the existing contest/gauntlet pools.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/noncombat-cast.test.ts`
Expected: PASS. Then `npm test` — the existing scenario lint from PR 1 must stay green.

- [ ] **Step 5: Commit**

```bash
git add src/data/noncombat-cast.ts src/data/noncombat-scenarios.ts src/lib/__tests__/noncombat-cast.test.ts
git commit -m "feat(data): challenge cast and scenario pools for six frameworks"
```

---

### Task 2: Framework contract + skill challenge

**Files:**
- Modify: `src/lib/noncombat/types.ts` (append the four §11 shapes)
- Create: `src/lib/challenge-frameworks/frame.ts`
- Create: `src/lib/challenge-frameworks/skill-challenge.ts`
- Test: `src/lib/__tests__/challenge-frameworks.test.ts` (started here, grows through Task 7)

**Interfaces:**
- Consumes: Task 1 data; shipped core (levers/theming/types).
- Produces (every later task relies on these):

```ts
// appended to src/lib/noncombat/types.ts (spec §11, verbatim shapes)
export interface SkillChallengeStructure {
  phases: { title: string; successes: number; primarySkills: string[] }[];
  successesNeeded: number;
  failuresAllowed: number;
}
export type Attitude = 'Hostile' | 'Indifferent' | 'Friendly';
export interface AttitudeTrack {
  start: Attitude;
  stages: { attitude: Attitude; influenceDc: number; unlocks: string; shiftUp: string; shiftDown: string }[];
}
export type ClueVector = 'scene' | 'npc' | 'document' | 'observation';
export interface ClueWeb {
  truth: { culprit: string; method: string; motive: string };
  nodes: { revelation: string; clues: { text: string; vector: ClueVector; pointsTo: string }[] }[];
  redHerring: { text: string; disconfirmedBy: string };
}
export interface ChasePlan {
  rounds: number;
  complications: { round: number; text: string; check: string }[];
  catchCondition: string;
  escapeCondition: string;
}
```

```ts
// src/lib/challenge-frameworks/frame.ts
// ─── Challenge Framework Contract ────────────────────────────────
import type { Rng } from '../random';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, HandoutSpec, ResolvedLevers, SkillChallengeStructure,
} from '../noncombat/types';

export type ChallengeType = 'social' | 'exploration' | 'skill-challenge' | 'trap' | 'chase' | 'investigation';

export interface SkillCheck { skill: string; dc: number; onSuccess: string; onFailure: string }

export interface FrameworkInput { levers: ResolvedLevers; rng: Rng }

export interface FrameworkOutput {
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

export interface ChallengeFramework {
  key: ChallengeType;
  label: string;
  description: string;
  generate(input: FrameworkInput): FrameworkOutput;
}
```

- `skillChallenge: ChallengeFramework` plus the pure builder for property tests: `buildChallengeStructure(levers: ResolvedLevers, phaseTitles?: [string, string, string], objectiveName?: string): SkillChallengeStructure`.

**Behavior (spec §6.3/§8.1, all test-locked):**
- `successesNeeded(partySize, timeBudget, difficulty)` total; `failuresAllowed: 3`.
- Set piece ⇒ phases = `phaseSplit(successes)` mapped onto the objective's 3 `phaseTitles` (2 phases use titles[0] and titles[2]); otherwise one phase titled by the objective name. Phase `primarySkills` rotate through the objective's list so every phase names ≥2 skills.
- Complication ladder: `complication` = "At the 1st failure: {escalation A}. At the 2nd failure: {escalation B}." with A/B drawn from the pack's `consequences` (distinct picks).
- One group-check `SkillCheck`: skill from `primarySkills`, dc `dcFor(level, diff)`, onSuccess/onFailure naming `groupCheckThreshold(partySize)` of `partySize`.
- `skillChecks` = each primary skill at `dc` (narration hooks reference the objective setup) + each secondary at `dc - 2` ("supporting: grants advantage on the next primary check") + the group check.
- `stages` mirror `structure.phases` (title + a one-line text with that phase's successes and skills) when phases > 1.
- Outcomes: full success / partial (≥ half successes) / failure — thresholds computed from `successesNeeded`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/challenge-frameworks.test.ts
import { describe, it, expect } from 'vitest';
import { seededRandom } from '../random';
import { THEME_PACKS } from '../../data/noncombat-themes';
import { successesNeeded, phaseSplit, groupCheckThreshold, dcFor } from '../noncombat/levers';
import type { Difficulty, ResolvedLevers, TimeBudget } from '../noncombat/types';
import { skillChallenge, buildChallengeStructure } from '../challenge-frameworks/skill-challenge';

export function mkLevers(diff: Difficulty, seed: number, over: Partial<ResolvedLevers> = {}): ResolvedLevers {
  return {
    partyLevel: 5, partySize: 4, difficulty: diff,
    theme: THEME_PACKS[seed % THEME_PACKS.length],
    tone: 'standard', timeBudget: 'standard', seed, ...over,
  };
}
export const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const BUDGETS: TimeBudget[] = ['quick', 'standard', 'set-piece'];

describe('skill challenge structure (spec §6.3/§8.1)', () => {
  it('locks successes/phases to the lever math across sizes, budgets, difficulties', () => {
    for (const diff of DIFFS) {
      for (const budget of BUDGETS) {
        for (const size of [1, 2, 4, 6, 8]) {
          const levers = mkLevers(diff, 7, { partySize: size, timeBudget: budget });
          const s = buildChallengeStructure(levers);
          const expectTotal = successesNeeded(size, budget, diff);
          expect(s.successesNeeded).toBe(expectTotal);
          expect(s.failuresAllowed).toBe(3);
          if (budget === 'set-piece') {
            expect(s.phases.map(p => p.successes)).toEqual(phaseSplit(expectTotal));
          } else {
            expect(s.phases).toHaveLength(1);
            expect(s.phases[0].successes).toBe(expectTotal);
          }
          for (const p of s.phases) expect(p.primarySkills.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
  it('generate() emits the group check, the two-step complication ladder, and threshold outcomes', () => {
    const levers = mkLevers('Medium', 11, { partySize: 5 });
    const out = skillChallenge.generate({ levers, rng: seededRandom(11) });
    expect(out.structure).toBeDefined();
    const group = out.skillChecks.find(c => c.onSuccess.includes(`${groupCheckThreshold(5)} of 5`) || c.onFailure.includes(`${groupCheckThreshold(5)} of 5`));
    expect(group, 'group check names ceil(size/2) of size').toBeDefined();
    expect(out.complication).toMatch(/1st failure/i);
    expect(out.complication).toMatch(/2nd failure/i);
    expect(out.outcomes).toHaveLength(3);
    const primaries = out.skillChecks.filter(c => c.dc === dcFor(5, 'Medium'));
    expect(primaries.length).toBeGreaterThanOrEqual(4);
  });
  it('set piece emits stages mirroring the phases', () => {
    const out = skillChallenge.generate({ levers: mkLevers('Hard', 3, { timeBudget: 'set-piece', partySize: 6 }), rng: seededRandom(3) });
    expect(out.stages?.length).toBe(out.structure?.phases.length);
    expect(out.structure!.phases.length).toBeGreaterThanOrEqual(2);
  });
  it('deterministic: same seed ⇒ identical JSON', () => {
    const a = skillChallenge.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    const b = skillChallenge.generate({ levers: mkLevers('Medium', 5), rng: seededRandom(5) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write the implementation**

Add the §11 shapes to `types.ts` and create `frame.ts` exactly as the Interfaces block shows. Then:

```ts
// src/lib/challenge-frameworks/skill-challenge.ts
// ─── Skill Challenge ─────────────────────────────────────────────
// Party-size-derived success count before 3 failures, phase structure
// for set pieces, complication ladder, one group-check moment, and a
// skill palette spread across ≥4 ability scores (spec §8.1).

import { pickRandom as pick, shuffleArray } from '../random';
import { SKILL_OBJECTIVES } from '../../data/noncombat-scenarios';
import { dcFor, groupCheckThreshold, phaseSplit, successesNeeded } from '../noncombat/levers';
import { failureText, rewardText } from '../noncombat/theming';
import type { ResolvedLevers, SkillChallengeStructure } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export function buildChallengeStructure(levers: ResolvedLevers, phaseTitles?: [string, string, string], objectiveName = 'The Challenge'): SkillChallengeStructure {
  const total = successesNeeded(levers.partySize, levers.timeBudget, levers.difficulty);
  const titles = phaseTitles ?? ['Opening', 'Turning point', 'Resolution'];
  const skills = ['Athletics', 'Perception', 'Persuasion', 'Arcana'];
  if (levers.timeBudget !== 'set-piece') {
    return {
      phases: [{ title: objectiveName, successes: total, primarySkills: skills.slice(0, 2) }],
      successesNeeded: total,
      failuresAllowed: 3,
    };
  }
  const split = phaseSplit(total);
  const chosenTitles = split.length === 2 ? [titles[0], titles[2]] : [...titles];
  return {
    phases: split.map((successes, i) => ({
      title: chosenTitles[i],
      successes,
      primarySkills: [skills[i % skills.length], skills[(i + 1) % skills.length]],
    })),
    successesNeeded: total,
    failuresAllowed: 3,
  };
}

export const skillChallenge: ChallengeFramework = {
  key: 'skill-challenge',
  label: 'Skill Challenge',
  description: 'Structured multi-check encounters with phases, escalation, and a group-check moment',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const objective = pick(SKILL_OBJECTIVES, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const total = successesNeeded(levers.partySize, levers.timeBudget, levers.difficulty);
    // Rebuild the structure with the objective's real titles/skills.
    const base = buildChallengeStructure(levers, objective.phaseTitles, objective.name);
    const structure: SkillChallengeStructure = {
      ...base,
      phases: base.phases.map((p, i) => ({
        ...p,
        primarySkills: [
          objective.primarySkills[i % objective.primarySkills.length],
          objective.primarySkills[(i + 1) % objective.primarySkills.length],
        ],
      })),
    };
    const threshold = groupCheckThreshold(levers.partySize);
    const [escA, escB] = shuffleArray(levers.theme.consequences, rng);
    const groupSkill = pick(objective.primarySkills, rng);
    const primaries: SkillCheck[] = objective.primarySkills.map(s => ({
      skill: s, dc,
      onSuccess: `${s} directly advances "${objective.name}" — one success recorded.`,
      onFailure: `The approach backfires — one failure recorded and the pressure mounts.`,
    }));
    const secondaries: SkillCheck[] = objective.secondarySkills.map(s => ({
      skill: s, dc: dc - 2,
      onSuccess: `Supporting effort — grants advantage on the next primary check.`,
      onFailure: `No progress, but no failure recorded either.`,
    }));
    const groupCheck: SkillCheck = {
      skill: groupSkill, dc,
      onSuccess: `Group check: at least ${threshold} of ${levers.partySize} succeed — the whole party surges forward (one success, no individual failures).`,
      onFailure: `Group check: fewer than ${threshold} of ${levers.partySize} succeed — one failure recorded for the group.`,
    };
    const half = Math.ceil(total / 2);
    return {
      name: objective.name,
      readAloud: objective.setup,
      situation: `Skill challenge: ${total} successes before ${structure.failuresAllowed} failures. Each character acts in turn; repeat approaches with the same skill raise the table's eyebrows (and the DC by 2).`,
      stakes: `Success: the objective is achieved cleanly. Failure: the objective slips away — see outcomes.`,
      skillChecks: [...primaries, ...secondaries, groupCheck],
      complication: `At the 1st failure: ${escA}. At the 2nd failure: ${escB}.`,
      outcomes: [
        { label: `${total}+ successes`, description: 'Complete success — everything they set out to do.' },
        { label: `${half}–${total - 1} successes`, description: 'Partial success — objective achieved at a cost (time, injury, position).' },
        { label: `Fewer than ${half}`, description: failureText(levers, rng, { kind: 'climactic', context: 'The challenge collapses.', save: undefined }) },
      ],
      reward: rewardText(levers, rng),
      structure,
      stages: structure.phases.length > 1
        ? structure.phases.map(p => ({ title: p.title, text: `${p.successes} successes here; lead with ${p.primarySkills.join(' or ')}.` }))
        : undefined,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: PASS. Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/noncombat/types.ts src/lib/challenge-frameworks/ src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): framework contract and skill-challenge framework"
```

---

### Task 3: Social framework

**Files:**
- Create: `src/lib/challenge-frameworks/social.ts`
- Test: extend `src/lib/__tests__/challenge-frameworks.test.ts`

**Interfaces:**
- Consumes: Task 1 cast pools; Task 2 contract; `cap` from theming.
- Produces: `social: ChallengeFramework`; test export `buildAttitudeTrack(levers: ResolvedLevers, leverage: Leverage, rng: Rng): AttitudeTrack`.

**Behavior (spec §8.2, test-locked):**
- Principal NPC = `PERSONAS` pick × `WANTS` pick × `SECRETS` pick × `LEVERAGE` pick.
- Attitude track: `start` drawn from `['Hostile', 'Indifferent', 'Indifferent', 'Friendly']` (Indifferent-weighted); `stages` always all three in order Hostile → Indifferent → Friendly with `influenceDc` = `dcFor + 2` / `dcFor` / `dcFor − 2`; `unlocks` escalate (audience only → honest dealing → the secret is within reach); `shiftUp` from the leverage's `approach`, `shiftDown` from its `counter`.
- Side NPCs: `min(partySize − 1, 3)` picks from `pack.cast`, each with a one-line want from `WANTS` — rendered in `situation`.
- `complication` from `SOCIAL_COMPLICATIONS`; one interruption from `INTERRUPTIONS` woven into `stakes`.
- `skillChecks`: Insight (read the persona's quirk), Persuasion (at the CURRENT attitude's dc — text explains dc varies by stage), Deception and Intimidation (with leverage-aware backfire text), Investigation (corroborate the want against the secret).

- [ ] **Step 1: Write the failing test** (append)

```ts
import { social, buildAttitudeTrack } from '../challenge-frameworks/social';
import { LEVERAGE } from '../../data/noncombat-cast';

describe('social framework (spec §8.2)', () => {
  it('attitude track: three ordered stages with locked DC offsets (100 seeds)', () => {
    for (let s = 0; s < 100; s++) {
      const levers = mkLevers('Medium', s);
      const track = buildAttitudeTrack(levers, LEVERAGE[s % LEVERAGE.length], seededRandom(s));
      expect(track.stages.map(t => t.attitude)).toEqual(['Hostile', 'Indifferent', 'Friendly']);
      const dc = dcFor(levers.partyLevel, levers.difficulty);
      expect(track.stages.map(t => t.influenceDc)).toEqual([dc + 2, dc, dc - 2]);
      expect(['Hostile', 'Indifferent', 'Friendly']).toContain(track.start);
      for (const st of track.stages) {
        expect(st.unlocks.length).toBeGreaterThan(0);
        expect(st.shiftUp.length).toBeGreaterThan(0);
        expect(st.shiftDown.length).toBeGreaterThan(0);
      }
    }
  });
  it('side NPCs scale with party size (capped at 3) and appear in the situation', () => {
    const solo = social.generate({ levers: mkLevers('Medium', 9, { partySize: 1 }), rng: seededRandom(9) });
    const six = social.generate({ levers: mkLevers('Medium', 9, { partySize: 6 }), rng: seededRandom(9) });
    expect(solo.situation.match(/Side NPC/g)).toBeNull();
    expect(six.situation.match(/Side NPC/g)?.length).toBe(3);
    expect(six.attitudeTrack).toBeDefined();
  });
  it('deterministic and carries persona texture into the read-aloud', () => {
    const a = social.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    const b = social.generate({ levers: mkLevers('Hard', 21), rng: seededRandom(21) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.readAloud.length).toBeGreaterThan(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/challenge-frameworks/social.ts
// ─── Social Encounter ────────────────────────────────────────────
// Persona × want × secret × leverage, with the three-state attitude
// track from the 2024 influence rules (spec §8.2).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { INTERRUPTIONS, LEVERAGE, PERSONAS, SECRETS, SOCIAL_COMPLICATIONS, WANTS, type Leverage } from '../../data/noncombat-cast';
import { dcFor } from '../noncombat/levers';
import { cap, failureText, rewardText } from '../noncombat/theming';
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
    const want = pick(WANTS, rng);
    const secret = pick(SECRETS, rng);
    const leverage = pick(LEVERAGE, rng);
    const track = buildAttitudeTrack(levers, leverage, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const sideCount = Math.min(Math.max(levers.partySize - 1, 0), 3);
    const sides = shuffleArray(pack.cast, rng).slice(0, sideCount)
      .map(c => `Side NPC: ${c} — wants ${pick(WANTS, rng)}.`);
    const complication = pick(SOCIAL_COMPLICATIONS, rng);
    const interruption = pick(INTERRUPTIONS, rng);
    return {
      name: `The ${pick(['Proposition', 'Petition', 'Bargain', 'Confession', 'Overture', 'Reckoning'], rng)}`,
      readAloud: `${cap(persona.archetype)} seeks you out — ${pack.sensory[0]}. They ${persona.speech}, and ${persona.quirk}.`,
      situation: [
        `${cap(persona.archetype)} wants: ${want}. Their manner: starts ${track.start}.`,
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
        { label: 'Sour to Hostile', description: failureText(levers, rng, { kind: 'climactic', context: 'The exchange collapses and word spreads.', save: undefined }) },
      ],
      reward: rewardText(levers, rng),
      attitudeTrack: track,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/social.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): social framework with attitude track and leverage"
```

---

### Task 4: Exploration framework

**Files:**
- Create: `src/lib/challenge-frameworks/exploration.ts`
- Test: extend `src/lib/__tests__/challenge-frameworks.test.ts`

**Interfaces:**
- Consumes: `OBSTACLES` (Task 1); Task 2 contract; `tierIndex`, `groupCheckThreshold`, `dcFor`, `damageDice` from levers; theming helpers.
- Produces: `exploration: ChallengeFramework`; test export `TIER_GUIDANCE: readonly string[]` (4 entries, indexed by `tierIndex`).

**Behavior (spec §8.3, test-locked):**
- Chain length = 1 (quick) / 2 (standard) / 3 (set-piece), distinct `OBSTACLES` picks; chains of >1 render as `stages` (one per obstacle: name + desc + creative option).
- One `WEATHER` pick per encounter (spec §8.3's terrain × weather × theme): rendered in `situation` as `Weather: {pick}.` and woven into the read-aloud after the obstacle description.
- Resource costs by difficulty: Easy "time only (a detour of hours)"; Medium "+ 1 level of exhaustion on a failed crossing"; Hard "+ supplies lost and 1 level of exhaustion" — appears in `stakes`, with damage text via `failureText(..., { kind: 'climactic', ... })` for a failed attempt: spec §6.2 classifies exploration obstacle failure as ONE-TIME CLIMACTIC harm (Easy→Setback, Medium→Dangerous, Hard→Deadly), not recurring.
- Tier-aware creative menu: `TIER_GUIDANCE[tierIndex(level)]` — tier 0 "no flight or teleport assumed; rope, timing, and wits", tier 1 "misty step, spider climb, and enhanced jumps are on the table — gate the shortcut, not the crossing", tier 2 "assume fly and dimension door: the obstacle should threaten the whole party's transit, not one climber", tier 3 "routine flight and teleport: make the obstacle wide, warded, or alive so it stays interesting". Rendered in `situation`.
- One group-check `SkillCheck` per encounter (first obstacle's first skill) naming `groupCheckThreshold(partySize)` of `partySize`; other obstacle skills as normal checks at `dcFor`.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { exploration, TIER_GUIDANCE } from '../challenge-frameworks/exploration';

describe('exploration framework (spec §8.3)', () => {
  it('chain length follows time budget; chains render as stages', () => {
    const quick = exploration.generate({ levers: mkLevers('Medium', 4, { timeBudget: 'quick' }), rng: seededRandom(4) });
    expect(quick.stages).toBeUndefined();
    const std = exploration.generate({ levers: mkLevers('Medium', 4), rng: seededRandom(4) });
    expect(std.stages).toHaveLength(2);
    const set = exploration.generate({ levers: mkLevers('Medium', 4, { timeBudget: 'set-piece' }), rng: seededRandom(4) });
    expect(set.stages).toHaveLength(3);
    const names = set.stages!.map(s => s.title);
    expect(new Set(names).size).toBe(3); // distinct obstacles
  });
  it('tier guidance tracks party level', () => {
    expect(TIER_GUIDANCE).toHaveLength(4);
    const low = exploration.generate({ levers: mkLevers('Medium', 8, { partyLevel: 3 }), rng: seededRandom(8) });
    expect(low.situation).toContain(TIER_GUIDANCE[0]);
    const high = exploration.generate({ levers: mkLevers('Medium', 8, { partyLevel: 18 }), rng: seededRandom(8) });
    expect(high.situation).toContain(TIER_GUIDANCE[3]);
  });
  it('emits exactly one group check naming the party-size threshold', () => {
    const out = exploration.generate({ levers: mkLevers('Hard', 6, { partySize: 6 }), rng: seededRandom(6) });
    // groupCheckThreshold(6) = ceil(6/2) = 3
    const groups = out.skillChecks.filter(c => c.onSuccess.includes('3 of 6') || c.onFailure.includes('3 of 6'));
    expect(groups).toHaveLength(1);
  });
  it('weaves a weather condition into the situation', () => {
    const out = exploration.generate({ levers: mkLevers('Medium', 12), rng: seededRandom(12) });
    expect(out.situation).toMatch(/Weather:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/challenge-frameworks/exploration.ts
// ─── Exploration / Journey ───────────────────────────────────────
// Obstacle chains sized by time budget, tier-aware creative menus,
// and resource costs by difficulty (spec §8.3).

import { pickRandom as pick, shuffleArray } from '../random';
import { OBSTACLES, WEATHER } from '../../data/noncombat-scenarios';
import { dcFor, groupCheckThreshold, tierIndex } from '../noncombat/levers';
import { cap, failureText, rewardText } from '../noncombat/theming';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export const TIER_GUIDANCE = [
  'no flight or teleport assumed; rope, timing, and wits carry the day',
  'misty step, spider climb, and enhanced jumps are on the table — gate the shortcut, not the crossing',
  'assume fly and dimension door: the obstacle should threaten the whole party\'s transit, not one climber',
  'routine flight and teleport: make the obstacle wide, warded, or alive so it stays interesting',
] as const;

const CHAIN_LENGTH = { quick: 1, standard: 2, 'set-piece': 3 } as const;

const RESOURCE_COST = {
  Easy: 'a failed attempt costs time — hours of detour or backtracking',
  Medium: 'a failed attempt costs time and grinds the party down — 1 level of exhaustion for the one who slipped',
  Hard: 'a failed attempt costs time, supplies (rations, rope, or a tool of the DM\'s choice), and 1 level of exhaustion',
} as const;

export const exploration: ChallengeFramework = {
  key: 'exploration',
  label: 'Exploration Challenge',
  description: 'Environmental obstacles and journeys — chained for longer sessions',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const chain = shuffleArray(OBSTACLES, rng).slice(0, CHAIN_LENGTH[levers.timeBudget]);
    const lead = chain[0];
    const weather = pick(WEATHER, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const threshold = groupCheckThreshold(levers.partySize);
    const guidance = TIER_GUIDANCE[tierIndex(levers.partyLevel)];
    const groupCheck: SkillCheck = {
      skill: lead.skills[0], dc,
      onSuccess: `Group check: at least ${threshold} of ${levers.partySize} succeed and the whole party crosses together.`,
      onFailure: `Group check: fewer than ${threshold} of ${levers.partySize} make it — the stragglers pay the crossing's price.`,
    };
    const rest: SkillCheck[] = chain.flatMap((o, i) =>
      o.skills.slice(i === 0 ? 1 : 0).map(s => ({
        skill: s, dc,
        onSuccess: `${s} finds a way past ${o.name.toLowerCase()}.`,
        // Spec §6.2: exploration obstacle failure is one-time CLIMACTIC harm.
        onFailure: failureText(levers, rng, { kind: 'climactic', context: `${cap(o.name)} exacts its toll.`, save: 'DEX' }),
      })),
    );
    return {
      name: chain.length > 1 ? `The ${pick(['Long Road', 'Hard Crossing', 'Winding Descent', 'Overland Gauntlet'], rng)}` : lead.name,
      readAloud: `${cap(lead.desc)} Overhead, ${weather} — ${pack.sensory[3] ?? pack.sensory[0]}.`,
      situation: `The party must get through. Weather: ${weather}. At this tier, ${guidance}. Creative route for ${lead.name.toLowerCase()}: ${lead.creative}.`,
      stakes: `Success: the journey continues on schedule. Failure: ${RESOURCE_COST[levers.difficulty]}.`,
      skillChecks: [groupCheck, ...rest],
      complication: pick(pack.consequences, rng),
      outcomes: [
        { label: 'Push through', description: 'Checks and grit — the party arrives tired but on time.' },
        { label: 'The creative route', description: chain.map(o => o.creative).join(' Then: ') },
        { label: 'Go around', description: 'Half a day lost, but no risk — and whatever waits ahead has longer to prepare.' },
      ],
      reward: rewardText(levers, rng),
      stages: chain.length > 1
        ? chain.map(o => ({ title: o.name, text: `${o.desc} Creative option: ${o.creative}` }))
        : undefined,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/exploration.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): exploration framework with chains and tier guidance"
```

---

### Task 5: Trap framework

**Files:**
- Create: `src/lib/challenge-frameworks/trap.ts`
- Test: extend `src/lib/__tests__/challenge-frameworks.test.ts`

**Interfaces:**
- Consumes: `TRAP_FRAMES` (Task 1); Task 2 contract; `dcFor`, `damageDice`.
- Produces: `trap: ChallengeFramework`; test export `COUNTERMEASURE_STEPS: Record<Difficulty, number>` (`{ Easy: 2, Medium: 2, Hard: 3 }`).

**Behavior (spec §8.4, test-locked):**
- Complex trap from a `TRAP_FRAMES` pick: trigger, initial effect + escalation, countermeasure steps sliced to 2/2/3 by difficulty (each step = one `SkillCheck` at `dcFor`, sequenced "Step 1/2/3" in the text), detection clues surfaced in `situation` BEFORE the trigger description, reset behavior, twist as `complication`.
- Damage: trigger = `damageDice(level, diff, 'climactic')` with a save; escalation ticks = `damageDice(level, diff, 'recurring')` per round. Both appear in `stakes`.
- Detection checks: Perception at `dc` (spot a clue), Investigation at `dc − 2` (deduce the mechanism) — plus the countermeasure steps.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { trap, COUNTERMEASURE_STEPS } from '../challenge-frameworks/trap';
import { damageDice } from '../noncombat/levers';

describe('trap framework (spec §8.4)', () => {
  it('countermeasure steps slice 2/2/3 by difficulty and sequence in text', () => {
    expect(COUNTERMEASURE_STEPS).toEqual({ Easy: 2, Medium: 2, Hard: 3 });
    for (const diff of DIFFS) {
      const out = trap.generate({ levers: mkLevers(diff, 13), rng: seededRandom(13) });
      const steps = out.skillChecks.filter(c => /^Step \d/.test(c.onSuccess));
      expect(steps).toHaveLength(COUNTERMEASURE_STEPS[diff]);
    }
  });
  it('uses climactic damage for the trigger and recurring for escalation', () => {
    const out = trap.generate({ levers: mkLevers('Hard', 17, { partyLevel: 11 }), rng: seededRandom(17) });
    expect(out.stakes).toContain(damageDice(11, 'Hard', 'climactic'));   // 18d10
    expect(out.stakes).toContain(damageDice(11, 'Hard', 'recurring'));   // 4d10
  });
  it('surfaces detection clues in the situation and the twist as the complication', () => {
    const out = trap.generate({ levers: mkLevers('Medium', 19), rng: seededRandom(19) });
    expect(out.situation).toMatch(/Clue/i);
    expect(out.complication.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/challenge-frameworks/trap.ts
// ─── Complex Trap ────────────────────────────────────────────────
// Trigger, escalating effect, multi-step countermeasures, detection
// clues placed before the trigger, reset, twist (spec §8.4).

import { pickRandom as pick } from '../random';
import { TRAP_FRAMES } from '../../data/noncombat-scenarios';
import { damageDice, dcFor } from '../noncombat/levers';
import { cap, rewardText } from '../noncombat/theming';
import type { Difficulty } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export const COUNTERMEASURE_STEPS: Record<Difficulty, number> = { Easy: 2, Medium: 2, Hard: 3 };

export const trap: ChallengeFramework = {
  key: 'trap',
  label: 'Trap / Hazard',
  description: 'Complex traps: detection, escalation, multi-step countermeasures, and a twist',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const frame = pick(TRAP_FRAMES, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const triggerDice = damageDice(levers.partyLevel, levers.difficulty, 'climactic');
    const tickDice = damageDice(levers.partyLevel, levers.difficulty, 'recurring');
    const steps = frame.countermeasures.slice(0, COUNTERMEASURE_STEPS[levers.difficulty]);
    const stepChecks: SkillCheck[] = steps.map((c, i) => ({
      skill: c.skill, dc,
      onSuccess: `Step ${i + 1} of ${steps.length}: ${c.action} — the mechanism yields a little more.`,
      onFailure: `The step slips — the trap ${i === 0 ? 'arms with an audible change in pitch' : 'escalates: ' + frame.escalation}.`,
    }));
    return {
      name: cap(frame.name),
      readAloud: `${cap(pack.sensory[2] ?? pack.sensory[0])}. Nothing about the way ahead looks wrong — which is exactly what feels wrong.`,
      situation: `Clues (visible before the trigger): ${frame.clues.join('; ')}. Trigger: ${frame.trigger}. Reset: ${frame.reset}.`,
      stakes: `On trigger: ${frame.effect} — ${triggerDice} damage (DC ${dc} DEX save for half). Each round after: ${frame.escalation} — ${tickDice} damage, no save, until a countermeasure step succeeds.`,
      skillChecks: [
        { skill: 'Perception', dc, onSuccess: `You notice: ${frame.clues[0]}.`, onFailure: 'Nothing seems out of place.' },
        { skill: 'Investigation', dc: dc - 2, onSuccess: 'You deduce the mechanism and where to interrupt it.', onFailure: 'You suspect something but cannot pinpoint it.' },
        ...stepChecks,
      ],
      complication: `Twist: ${frame.twist}`,
      outcomes: [
        { label: 'Detected and disarmed', description: `All ${steps.length} countermeasure steps succeed — no harm done, and the twist may pay off.` },
        { label: 'Detected, bypassed', description: 'The party routes around or triggers it from safety; the twist stays unexplored.' },
        { label: 'Triggered', description: `Full effect, then per-round escalation until the steps are completed under pressure.` },
      ],
      reward: rewardText(levers, rng),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/trap.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): complex trap framework with stepped countermeasures"
```

---

### Task 6: Chase framework

**Files:**
- Create: `src/lib/challenge-frameworks/chase.ts`
- Test: extend `src/lib/__tests__/challenge-frameworks.test.ts`

**Interfaces:**
- Consumes: `QUARRIES`, `WAYPOINTS` (Task 1); Task 2 contract; `contestRounds`, `dcFor`.
- Produces: `chase: ChallengeFramework`; test export `buildChase(levers: ResolvedLevers, rng: Rng): { quarry: Quarry; plan: ChasePlan }` — ONE quarry draw feeds both the situation text and the plan's trick/desperation lines (drawing twice would describe two different quarries).

**Behavior (spec §8.5, test-locked):**
- `rounds = contestRounds(timeBudget)` (3/5/7 — mirrors contests by spec).
- Complications: shuffle `WAYPOINTS`, take `rounds`, one per round: `{ round: i + 1, text, check: '${skill} DC ${dcFor}' }`.
- Lead counter model in text: the quarry starts 2 zones ahead; each round's complication success closes 1 zone, failure opens 1. `catchCondition` = "lead reaches 0 — the quarry is cornered"; `escapeCondition` = "lead reaches 4, or the final round ends with a lead of 2+ — the quarry slips away" plus the quarry's `desperation` move at lead 1.
- Party-size lane note in `situation`: fastest PC leads, `groupCheckThreshold(partySize)` must keep pace or the lead opens by 1 (extra clause when partySize > 1).
- Quarry profile (archetype, speedNote, trick) in `situation`; the trick is round-`min(2, rounds)`'s complication flavor prefix.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { chase, buildChase } from '../challenge-frameworks/chase';
import { contestRounds } from '../noncombat/levers';

describe('chase framework (spec §8.5)', () => {
  it('rounds follow the time budget; one complication per round with check math', () => {
    for (const budget of ['quick', 'standard', 'set-piece'] as const) {
      const levers = mkLevers('Medium', 23, { timeBudget: budget });
      const { plan } = buildChase(levers, seededRandom(23));
      expect(plan.rounds).toBe(contestRounds(budget));
      expect(plan.complications).toHaveLength(plan.rounds);
      plan.complications.forEach((c, i) => {
        expect(c.round).toBe(i + 1);
        expect(c.check).toMatch(/DC \d+/);
      });
      expect(new Set(plan.complications.map(c => c.text)).size).toBe(plan.rounds); // distinct waypoints
    }
  });
  it('carries lead-counter catch/escape conditions; the plan quarry matches the situation quarry', () => {
    const { quarry, plan } = buildChase(mkLevers('Hard', 29), seededRandom(29));
    expect(plan.catchCondition).toMatch(/lead/i);
    expect(plan.escapeCondition).toMatch(/lead/i);
    expect(plan.escapeCondition).toContain(quarry.desperation);
    // generate() must build situation and plan from ONE quarry draw:
    // the trick named in the situation appears in a plan complication.
    const out = chase.generate({ levers: mkLevers('Hard', 29), rng: seededRandom(29) });
    const trick = out.situation.match(/Known trick: (.+?)\./)?.[1];
    expect(trick).toBeTruthy();
    expect(out.chase!.complications.some(c => c.text.toLowerCase().includes(trick!.toLowerCase()))).toBe(true);
  });
  it('generate() attaches the plan and the quarry profile', () => {
    const out = chase.generate({ levers: mkLevers('Medium', 31, { partySize: 5 }), rng: seededRandom(31) });
    expect(out.chase).toBeDefined();
    expect(out.chase!.rounds).toBe(5);
    expect(out.situation).toMatch(/Quarry/i);
    expect(out.situation).toContain('3 of 5'); // groupCheckThreshold lane note
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/challenge-frameworks/chase.ts
// ─── Chase ───────────────────────────────────────────────────────
// Quarry profile, one themed waypoint complication per round, and a
// lead-counter with concrete catch/escape math (spec §8.5).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { QUARRIES, WAYPOINTS, type Quarry } from '../../data/noncombat-scenarios';
import { contestRounds, dcFor, groupCheckThreshold } from '../noncombat/levers';
import { cap, failureText, rewardText } from '../noncombat/theming';
import type { ChasePlan, ResolvedLevers } from '../noncombat/types';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput } from './frame';

export function buildChase(levers: ResolvedLevers, rng: Rng): { quarry: Quarry; plan: ChasePlan } {
  const rounds = contestRounds(levers.timeBudget);
  const dc = dcFor(levers.partyLevel, levers.difficulty);
  const quarry = pick(QUARRIES, rng);
  const picks = shuffleArray(WAYPOINTS, rng).slice(0, rounds);
  const plan: ChasePlan = {
    rounds,
    complications: picks.map((w, i) => ({
      round: i + 1,
      text: i === Math.min(1, rounds - 1) ? `${cap(quarry.trick)} — ${w.text}` : w.text,
      check: `${w.skill} DC ${dc}`,
    })),
    catchCondition: `The quarry starts 2 zones ahead. Each round's complication success closes the lead by 1; failure opens it by 1. Lead 0 — the quarry is cornered.`,
    escapeCondition: `Lead 4, or the final round ends at lead 2+ — the quarry slips away. At lead 1 they turn desperate: ${quarry.desperation}.`,
  };
  return { quarry, plan };
}

export const chase: ChallengeFramework = {
  key: 'chase',
  label: 'Chase',
  description: 'Round-by-round pursuit with waypoint complications and a live lead counter',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const { quarry, plan } = buildChase(levers, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const threshold = groupCheckThreshold(levers.partySize);
    const laneNote = levers.partySize > 1
      ? ` Lanes: the fastest character leads; unless at least ${threshold} of ${levers.partySize} keep pace each round, the lead opens by 1 regardless of the complication.`
      : '';
    return {
      name: `The ${pick(['Pursuit', 'Flight', 'Hunt', 'Run'], rng)} Through ${cap(pick(pack.descriptors, rng))} Ground`,
      readAloud: `${cap(quarry.archetype)} bolts — ${pack.sensory[1] ?? pack.sensory[0]}. ${cap(quarry.speedNote)}.`,
      situation: `Quarry: ${quarry.archetype}. ${cap(quarry.speedNote)}. Known trick: ${quarry.trick}.${laneNote}`,
      stakes: `${plan.catchCondition} ${plan.escapeCondition}`,
      skillChecks: plan.complications.map(c => ({
        skill: c.check.split(' DC ')[0], dc,
        onSuccess: `Round ${c.round}: ${c.text} — cleared; the lead closes by 1.`,
        onFailure: `Round ${c.round}: ${c.text} — it costs you; the lead opens by 1.`,
      })),
      complication: failureText(levers, rng, { kind: 'recurring', context: 'A bystander tangle or a bad landing mid-chase.', save: 'DEX' }),
      outcomes: [
        { label: 'Cornered (lead 0)', description: 'The quarry is caught — winded, cornered, and ready to talk or fight.' },
        { label: 'Escaped', description: 'The trail goes cold — but the route itself revealed where they were headed.' },
        { label: 'Desperation (lead 1)', description: `${cap(quarry.desperation)} — catching them now means dealing with that.` },
      ],
      reward: rewardText(levers, rng),
      chase: plan,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/chase.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): chase framework with lead counter and waypoint rounds"
```

---

### Task 7: Investigation framework

**Files:**
- Create: `src/lib/challenge-frameworks/investigation.ts`
- Test: extend `src/lib/__tests__/challenge-frameworks.test.ts`

**Interfaces:**
- Consumes: `INVESTIGATION_FRAMES` (Task 1); pack `cast` (culprit pool); Task 2 contract.
- Produces: `investigation: ChallengeFramework`; test export `buildClueWeb(levers: ResolvedLevers, rng: Rng): ClueWeb`.

**Behavior (spec §8.6, test-locked):**
- Truth: culprit from `pack.cast`, method + motive from an `INVESTIGATION_FRAMES` pick.
- Revelation nodes = 2 (quick) / 3 (standard) / 4 (set-piece). Node revelations progress: "what happened" → "how it was done" → "who had reason" → "the culprit" (slice to node count, culprit always LAST).
- **Three-clue rule:** every node carries exactly 3 clues; vectors chosen structurally — shuffle the four `ClueVector`s per node and take 3 (guarantees 3 distinct vectors per node); clue text = vector template × difficulty register (Easy: direct phrasing; Hard: oblique), skinned with pack vocabulary; `pointsTo` = the node's revelation.
- Exactly one red herring (a `pack.cast` innocent) with its `disconfirmedBy` clue. **Red-herring subtlety follows difficulty** (spec §8.6): Easy/Medium — plainly suspicious with a direct disconfirmation; Hard — inferential suspicion whose disconfirmation requires asking the right question.
- Handout: `clue-cards` — all node clues + the red herring as cards `{ title, body, vector }`, shuffled; the DM web summary lives in `situation` (node list) and `stakes` (truth + red herring).

- [ ] **Step 1: Write the failing test** (append)

```ts
import { investigation, buildClueWeb } from '../challenge-frameworks/investigation';

describe('investigation framework (spec §8.6)', () => {
  it('three-clue rule: node counts by budget, 3 clues per node, 3 distinct vectors, culprit last (100 seeds)', () => {
    const NODES = { quick: 2, standard: 3, 'set-piece': 4 } as const;
    for (const budget of ['quick', 'standard', 'set-piece'] as const) {
      for (let s = 0; s < 100; s++) {
        const web = buildClueWeb(mkLevers('Medium', s, { timeBudget: budget }), seededRandom(s));
        expect(web.nodes).toHaveLength(NODES[budget]);
        for (const node of web.nodes) {
          expect(node.clues).toHaveLength(3);
          expect(new Set(node.clues.map(c => c.vector)).size).toBe(3);
          for (const clue of node.clues) expect(clue.pointsTo).toBe(node.revelation);
        }
        expect(web.nodes[web.nodes.length - 1].revelation).toContain(web.truth.culprit);
        expect(web.redHerring.text.length).toBeGreaterThan(0);
        expect(web.redHerring.disconfirmedBy.length).toBeGreaterThan(0);
      }
    }
  });
  it('generate() ships a clue-cards handout with every clue plus the red herring', () => {
    const out = investigation.generate({ levers: mkLevers('Medium', 41), rng: seededRandom(41) });
    expect(out.clueWeb).toBeDefined();
    expect(out.handout?.kind).toBe('clue-cards');
    if (out.handout?.kind === 'clue-cards') {
      const expected = out.clueWeb!.nodes.length * 3 + 1;
      expect(out.handout.cards).toHaveLength(expected);
    }
  });
  it('deterministic: same seed ⇒ identical web', () => {
    const a = buildClueWeb(mkLevers('Hard', 43), seededRandom(43));
    const b = buildClueWeb(mkLevers('Hard', 43), seededRandom(43));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('red-herring subtlety follows difficulty (same seed, different register)', () => {
    const easy = buildClueWeb(mkLevers('Easy', 47), seededRandom(47));
    const hard = buildClueWeb(mkLevers('Hard', 47), seededRandom(47));
    expect(easy.redHerring.text).not.toBe(hard.redHerring.text);
    expect(hard.redHerring.disconfirmedBy).toMatch(/right question/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/challenge-frameworks.test.ts` then `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/investigation.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(challenges): investigation framework with three-clue-rule web"
```

---

### Task 8: Registry + orchestrator rewrite

**Files:**
- Create: `src/lib/challenge-frameworks/index.ts`
- Rewrite: `src/lib/noncombat-generator.ts`
- Test: `src/lib/__tests__/noncombat-generator.test.ts`

**Interfaces:**
- Consumes: all six frameworks; `resolveTheme`; `randomSeed`, `seededRandom`, `pickRandom`; `handoutToText` (for the deprecated-style plain mirror is NOT needed here — challenges never had a playerHandout field; do not add one).
- Produces (the page consumes these in Task 9):

```ts
// src/lib/challenge-frameworks/index.ts
import type { ChallengeFramework, ChallengeType } from './frame';
import { skillChallenge } from './skill-challenge';
import { social } from './social';
import { exploration } from './exploration';
import { trap } from './trap';
import { chase } from './chase';
import { investigation } from './investigation';

export const FRAMEWORKS: ChallengeFramework[] = [
  social, exploration, skillChallenge, trap, chase, investigation,
];

export function frameworkFor(type: ChallengeType): ChallengeFramework {
  return FRAMEWORKS.find(f => f.key === type) ?? FRAMEWORKS[0];
}

export type { ChallengeFramework, ChallengeType, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';
```

**The FRAMEWORKS array order above is part of the frozen `?seed=` contract** (the type draw indexes into it) — never reorder it.

```ts
// src/lib/noncombat-generator.ts (full rewrite)
// ─── Non-Combat Encounter Orchestrator ───────────────────────────
// Resolves levers in a FROZEN draw order (type → theme → construction)
// and dispatches to the framework registry. Difficulty is never drawn
// (challenges has no "Any" difficulty — spec §6). Never change the
// draw order or the FRAMEWORKS array order: shared ?seed= links
// replay them.

import { pickRandom as pick, randomSeed, seededRandom } from './random';
import { resolveTheme } from './noncombat/theming';
import type {
  AttitudeTrack, ChasePlan, ClueWeb, Difficulty, HandoutSpec, ResolvedLevers,
  SkillChallengeStructure, ThemeChoice, ThemeId, TimeBudget, Tone,
} from './noncombat/types';
import { FRAMEWORKS, frameworkFor } from './challenge-frameworks';
import type { ChallengeType, SkillCheck } from './challenge-frameworks';

export type { ChallengeType, SkillCheck };

export interface NoncombatEncounter {
  id: string;
  name: string;
  type: ChallengeType;
  difficulty: Difficulty;
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
  seed: number;
  partyLevel: number;
  partySize: number;
  theme: ThemeId;
  tone: Tone;
  timeBudget: TimeBudget;
  /** Levers exactly as the caller set them — what share links serialize. */
  requested: { type?: ChallengeType; theme: ThemeChoice };
}

export interface GenerateNoncombatOptions {
  type?: ChallengeType;
  difficulty?: Difficulty;
  partyLevel?: number;
  partySize?: number;
  theme?: ThemeChoice;
  tone?: Tone;
  timeBudget?: TimeBudget;
  seed?: number;
}

export function generateNoncombatEncounter(options: GenerateNoncombatOptions = {}): NoncombatEncounter {
  const {
    type,
    difficulty = 'Medium',
    partyLevel = 5, partySize = 4,
    theme = 'any', tone = 'standard', timeBudget = 'standard',
    seed = randomSeed(),
  } = options;

  const rng = seededRandom(seed);
  // Frozen draw order — spec §5.1 applied to challenges.
  const framework = type ? frameworkFor(type) : pick(FRAMEWORKS, rng);
  const pack = resolveTheme(theme, rng);

  const levers: ResolvedLevers = {
    partyLevel: clamp(partyLevel, 1, 20),
    partySize: clamp(partySize, 1, 8),
    difficulty, theme: pack, tone, timeBudget, seed,
  };
  const out = framework.generate({ levers, rng });

  return {
    id: `nc-${seed}-${framework.key}`,
    type: framework.key,
    difficulty,
    ...out,
    seed,
    partyLevel: levers.partyLevel,
    partySize: levers.partySize,
    theme: pack.id,
    tone, timeBudget,
    requested: { type, theme },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function getChallengeTypes(): { value: ChallengeType; label: string; description: string }[] {
  return FRAMEWORKS.map(f => ({ value: f.key, label: f.label, description: f.description }));
}
```

Note: an explicit `type` consumes NO draw (frameworkFor is a lookup); an unset type consumes exactly one `pick`. Explicit `theme` likewise consumes none (PR-1 `resolveTheme` behavior, test-locked there).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/noncombat-generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateNoncombatEncounter, getChallengeTypes } from '../noncombat-generator';
import type { ChallengeType } from '../noncombat-generator';
import { FRAMEWORKS } from '../challenge-frameworks';

const TYPES: ChallengeType[] = ['social', 'exploration', 'skill-challenge', 'trap', 'chase', 'investigation'];
const DIFFS = ['Easy', 'Medium', 'Hard'] as const;

describe('registry + coverage', () => {
  it('exactly six frameworks, all types generate at all difficulties', () => {
    expect(FRAMEWORKS).toHaveLength(6);
    expect(getChallengeTypes().map(t => t.value).sort()).toEqual([...TYPES].sort());
    for (const type of TYPES) {
      for (const difficulty of DIFFS) {
        const e = generateNoncombatEncounter({ type, difficulty, partyLevel: 7, seed: 99 });
        expect(e.type).toBe(type);
        expect(e.difficulty).toBe(difficulty);
        expect(e.readAloud.length).toBeGreaterThan(0);
        expect(e.skillChecks.length).toBeGreaterThan(0);
        expect(e.outcomes).toHaveLength(3);
      }
    }
  });
});

describe('determinism (frozen draw order)', () => {
  it('same seed + levers ⇒ identical JSON, including any-theme and unset-type paths', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = { partyLevel: 9, partySize: 5, theme: 'any' as const, seed };
      expect(JSON.stringify(generateNoncombatEncounter(opts))).toBe(JSON.stringify(generateNoncombatEncounter(opts)));
    }
  });
  it('difficulty is never drawn: changing it never changes the resolved type/theme', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const easy = generateNoncombatEncounter({ seed, difficulty: 'Easy' });
      const hard = generateNoncombatEncounter({ seed, difficulty: 'Hard' });
      expect(easy.type).toBe(hard.type);
      expect(easy.theme).toBe(hard.theme);
    }
  });
  it('golden pins — the permanent ?seed= contract (never update without versioning URLs)', () => {
    const got = [1, 2, 3, 42, 1337, 424242].map(seed => {
      const e = generateNoncombatEncounter({ seed });
      return `${seed}=>${e.id}|${e.theme}|${e.type}`;
    });
    expect(got).toEqual([
      // FILL: the six actual strings from the current implementation (run once, paste, verify twice)
    ]);
  });
  it('golden pin — explicit levers consume no draws before construction', () => {
    const e = generateNoncombatEncounter({
      seed: 42, type: 'investigation', difficulty: 'Hard', theme: 'sacred-temple',
      tone: 'grim', timeBudget: 'quick', partyLevel: 9, partySize: 6,
    });
    expect(`${e.id}|${e.theme}|${e.type}|${e.clueWeb?.nodes.length}`).toBe(
      'FILL_FROM_CURRENT_IMPLEMENTATION', // includes nodes=2 (quick)
    );
  });
});

describe('lever influence', () => {
  it('party size changes skill-challenge structure', () => {
    const small = generateNoncombatEncounter({ type: 'skill-challenge', partySize: 2, seed: 7 });
    const large = generateNoncombatEncounter({ type: 'skill-challenge', partySize: 8, seed: 7 });
    expect(small.structure!.successesNeeded).toBeLessThan(large.structure!.successesNeeded);
  });
  it('tone selects the consequence template on failureText-backed outcomes', () => {
    const w = generateNoncombatEncounter({ type: 'skill-challenge', tone: 'whimsical', seed: 8 });
    const g = generateNoncombatEncounter({ type: 'skill-challenge', tone: 'grim', seed: 8 });
    expect(w.outcomes[2].description).not.toMatch(/\d+d\d+/);
    expect(g.outcomes[2].description).toMatch(/\d+d\d+/);
  });
  it('theme changes output for the same seed', () => {
    const a = generateNoncombatEncounter({ theme: 'ancient-tomb', seed: 5 });
    const b = generateNoncombatEncounter({ theme: 'feywild-revel', seed: 5 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('back-compat (spec §5/§11)', () => {
  it('legacy option shape works and legacy fields are all present', () => {
    const e = generateNoncombatEncounter({ type: 'social', difficulty: 'Hard', partyLevel: 9, seed: 42 });
    for (const field of ['id', 'name', 'type', 'difficulty', 'readAloud', 'situation', 'stakes', 'skillChecks', 'complication', 'outcomes', 'reward'] as const) {
      expect(e[field]).toBeDefined();
    }
    expect(e.requested.type).toBe('social');
    expect(e.requested.theme).toBe('any');
    expect(e.id).toBe('nc-42-social');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/noncombat-generator.test.ts`
Expected: FAIL — registry missing; old generator lacks new fields.

- [ ] **Step 3: Write the implementation**

Create `index.ts` and rewrite `noncombat-generator.ts` exactly as the Interfaces block shows. Fill the two golden-pin FILL slots from the current implementation (temporary log, then delete it); run the test file twice to confirm stability. Before deleting legacy internals, confirm nothing else imports them: `grep -rn "noncombat-generator" src/ --include="*.ts" --include="*.tsx"` — only `src/app/challenges/page.tsx` (imports `generateNoncombatEncounter`, `getChallengeTypes`, types `NoncombatEncounter`, `ChallengeType` — all still exported) and the new test file.

- [ ] **Step 4: Run the full suite + build**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green — the existing challenges page compiles against the superset types unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge-frameworks/index.ts src/lib/noncombat-generator.ts src/lib/__tests__/noncombat-generator.test.ts
git commit -m "feat(challenges): six-framework orchestrator with frozen seeded draw order"
```

---

### Task 9: Challenges page — levers, seeds, share links

**Files:**
- Rewrite (controls + wiring; keep display idiom): `src/app/challenges/page.tsx`

**Interfaces:**
- Consumes: Task 8 orchestrator; `THEME_OPTIONS`/`TONE_OPTIONS`/`TIME_OPTIONS` from `@/lib/noncombat/theming`; `PuzzleHandout` (default export from `@/components/PuzzleHandout`); `handoutToText` from `@/lib/noncombat/handout-text`; `usePersistentState`; `randomSeed` from `@/lib/random`.
- Produces: the shipped page. URL contract (permanent, spec §6.8): `/challenges?seed=&type=&diff=&lvl=&size=&theme=&tone=&time=` — omitted `type` means Any; `diff` omitted means Medium (challenges has NO Any difficulty).

**The shipped puzzles page is the reference implementation** — `src/app/puzzles/page.tsx` already demonstrates every pattern this task needs: the `<Suspense>` wrapper, persisted-state-before-hydration ordering, clampInt + enum-drop validation, `handleGenerate` (form state) vs `handleReroll` (displayed item's `requested` + echoes, and it resets the copied flag), `buildShareUrl` from `requested`, the seed chip, the Copied ✓ share button, and history dedupe-by-id. Mirror them exactly, adjusted for challenges.

**Requirements (spec §6.8/§10):**
1. Lever keys: keep `challengeType`, `challengeDifficulty` (existing 'Medium' default — the select keeps NO Any option), `challengePartyLevel`; add `challengePartySize` (4), `challengeTheme` ('any'), `challengeTone` ('standard'), `challengeTime` ('standard'). History moves to `challengeHistory2`.
2. Suspense + one-shot hydration (numeric clamp: lvl 1–20, size 1–8, seed 0–0x7FFFFFFF; enum-drop for type/diff/theme/tone/time; valid seed ⇒ hydrate levers then generate immediately).
3. Seed chip + reroll (fresh seed, the DISPLAYED encounter's `requested` + echoes, reset copied state); Share Link copies the URL with ~2 s "Copied ✓".
4. The type quick-cards grid (currently 4 buttons that set type + generate) grows to all 6 entries from `getChallengeTypes()` — grid becomes `sm:grid-cols-2 md:grid-cols-3`.
5. New display sections, each rendered only when present, in this order after the existing Skill Checks section:
   - `structure`: a card "Challenge Structure" — successes needed, failures allowed, and a phase list (title · successes · lead skills).
   - `stages`: titled cards (same idiom as the puzzles page's stages).
   - `attitudeTrack`: a card "Attitude Track" — start state badge + a three-row list (attitude, Influence DC, unlocks, shift up/down).
   - `chase`: a card "Chase Rounds" — rounds, then one row per complication (Round N · text · check), then catch/escape conditions.
   - `clueWeb`: DM-facing card "Clue Web (eyes only)" — truth line, node list with vectors, red herring + disconfirmation.
   - `handout`: `<PuzzleHandout spec={encounter.handout} />` (renders the investigation's clue cards).
6. Markdown export: extend the existing builder with the levers line (`Theme: … | Tone: … | Time: … | Party: N × level L | Seed: S`) and every new section that is present (structure, stages, attitude track, chase plan, clue web, handout via `handoutToText`), each preceded by a blank line.
7. History cards add `· {theme label} · {time label}` (single JSX expression — the puzzles page shows the spacing-safe pattern).

Steps:

- [ ] **Step 1:** Implement all seven requirements, mirroring `src/app/puzzles/page.tsx` patterns.
- [ ] **Step 2:** Run `npm run typecheck` — PASS.
- [ ] **Step 3:** Run `npm test` — PASS.
- [ ] **Step 4:** Run `npm run build` — PASS (no dev server running). The controller runs the browser pass after commit.
- [ ] **Step 5: Commit**

```bash
git add src/app/challenges/page.tsx
git commit -m "feat(challenges): lever controls, seed chip, and share links on the challenges page"
```

---

### Task 10: Route copy + final gate

**Files:**
- Modify: `src/lib/site.ts` (the `/challenges` route entry)

- [ ] **Step 1:** Replace the `/challenges` description with exactly:
  "Skill challenges, social encounters, journeys, complex traps, chases, and investigations — levered, themed, seeded, and shareable."
- [ ] **Step 2:** Full gate: `npm run typecheck && npm test && npm run build` — 0 errors (standalone eslint fallback for the changed file if `next lint` misbehaves in the worktree).
- [ ] **Step 3:** Commit and push.

```bash
git add src/lib/site.ts
git commit -m "feat(site): challenges route copy for engine v2"
git push
```

The controller then runs the browser verification pass (each type once, a set-piece skill challenge with phases, an investigation with clue cards, a share-link round trip, console/network checks), dispatches the final whole-branch review, applies its fix wave, and opens the PR (base `main`, closes #49).

---

## Delivery wrap-up (controller, not a plan task)

- Final whole-branch review over `git merge-base origin/main HEAD`..HEAD before the PR; one fix wave for its findings.
- PR title: `feat(challenges): non-combat engine v2 — six challenge frameworks`. Body links spec + this plan, closes #49, summarizes the frameworks and verification. No AI attribution.
- After merge: milestone "Non-Combat Encounter Engine v2" has both PRs done — groom remaining follow-ups (#50, #54–#58) and check with the user before tagging a release.
