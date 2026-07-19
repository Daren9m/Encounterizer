# Map Generator Overhaul — Implementation Plan

## Context

The map generator is the weakest of the five tools: it produces a Unicode-glyph
grid that a DM looks at once and closes. The engine underneath is sound
(3 seeded algorithms — BSP dungeons, cellular-automata caves, outdoor scatter —
deterministic and tested), but the output stops at colored glyphs: no shareable
seeds on the maps page (the only tool without them), no image/VTT export, no
room identities, no connection between the map and the monsters standing on it.

**User decisions (locked via brainstorming):**
1. Full overhaul across all four value targets: visual battle maps, rooms with
   meaning, encounter integration, share & export.
2. Encounter integration depth: **full spatial sim** — the Monte Carlo Battle
   Forecast gains a real grid (movement, range, chokepoints). Abstract sim
   remains the default when no map is attached.
3. Visual style: **clean tactical** — crisp vector walls, subtle floor tint,
   clear grid lines, print-friendly, fits Dusksteel. Not hand-drawn.

Five phases, each a shippable PR under one GitHub milestone
(**Map Generator Overhaul**; Phase C closes the VTT half of roadmap #15).
A → B → C sequential; D needs A+B; E needs D.

## Architecture keystone: three RNG streams per seed

All from `seededRandom` in `src/lib/random.ts` (LCG formula never changes):

- **Grid stream** — `seededRandom(seed)`: terrain layout. Draw order becomes a
  FROZEN CONTRACT (documented file-header comment, noncombat-style) and is
  pinned by grid-hash tests from Phase A on.
- **Flavor stream** — `seededRandom((seed ^ FLAVOR_SALT) & 0x7fffffff)`: room
  names/read-aloud. Pool growth can never shift the grid.
- **Placement stream** — `seededRandom((seed ^ PLACEMENT_SALT) & 0x7fffffff)`:
  token placement (Phase D). Pre-D encounter links keep identical maps.

**One-time accepted compat break (Phase A only):** making `roomCount` real and
adding connectivity/stairs/lava changes the grid stream's draw order, so maps
inside pre-overhaul `?seed=` links lay out differently. Encounter monster
composition is untouched (`generateEncounter` has its own rng instance,
encounter-generator.ts:374). Note it in the Phase A PR + README.

## Phase A — Engine enrichment: rooms as first-class output

PR: `feat(maps): rooms, connectivity, and room flavor as first-class map output`

**`src/lib/types.ts`** (map section ~L212)
- Move `MapFeatureDensity`/`MapTerrainVariety` here; `map-generator.ts`
  re-exports them so existing imports compile.
- Add `MapRoomTag` (`'spawn:party' | 'spawn:monster' | 'boss' | 'entrance' |
  'exit' | 'treasure' | 'trap' | 'hazard' | 'landmark'`) and:

```ts
export interface MapRoom {
  id: number;                    // 1-based display number
  name: string;                  // "Collapsed Shrine"
  purpose: string;               // one-line DM note
  readAloud: string;             // 1–2 sentence boxed text
  kind: 'room' | 'chamber' | 'zone';  // BSP rect | cave region | outdoor band
  bounds: { x: number; y: number; w: number; h: number };
  cells?: number[];              // y*width+x indices for irregular regions
  tags: MapRoomTag[];
}
```
- `EncounterMap` gains **optional** `seed?`, `rooms?`, `genOptions?` —
  optional because persisted pre-overhaul history/saved encounters must load
  (mapHistory validator is `Array.isArray`; savedEncounters has none).

**`src/lib/map-generator.ts`** (413 → ~650 lines)
- Header comment freezing grid draw order: (1) layout, (2) connectivity,
  (3) doors, (4) entrance/exit/stairs, (5) features/traps/treasure.
- `splitBSP` → target-count splitting until `roomCount` partitions
  (default `clamp(round(w*h/55), 4, 12)`, option clamped 3–14) — makes the
  dead `roomCount` option real.
- Dungeons: entrance room (tags `entrance`, `spawn:party`), exit room
  (`exit`, `spawn:monster`), largest room (`boss`, `spawn:monster`), far-half
  rooms `spawn:monster`; `stairs` cells adjacent to entrance/exit markers;
  feature scatter records `trap`/`treasure` room tags.
- Caves: flood-fill floor components, keep-largest (zero rng draws — simpler
  than corridor carving and CA rarely fragments); chamber detection: floor
  cells with all-floor Chebyshev-1 neighborhood are cores, flood-fill cores
  into regions, merge <6-cell regions → `kind:'chamber'` rooms with `cells`;
  entrance chamber `spawn:party`, chambers ≥60% of max BFS distance
  `spawn:monster`, largest `boss`. `lava` joins Planar/Mountain Wild cave
  feature pools (revives dead terrain; `stairs` handled by dungeons).
- Outdoor: 3-row `spawn:party` band at entrance edge, `spawn:monster` band at
  opposite edge + densest feature cluster, river becomes a `landmark` zone.
- `generateMap` fills `seed`, `rooms`, `genOptions`; flavor via flavor stream.

**Create `src/lib/map-flavor.ts`** (~300 lines)
- Fragment-pool pattern from `src/data/noncombat-themes.ts` + `theming.ts`
  (`pickRandom` pools, `cap()` composition). ~10 room archetypes per structure
  kind + per-environment descriptor/sensory pools;
  `readAloud = "{Descriptor} {noun}. {Sensory}."` Entrance/exit/boss draw from
  role-specific sub-pools.
- `flavorRooms(rooms, env, structure, rng): void` + `FLAVOR_STREAM_SALT`.

**Tests** (extend `map-generator.test.ts`, new `map-rooms.test.ts`)
- `roomCount` honored ±2 (Urban seeds); every map has ≥1 `spawn:party` and ≥1
  `spawn:monster`; **connectivity**: seeds 1..25 × {Urban, Underdark,
  Mountain} — BFS from entrance reaches exit + every room; dungeons contain
  `stairs`; Planar Wild Dense produces `lava` for a fixed seed set;
  **grid-hash pinning**: FNV-1a hash of terrain matrix for ~6 fixed
  (env, seed) pairs asserted against literals recorded at implementation time.

## Phase B — Clean-tactical SVG renderer + maps page parity

PR: `feat(maps): clean-tactical SVG renderer, seeded share links, PNG export`

**Create `src/lib/map-render/wall-geometry.ts`** (pure)
- `mergeWallRects(map): WallRect[]` — greedy row-run + column-merge cover.
- `wallBoundaries(map): Point[][]` — wall↔non-wall boundary edges chained into
  polylines, collinear runs merged.
- Chosen over marching squares: no diagonal half-cell contours (wrong for
  clean-tactical square grids), ~40 lines, and the boundary polylines are
  exactly the UVTT line-of-sight segments Phase C needs. `pillar` renders as
  an icon, not merged into walls.

**Create `src/lib/map-render/scene.ts`** (pure)
- `CELL = 32` SVG units; `buildMapScene(map, tokens?): MapScene` — batched
  floor tints per terrain, wall rects/outlines, grid lines, feature icons,
  room-number labels at centroids, A1-style rulers, token slots (empty
  until D).

**Create `src/lib/map-render/palettes.ts`** (pure)
- `DARK_PALETTE` (Dusksteel screen: steel-950 field, bronze accents,
  TERRAIN_INFO-derived tints) and `LIGHT_PALETTE` (print/export). Concrete hex
  only — no CSS vars — so PNG/UVTT serialization is exact and canvas-safe.

**Create `src/lib/map-render/svg.ts`** (pure)
- `sceneToSvgString(scene, palette, opts?)` — layers: floor → tints → grid
  (`shape-rendering="crispEdges"`) → icons → wall fill → wall stroke →
  room chips → tokens. Pure string builder: unit-testable, single source for
  screen, print, PNG, and UVTT imagery.

**Create `src/components/MapSvg.tsx`**
- Renders the string via `dangerouslySetInnerHTML` in a `role="img"` wrapper
  (aria-label preserved); dark palette on screen + `hidden print:block`
  light-palette twin (MonsterStatBlock print-twin pattern). One wrapper mouse
  handler computes hovered cell → `B7 — Difficult Terrain` readout (replaces
  1,200 per-cell handlers). Legend from `TERRAIN_INFO` as before.

**Create `src/components/map-export.ts`** (browser)
- `downloadBlob` (extracted from maps-page duplication), `rasterizeSvg`
  (Image + blob URL → canvas → `toBlob('image/png')`, cap ~4096px),
  `svgToPngBase64` (Phase C dependency).

**Modify `src/app/maps/page.tsx`**
- Suspense wrapper + one-shot URL hydration via `useRef` guard (noncombat page
  L39–46, L73–103 pattern); params `seed, env, mw, mh, md, mv, mr` with
  `clampInt`/type-guard validation; auto-generate when `seed` present.
- `randomSeed()` for fresh rolls (not `Date.now()` — stays in the 31-bit URL
  range); `history.replaceState` URL writes (encounters `writeUrl` pattern).
- Seed chip + reroll, Copy Link with 2s "Copied ✓", `PrintButton`, Export PNG;
  keep JSON/ASCII exports; history cards show `Seed {n}`.
- Swap `MapGrid` → `MapSvg`.

**Modify `src/app/encounters/page.tsx`**: swap `MapGrid` → `MapSvg`.
**Delete `src/components/MapGrid.tsx`** + `.map-cell` CSS (only 2 consumers, verified).

**Tests** (`map-render.test.ts`): rect cover sums to wall-cell count with no
overlaps (10 seeds × 3 envs); every boundary edge appears exactly once;
deterministic SVG output with correct viewBox; maps lacking `rooms` render
(backward-compat guard).

## Phase C — Room key + Markdown and UVTT export

PR: `feat(maps): room key, markdown export, and UVTT (.dd2vtt) export`

- **Create `src/components/RoomKeyPanel.tsx`** — `.card` listing
  `Room {id}: {name}`, purpose, italic read-aloud, tag chips;
  `break-inside-avoid` for print. Shown on maps + encounters map card when
  `rooms` exists.
- **Create `src/lib/map-export-text.ts`** (pure) — `mapToMarkdown(map)`:
  title/dims/seed, fenced ASCII grid (move existing builder from maps page),
  legend, `## Room Key`. Maps page gains "Export Markdown".
- **Create `src/lib/uvtt-export.ts`** (pure) — `buildUvtt(map, imageBase64Png,
  pixelsPerGrid = 70): UvttDocument`: `line_of_sight` from `wallBoundaries()`,
  pillars as `objects_line_of_sight`, door cells → portals (position = cell
  center, bounds = crossing edge endpoints, orientation from wall neighbors),
  `image` = light-palette PNG (importers require it). `format: 0.3` —
  **verify against a live Foundry UVTT importer before merging** (PR checklist
  item). PNG export covers Roll20.
- Maps page: async "Export UVTT" (rasterize → build → download `.dd2vtt`).

**Tests** (`uvtt-export.test.ts`): map_size matches; all LoS points in bounds;
portal count = door count; JSON round-trips. Markdown: room-key line per room,
grid block line count = height.

## Phase D — Encounter token placement

PR: `feat(encounters): seeded token placement on battle maps`

**Create `src/lib/token-placement.ts`** (pure, ~220 lines)
```ts
export interface MapToken {
  id: string;      // 'party-0'… | `${monster.id}#${i}` — matches SimMonster.id
  kind: 'party' | 'monster';
  name: string; label: string;   // 1–2 char initials
  x: number; y: number;          // footprint top-left
  sizeCells: 1 | 2 | 3 | 4;      // Tiny/S/M=1, Large=2, Huge=3, Gargantuan=4
}
export function placeTokens(map, monsters, partySize, seed): TokenPlacement;
```
- Placement stream rng. Party packs into the `spawn:party` room/zone nearest
  the entrance (fallback: ring around entrance). Monsters in
  `enc.monsters.flatMap` instance order (matches `monsterToSimMonster` ids):
  boss room gets highest-XP monster (dungeon/cave); ranged-only instances
  (`attackDeliveryModes`) placed deeper (greater BFS distance from party
  spawn), melee at zone edge; outdoor scatters across the monster band.
  Footprint = first free n×n window scanning outward from a seeded anchor;
  never on `TOKEN_BLOCKING` terrain (wall/chasm/lava/water/pillar/door); no
  overlaps (occupancy bitmask); overflow → nearest free floor + note.

**Modify `scene.ts` + `svg.ts`**: token layer — circles (diameter
`sizeCells*CELL - 4`), party bronze ring/steel fill, monsters per-source hue,
centered label, count badge on collisions.

**Modify `src/app/encounters/page.tsx`**
- `placement = useMemo(() => map ? placeTokens(map, monsters, partySize,
  map.seed ?? encounter.seed) : null, …)` — keying on `map.seed` (Phase A)
  means "Regenerate Map" auto-re-places deterministically and shared links
  reproduce map + placement with **zero new URL params**. Pass tokens to
  `MapSvg`; token legend caption.

**Tests** (`token-placement.test.ts`): determinism per seed; no token on
blocking terrain; no overlaps incl. multi-cell; party within/adjacent to
`spawn:party`; boss instance in boss room for fixed dungeon seeds; Large
monster occupies free 2×2; grid hash unchanged by placement (documented
contract assertion).

## Phase E — Spatial Battle Forecast

PR: `feat(forecast): spatial simulation — movement, range, chokepoints`

Data flow: `encounter.map` + `placement` → `battlefieldFromMap()` (memoized on
page) → `simulateBattle(players, monsters, { seed, battlefield })`. No
battlefield → today's abstract engine, **bit-identical** (spatial fully gated;
abstract path performs zero additional rng draws).

**`src/lib/battle-sim-types.ts`**
```ts
export interface Battlefield {
  width: number; height: number;
  cost: Uint8Array;        // 0 impassable (wall/pillar/chasm/lava),
                           // 1 normal, 2 difficult (difficult/water/rubble/vegetation/ice)
  playerSpawns: number[];              // cell indices, player order
  monsterSpawns: Map<string, number>;  // SimMonster.id → cell (MapToken.id contract)
}
// SimAttack += reachCells?, rangeCells?; SimMonster += speedCells;
// SimPlayer += speedCells, rangeCells (1 = melee);
// BattleReport += spatial?: { avgRoundsToContact: number; engagementNote: string }
```
Underwater maps water→cost 1 inside `battlefieldFromMap` (takes environment).

**Create `src/lib/sim/movement.ts`** (pure, ~200 lines)
- `battlefieldFromMap(map, placement)`; `DistanceFieldCache` — 0-1-2 weighted
  BFS (Dial's buckets), memoized by target cell, **one cache per
  `simulateBattle` call shared across all iterations** (fields depend only on
  cost grid + target cell). Worst case ~1,200 fields × ~15k ops ≈ 20M ops
  (~100–300 ms); memory ≤ 1,200 × 1,200 × 2B ≈ 2.9 MB.
- `stepToward` / `stepAway` (ranged kiting) — O(speed) gradient descent on the
  cached field; `chebyshev()` for 5e gridded range checks.

**Modify `src/lib/battle-sim.ts`** (+~140 lines; public API unchanged except
optional `battlefield` in `SimulateOptions`)
- States gain `cell` (spatial only). Turn: pick target (existing heuristics) →
  if out of range, move (`stepToward`; ranged `stepAway` when adjacent, attack
  at disadvantage if still adjacent — 5e ranged-in-melee) → attack only when
  `chebyshev ≤ reach/range`, else Dash (second move) and forfeit attacks.
  Simplified opportunity attack: leaving adjacency eats one base attack from
  one adjacent enemy. Enemies block destination cells, allies don't. Flying =
  `max(walk, fly)` ground movement. Both simplifications appended to
  `approximationNotes`; track first landed attack → `spatial.avgRoundsToContact`.

**Modify `src/lib/monster-to-sim.ts`** — keep `MonsterAction.reach`/`range`
(feet → cells ÷5; defaults melee 1 / ranged 12 + warning). `extractSpeedCells`
from structured `Monster.speed` (types.ts:69–75 — **no string parsing
needed**): `max(walk, fly)` ÷ 5, default 6.

**Modify `src/data/class-templates.ts`** — `ClassTemplate` gains `speedFt?`
(default 30; monk 45) and `attackRangeFt?` (martials 5; ranger 150;
warlock/wizard/sorcerer 120; cleric/druid/bard 60); `buildSimPlayer`
(class-templates.ts:262) maps to `speedCells`/`rangeCells`.

**Modify `BattleReportCard.tsx` + encounters page** — spatial-mode chip
("Simulated on the battle map — N×M grid") + rounds-to-contact stat when
`report.spatial` exists. All copy stays hedged ("plays more like").

**Tests** (`sim-spatial.test.ts` + guard in `battle-sim.test.ts`)
- **Abstract regression lock**: fixed-seed full-report snapshot with no
  battlefield recorded before the change, asserted after; existing sim tests
  untouched.
- Movement units: speed-6 closes exactly 6 cost-1 cells/round; difficult band
  delays contact as expected; wall detour > Chebyshev.
- Directional stats, fixed seeds, wide tolerances (battle-sim.test.ts L66–107
  style): 4 ranged PCs vs 8 melee wolves — 3-wide corridor map yields higher
  `partyWinRate` than open field; melee party vs ranged monsters contacts
  later on larger maps.
- Perf smoke: 40×30 Dense Urban 8v8 × 1,000 iterations under a generous bound;
  record real number in PR. Levers if slow: cache (built-in) → 500 iterations
  in spatial mode (precedent: sim already halves for big fights,
  battle-sim.ts:361) → Web Worker only if measured > 2 s.

## User-contribution points (learning mode)

DM-judgment decisions to hand to the user during execution (~5–10 lines each):
1. **Room archetype tables** (`map-flavor.ts`) — the room names/purposes per
   structure kind set the tool's voice.
2. **Terrain cost table** (`battlefieldFromMap`) — which terrain is difficult
   vs impassable for the sim (e.g., is `water` crossable at 2× or blocking?).
3. **Monster deployment doctrine** (`token-placement.ts`) — brutes-front /
   ranged-deep / boss placement rules.

## Milestone & process

- Milestone **Map Generator Overhaul**; one issue per phase (A–E), labeled
  `feature`, sequenced; Phase C closes the VTT half of roadmap #15.
- Conventional commits, push after every commit, PR per phase. No AI
  attribution anywhere (user's global rule).
- First execution step: commit this spec/plan to
  `docs/superpowers/specs/2026-07-19-map-overhaul-design.md` per superpowers
  process.

## Verification (every phase)

```bash
npm run typecheck && npm run lint && npm test && npm run build
```
- Dev-server pass of `/maps` and `/encounters` (never while `npm run build`
  runs — shared `.next/`), print preview (light-palette twin), share-link
  round-trip (copy link → open in new tab → identical map).
- Phase C: import a sample `.dd2vtt` into Foundry's Universal Battlemap
  Importer before merge.
- Phase E: fixed-seed abstract report identical pre/post; spatial perf number
  recorded in PR.

## Risk register (abridged)

1. Pre-overhaul share links re-layout maps after Phase A — accepted once,
   documented, then frozen by grid-hash tests.
2. Monte Carlo × pathfinding perf — DistanceFieldCache shared across
   iterations; fallback levers listed above.
3. localStorage growth (10 maps × grid+rooms ≈ 300–400 KB worst case) —
   within quota; `storageSave` already swallows QuotaExceededError.
4. Backward compat — all new `EncounterMap` fields optional; `MapSvg`/
   `RoomKeyPanel` must render room-less maps (explicit test).
5. UVTT format drift — live Foundry import check gates Phase C merge.
6. PNG rasterization taint — concrete-hex palettes, self-contained SVG, no
   external refs; cap 4,096 px.
