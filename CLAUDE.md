# Encounterizer — Project Context

## What This Is
A D&D 5.5e (2024 rules) toolkit for Dungeon Masters: encounter building with
2024 XP budgets, a Monte Carlo Battle Forecast, an SRD 5.2.1 bestiary with
client-side custom imports, a map generator, a unified non-combat generator
(puzzles & challenges), and a spell reference. Built with Next.js 16 (App
Router, **static export**), TypeScript strict, and Tailwind CSS. Deployed to
Azure Static Web Apps free tier.

## Architecture
- **Static export** — `output: 'export'` in next.config.js. **No server
  code**: API routes and middleware are forbidden; everything runs in the
  browser.
- **Five tool pages** (`'use client'`): `encounters` (builder + Battle
  Forecast), `monsters` (bestiary + custom import), `maps`, `noncombat`
  (unified puzzles & challenges — 12 verified puzzle families + 6 challenge
  frameworks behind one seeded orchestrator in `src/lib/noncombat/generate.ts`),
  `spells`. Per-page metadata lives in each route's `layout.tsx`. Plus
  server-rendered `/` and `/credits`.
- **Pure engine layer** — `src/lib/` functions have no side effects (no DOM,
  storage, or network). Browser concerns (localStorage, FileReader) live in
  `src/app/` hooks and `src/components/`.
- **Generated bestiary & spells** — `src/data/monsters-*.ts` (by
  `scripts/import-bestiary.ts`) and `src/data/spells-l*.ts` + `spells-meta.ts`
  (by `scripts/import-spells.ts`) are AUTO-GENERATED from SRD 5.2.1 subsets
  of 5etools data at pinned commits. Never hand-edit them; fix the converter
  and re-run `npm run import:bestiary` / `npm run import:spells`.
  `src/data/spell-summaries.ts` is the exception: hand-curated effect
  summary overrides, edited freely (re-run the import after changing it).
- **Seeded randomness** — all generators use `src/lib/random.ts`. Shareable
  encounter links replay seeds (`?seed=` params), so the LCG formula is
  load-bearing: never change it without versioning the URLs.

## Key Files
- `src/lib/types.ts` — All types, `XP_BUDGET_PER_CHARACTER` (2024 DMG table),
  CR tables. Source of truth for the type system.
- `src/lib/encounter-generator.ts` — 2024 budget math (`getPartyXpBudget`,
  `assessEncounterDifficulty`, `summarizeEncounter`), knapsack selection,
  hooks/tactics/treasure. Budgets are caps (`<=`), and there is **no
  monster-count multiplier** in 2024.
- `src/lib/battle-sim.ts` + `monster-to-sim.ts` — seeded Monte Carlo combat
  engine and the stat-block→sim extraction (multiattack/breath/legendary
  parsing, CR damage floor for caster monsters).
- `src/data/class-templates.ts` — Battle Forecast class builds (15 × 4 tiers).
- `src/lib/import-5etools.ts` — 5etools JSON → Monster converter, handles
  the 2024 tag format (`{@atkr m}` etc.). Used by the import script AND the
  in-browser custom importer. `src/lib/import-5etools-spells.ts` is the
  spell counterpart (shared tag stripping, same dual use).
- `src/lib/storage.ts` + `use-persistent-state.ts` — SSR-safe localStorage
  layer (prefix `encounterizer:v1:`). All persistence goes through these.
- `src/app/hooks/useMonsters.ts` — the single merge point for built-in +
  custom monsters; every monster consumer reads from it. `useSpells.ts` is
  the spell equivalent.
- `src/lib/site.ts` — site URL, route list, per-route copy (nav, sitemap,
  homepage, and metadata all derive from it).

## Rules
- Use 5.5e / 2024 rules. Encounter difficulty is Low/Moderate/High
  (+ Extreme as an over-budget assessment label). Puzzle/challenge
  Easy/Medium/Hard refer to skill-check DCs and are correct as-is.
- Monster and spell data must be accurate — DMs rely on it at the table.
  The public bestiary and spell reference ship **only SRD 5.2.1 (CC-BY-4.0)
  content**; non-SRD monsters and spells stay in users' local JSON imports.
  Full attribution lives on /credits (the footer links to it — CC-BY-4.0
  requires it while any SRD content ships).
- Keep everything client-side. No database, no server state, no external
  API calls at runtime.
- The `Monster` type has many required fields — see `src/lib/types.ts`.
- Statistical claims in the Battle Forecast stay hedged ("forecast",
  "plays more like") — it is intentionally approximate.

## Build & Test
```bash
npm run dev              # Development server on :3000
npm run build            # Static export → out/ (must pass with 0 errors)
npm run typecheck        # Type check only
npm run lint             # ESLint (next/core-web-vitals)
npm test                 # Vitest (rules math, importer, sim statistics)
npm run import:bestiary  # Regenerate SRD bestiary
npm run import:spells    # Regenerate SRD spell reference
```
Do not run `npm run build` while `npm run dev` is running — they share
`.next/` and the build corrupts the dev server's chunks.

## Branch & Process
The primary development branch is `main`; work
happens on feature branches with PRs. Conventional commits; push after every
commit; align work with GitHub milestones/issues. CI (typecheck, lint, test,
build) runs on every PR; the Deploy workflow ships `out/` to Azure Static
Web Apps on pushes to the default branch.
