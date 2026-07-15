# Encounterizer v1.0.0 — Public Release Design

**Status:** Approved 2026-07-15 · **Milestone:** [v1.0.0 — Public Release](https://github.com/Daren9m/Encounterizer/milestone/1)

## Context

Encounterizer has six working tool pages (Encounters, Bestiary, Maps, Puzzles, Challenges, Spells), a clean pure-function engine layer, 72 monsters, and 34 spells — but three credibility-level gaps block a public release:

1. **Rules accuracy** — the encounter math is 2014 DMG methodology (Easy/Medium/Hard/Deadly thresholds + encounter multipliers) mislabeled as 2024, and monster stats are 2014 values tagged `MM2024`. The 2024 DMG uses Low/Moderate/High XP budgets with **no multiplier**.
2. **Public-app scaffolding is absent** — no favicon, SEO/OG metadata, error/404 pages, mobile nav, persistence, or print styles; homepage shows 3 of 6 tools; zero tests/CI/ESLint.
3. **No deployment path** — `output: 'standalone'` contradicts the Azure Static Web Apps target (#8); 3 dead API routes block static export.

## Decisions

| Decision | Choice |
|---|---|
| Scope | Polish + deploy everything that exists, **plus** the Battle Forecast simulator (#9) |
| Encounter math | **True 2024 rules only** — Low/Moderate/High XP budgets, no multiplier (#17) |
| Bestiary | Import **SRD 5.2.1-flagged monsters only (~331)** from 5etools `bestiary-xmm.json`; CC-BY-4.0 with attribution (#7) |
| Custom content | Users load extra monsters via client-side JSON upload (5etools or native format), stored in localStorage (#18) |
| Battle Forecast depth | Phase 1 of #9 + fidelity basics: healing/round, rage DR, evasion, breath recharge, legendary actions |
| Hosting | Azure Static Web Apps free tier, static export (#8) |

## Verified reference facts

### 2024 DMG XP Budget per character (verified against Roll20 2024 compendium)

| Lvl | Low | Mod | High | Lvl | Low | Mod | High |
|---|---|---|---|---|---|---|---|
| 1 | 50 | 75 | 100 | 11 | 1900 | 2900 | 4100 |
| 2 | 100 | 150 | 200 | 12 | 2200 | 3700 | 4700 |
| 3 | 150 | 225 | 400 | 13 | 2600 | 4200 | 5400 |
| 4 | 250 | 375 | 500 | 14 | 2900 | 4900 | 6200 |
| 5 | 500 | 750 | 1100 | 15 | 3300 | 5400 | 7800 |
| 6 | 600 | 1000 | 1400 | 16 | 3800 | 6100 | 9800 |
| 7 | 750 | 1300 | 1700 | 17 | 4500 | 7200 | 11700 |
| 8 | 1000 | 1700 | 2100 | 18 | 5000 | 8700 | 14200 |
| 9 | 1300 | 2000 | 2600 | 19 | 5500 | 10700 | 17200 |
| 10 | 1600 | 2300 | 3100 | 20 | 6400 | 13200 | 22000 |

Budgets are **caps** (classify with `<=`), unlike the 2014 floors. CR→XP values are unchanged from 2014.

### Bestiary source

- `https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/974d5bfb7ceae1a13c0213d9b73d9692bd28ca49/data/bestiary/bestiary-xmm.json` (pinned commit, tag v2.32.0)
- 503 monsters; **331 flagged `srd52: true`** (all boolean; no rename-strings; no `_copy` inheritance in this file)
- CR-band split of the 331 across the existing seven data files: 80 / 55 / 83 / 52 / 29 / 20 / 12
- 2024 action text is tag-encoded (`{@atkr m} {@hit 4}… {@h}5 ({@damage 1d6 + 2})`) — the 2014-era prose regexes in the converter match zero XMM actions and must be replaced by a tag renderer
- New 2024 fields: `save`, `skill`, `initiative`, `gear`, top-level `spellcasting` array, `cr` objects with `xpLair`, compound environments (`"planar, abyss"`), `entries` lists

### Next 14 static export constraints

- `robots.ts` / `sitemap.ts` emit static files — supported
- `opengraph-image.tsx` (ImageResponse) breaks under `output: 'export'` — use a static `opengraph-image.png` + `.alt.txt`
- `trailingSlash: true` pairs with Azure SWA folder-index serving
- `useSearchParams()` in a statically prerendered client page requires a `<Suspense>` boundary
- `eslint-config-next@14` requires ESLint 8

## Architecture

### 2024 rules engine (`src/lib/`)

- `types.ts`: `Difficulty = 'Low'|'Moderate'|'High'`; `EncounterAssessment = Difficulty | 'Extreme'`; `XP_BUDGET_PER_CHARACTER` replaces `XP_THRESHOLDS`; `getEncounterMultiplier` deleted; `Encounter` gains `seed`, loses `adjustedXp`.
- `encounter-generator.ts`: `getPartyXpBudget(party, difficulty)`, `assessEncounterDifficulty(totalXp, party)`, `summarizeEncounter(monsters, party)` — the single API the Encounter Builder consumes (kills the page's duplicated math). `generateEncounter` accepts an optional `seed`.
- `random.ts` (new): one seeded LCG (`seededRandom`, `shuffleArray`, `pickRandom`, `randomSeed`) replacing four copy-pasted implementations.
- Shareable links: `?size&level&diff&env&seed[&f=<filter>]` URL params reproduce an encounter + map exactly (same monster pool).

### Bestiary pipeline

- `import-5etools.ts` overhauled for the 2024 tag format: recursive `entriesToText`, `stripTags` renderer with generic pipe-tag fallback, raw-tag attack extraction (2014 prose regexes kept as fallback for custom uploads), `xpLair`→`hasLair`, saves/skills/spellcasting parsing, deterministic slug ids, `computeDerivedFields` export.
- `scripts/import-bestiary.ts` (dev-time, via `tsx`): fetch pinned SHA (`--local` fallback) → filter `srd52` → convert (`forceSource: 'SRD52'`) → emit the seven `src/data/monsters-*.ts` files + `bestiary-meta.ts`. **Audit gate fails the run** on `{@` residue, empty actions/movement, zero XP above CR 0, or <95% attack-bonus coverage.
- Attribution: `/credits` page with the SRD 5.2.1 CC-BY-4.0 notice + footer link. Generated file headers carry the short notice.

### Custom monsters (client-side)

Pure lib (`validate-monster.ts`, `custom-monster-import.ts`, `monster-merge.ts`) + app hooks (`useCustomMonsters` via `useSyncExternalStore` over localStorage with 4 MB cap; `useMonsters()` merge point) + `CustomMonsterPanel` on the Bestiary page (import/list/remove/clear/export).

### Battle Forecast

- `monster-to-sim.ts`: `Monster → SimMonster` extraction — multiattack counts from action text, breath weapons (`(Recharge N)` + damage + save DC), legendary action resolution, saves, precomputed threat DPR. Never throws; degrades with `parseWarnings`. **CR damage floor**: monsters whose extracted DPR < 40% of the DMG-by-CR midpoint (caster monsters like the Lich) get a synthesized supplemental attack to ~70%, flagged in the report.
- `class-templates.ts`: 15 templates × 4 level tiers; HP computed from actual level via the 2024 fixed-average formula; derivation rules documented in the file header.
- `battle-sim.ts`: `simulateBattle(players, monsters, {iterations: 1000, seed, maxRounds: 20})` — single seeded RNG (fully deterministic), initiative, targeting heuristics (monsters → lowest HP; players → highest threat), crits, healing, rage DR, evasion, breath recharge, legendary actions, KO-final, stalemate cap. Running aggregation only.
- Report: win rate, avg rounds, HP remaining, drop ranking, deadliest monster, sim-vs-XP-label assessment with reason. UI: party setup panel (template + level + overrides, persisted), report card with dependency-free SVG donut + HP curve. Branded "Battle Forecast" with explicit weather-forecast expectation-setting.

### Polish & deployment

- Per-route `layout.tsx` metadata (client pages untouched), `site.ts` (SITE_URL + shared ROUTES), icon.svg, static OG image, robots/sitemap.
- `NavBar` client component: active states + mobile hamburger. Homepage: 6 tool cards, stats computed from data imports.
- Print: `@media print` remaps the CSS theme variables (dark → print palette); `print:hidden` chrome; break-inside rules; PrintButton on encounters/monsters/puzzles/challenges.
- Persistence: `storage.ts` (SSR-safe, versioned prefix, quota-tolerant) + `usePersistentState` (hydration-safe); settings/histories/pins per page; named saved encounters (cap 20).
- A11y checklist: label association, aria-label/expanded/pressed, hidden decorative emoji, :focus-visible, prefers-reduced-motion, MapGrid role="img".
- Deploy: `output: 'export'` + `trailingSlash` + `images.unoptimized`; API routes deleted; `staticwebapp.config.json` (404 rewrite, immutable static cache, security headers); CI workflow (typecheck/lint/test/build) + deploy workflow (self-built `out/`, `skip_app_build: true`).

## Verification

- Unit (Vitest): rules table + boundary semantics, seed determinism across all generators and the sim, budget-cap invariant, importer fixture (verbatim SRD entries), custom-import parse/merge/quota, sim statistics (mirror ≈50%, stomp >99%, stalemate cap, per-mechanic A/B), calibration grid (sim label within one band of XP label on ≥70% of canonical encounters), template monotonicity.
- Import audit gate (script-enforced) + manual spot-check of 10 stat blocks vs SRD 5.2.1.
- End-to-end on the static build: all routes, deep-link refresh, themed 404, share-link round trip, custom import round trip, forecast run/stale/re-run, print preview, 375 px mobile, persistence across refresh.

## Out of scope (v1.1 backlog)

Battle Forecast Phase 2/3 remainder (death saves, general AoE, save-or-suck, what-if), PDF/VTT export (#15 remainder), character import (#10), competitive analysis (#11), spell expansion, light mode, encounter-recipes UI, PR preview environments, analytics.
