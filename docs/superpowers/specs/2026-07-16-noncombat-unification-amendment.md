# Amendment: Unify Puzzles + Challenges into `/noncombat`

- **Date:** 2026-07-16 · **Status:** Approved · **Amends:** `2026-07-15-noncombat-encounter-engine-v2-design.md`
- **Tracking:** issue #71 · **Branch:** `claude/noncombat-unification`

## Decision record

The v2 spec's §1 decision "two pages, shared engine" is REVERSED by user decision
(2026-07-16): the site has no external users yet, so SEO/bookmark/seed-link
preservation carries no weight. Approved choices:

1. **New `/noncombat` route**; `src/app/puzzles/` and `src/app/challenges/`
   are deleted. Nav shrinks to five tools; label: **"Puzzles & Challenges"**.
2. **Flat kind list**: one Kind select (+ Any) over eleven kinds — the five
   puzzle categories (`logic`, `word`, `physical`, `minigame`,
   `environmental`) and six challenge types (`social`, `exploration`,
   `skill-challenge`, `trap`, `chase`, `investigation`). No grouping.
3. **Fresh seed contract, re-pinned**: one unified orchestrator with a new
   frozen draw order; the two old orchestrators, their golden pins, and the
   old URL contracts retire. Old shared links die (explicitly accepted).

The 18 generators (12 puzzle families, 6 challenge frameworks), all levers,
theme packs, corpus content, handout rendering, and the shared core are
UNCHANGED. This is an assembly + routing + page consolidation.

## Unified orchestrator — `src/lib/noncombat/generate.ts`

```ts
export type NoncombatKind = PuzzleCategory | ChallengeType;   // 11 values

export interface GenerateNoncombatOptions {
  kind?: NoncombatKind;          // undefined = Any (spans all 18 generators)
  difficulty?: Difficulty;       // undefined = seeded draw — now for ALL kinds
  partyLevel?: number;           // 1–20, default 5
  partySize?: number;            // 1–8, default 4
  theme?: ThemeChoice;           // default 'any'
  tone?: Tone;                   // default 'standard'
  timeBudget?: TimeBudget;       // default 'standard'
  seed?: number;                 // default randomSeed()
}

export type NoncombatResult =
  | ({ resultKind: 'puzzle' } & PuzzleResult)       // Puzzle shape from v2 §11
  | ({ resultKind: 'challenge' } & ChallengeResult); // NoncombatEncounter shape from v2 §11
```

`PuzzleResult`/`ChallengeResult` are the existing `Puzzle` /
`NoncombatEncounter` interfaces relocated into `generate.ts` (minus their
old `requested` fields), with the common lever echoes
(`seed/partyLevel/partySize/theme/tone/timeBudget`), `id`, `kind:
NoncombatKind` (resolved), and a unified
`requested: { kind?: NoncombatKind; difficulty?: Difficulty; theme: ThemeChoice }`
hoisted to both branches of the union. `playerHandout` stays on the puzzle
branch (populated via `handoutToText`) — nothing external reads it anymore,
but the markdown export reuses it.

**Unified registry:** one flat list of 18 entries:

```ts
type GeneratorEntry =
  | { generatorKind: 'family'; family: PuzzleFamily }        // 12, kinds = family.categories
  | { generatorKind: 'framework'; framework: ChallengeFramework }; // 6, kind = framework.key

export const GENERATORS: GeneratorEntry[] = [
  /* the 12 families in FAMILIES order, then the 6 frameworks in FRAMEWORKS order */
];
export function eligibleGenerators(kind?: NoncombatKind): GeneratorEntry[];
```

**Frozen draw order (the NEW permanent contract, golden-pinned):**
1. `difficulty` explicit, else ONE draw over `['Easy', 'Medium', 'Hard']`
2. theme via `resolveTheme` (explicit ⇒ zero draws)
3. generator: ONE uniform `pickRandom` over `eligibleGenerators(kind)` —
   always exactly one draw, even when the list has a single entry
4. resolved display kind = `options.kind ?? (family ? family.categories[0] : framework.key)`
5. construction: families get `{ levers, rng, category: resolvedKind }`
   (cast to PuzzleCategory — only reachable for family entries); frameworks
   get `{ levers, rng }`

`id = nc-${seed}-${generatorKey}` where generatorKey = `family.key` or
`framework.key`. `getNoncombatKinds()` returns the 11 `{ value, label,
description }` entries (labels: the five existing category labels + the six
framework labels/descriptions).

**Deletions:** `src/lib/puzzle-generator.ts`, `src/lib/noncombat-generator.ts`,
`src/lib/__tests__/puzzle-generator.test.ts`,
`src/lib/__tests__/noncombat-generator.test.ts`. Verify no other importers
first (engines import from `noncombat/types` and `challenge-frameworks/frame`,
not the orchestrators).

## Page — `src/app/noncombat/`

- `layout.tsx` metadata from the new site.ts route entry; `page.tsx`
  mirrors the shipped pages' patterns (Suspense, persisted-state-before-
  hydration, clamp/enum-drop, handleGenerate vs handleReroll, share button
  with Copied state, history dedupe-by-id, print blocks).
- **URL contract (new, permanent):**
  `/noncombat?seed=&kind=&diff=&lvl=&size=&theme=&tone=&time=` — `kind`
  omitted = Any; `diff` omitted = Any (seeded draw).
- Storage keys (all new): `noncombatKind` (`''` = Any), `noncombatDifficulty`
  (`''` = Any), `noncombatPartyLevel` (5), `noncombatPartySize` (4),
  `noncombatTheme` ('any'), `noncombatTone` ('standard'), `noncombatTime`
  ('standard'), `noncombatHistory1` (mixed union, 10 entries).
- Difficulty select gains "Any" for everything (challenge kinds included —
  new behavior, sanctioned by the fresh contract).
- Kind quick-cards: all 11, `sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.
- Rendering: shared header (name, difficulty badge, kind label, theme,
  party echo, seed chip) then branch on `resultKind`:
  - puzzle → DM Brief (+ Adjudication), Read Aloud, Handout, Stages,
    Hints (click-to-reveal), Solution (collapse: answer/failure/reward),
    print-expanded blocks — the shipped puzzles page sections.
  - challenge → Read Aloud, Situation/Stakes, Skill Checks, Structure,
    Stages, Attitude Track, Chase Rounds, Clue Web (DM), Handout,
    Complication, Outcomes, Reward — the shipped challenges page sections.
- Markdown export: one builder branching the same way; blank line before
  every `## ` heading.
- History cards: name · kind label · difficulty · theme · time.

## Route surgery

- `src/lib/site.ts`: replace the `/puzzles` and `/challenges` entries with
  ONE entry — path `/noncombat`, label `Puzzles & Challenges`, description:
  "Verified puzzles, riddles, ciphers, contests, social encounters,
  journeys, traps, chases, and investigations — one levered, themed,
  seeded generator." Update the homepage blurb if it names the old pair.
- Delete `src/app/puzzles/` and `src/app/challenges/` directories.
- Sitemap/nav/homepage derive from site.ts — no separate edits expected;
  verify robots/sitemap output in the build.

## Tests — `src/lib/__tests__/noncombat-generate.test.ts`

- Registry: 18 entries; `eligibleGenerators` per kind (each puzzle category
  ≥2, each challenge kind exactly 1, undefined = 18).
- Coverage: all 11 kinds × 3 difficulties generate; resolved kind echoes.
- Determinism: same seed+levers ⇒ identical JSON (incl. kind-undefined,
  difficulty-undefined, theme-any paths).
- **Fresh golden pins:** 6 default-path seeds pinning
  `id|resultKind|theme|difficulty|kind`, plus one explicit-lever pin
  (never update without versioning the URL).
- Lever influence: challenge kinds now honor difficulty-Any (draw);
  tone/party-size spot checks at the union level.
- All engine/framework/data tests remain untouched and green.

## Out of scope

Engine internals, content pools, PuzzleHandout, theming, levers — all
untouched. Quality residuals stay tracked in #54–#58, #68.
