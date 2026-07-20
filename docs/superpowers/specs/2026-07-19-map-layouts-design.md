# Map Layouts & Scale — Design

## Context

Urban maps currently route to the BSP dungeon generator ("City Ruins"),
so there is no true city map and no way to ask for a plain dungeon
directly. The width/height picker also caps at 40×30, small for VTT
play. Approved direction (2026-07-19): decouple layout from
environment, add City Streets and Building Interior generators, and
replace the dimension picker with battle-scale tiers.

## 1. Layout model

New `MapLayout = 'auto' | 'dungeon' | 'cavern' | 'wilderness' | 'city'
| 'building'` selected via a **Layout** control on the maps page and
the encounter builder's map settings. Environment remains the flavor
axis (feature palettes, room names, sensory prose). `auto` maps
environments as today with one change: **Urban → city** (Any → dungeon;
Underdark/Planar → cavern; Mountain → seeded cavern/wilderness coin
flip; the rest → wilderness). Share URLs and history stubs gain
`ml` (layout) and `ms` (scale); legacy `mw`/`mh` params keep parsing.

## 2. Sizing model

Width/height inputs are removed from both pages. One **Scale** select:

| Tier | Target (dungeon/wilderness) | Notes |
|---|---|---|
| Skirmish | ~16×12 | |
| Standard | ~26×20 | default |
| Large | ~40×30 | old maximum |
| Massive | ~60×45 | new engine cap |

The engine derives actual dimensions per layout (city wider, building
compact with a 12×10 floor) and applies ±8% seeded jitter from the
grid stream so same-tier maps vary. `MapOptions.width/height` survive
as exact overrides (legacy links, JSON consumers); when present, no
jitter draws occur. Hard clamps become 10×10 – 60×45.

**Export scaling**: pixels-per-grid = `min(70, floor(4096 / longest
side))` for PNG and UVTT alike, and the chosen value feeds
`resolution.pixels_per_grid`, so VTT grid alignment is exact at every
size (Massive ≈ 68 px/cell).

## 3. New generators

**City Streets** (`generateCity`) — jittered street lattice (2-wide
streets every 6–9 cells plus full-run avenues) divides the map into
blocks. Blocks fill with solid building masses (wall cells) each with
a street-facing `door` (→ UVTT portals); some blocks become plazas
(open, fountain water), market rows (rubble/difficult stall clutter),
or tree squares (vegetation). Zones: party spawns at an edge street,
monster zones in deep blocks, boss in the central plaza. Connectivity
guarantee: every street cell and every building door reachable from
the entrance.

**Building Interior** (`generateBuilding`) — rect or L-shaped shell;
`splitBSPTarget` partitions the interior, inverted: floor throughout,
single-cell interior walls between partitions, one connecting `door`
per shared partition edge, front entrance on the shell. Features:
columns (pillar), hearth (altar), cellar stair (stairs), sparse
trap/treasure. Rooms tagged as dungeons are (entrance/spawn:party,
boss = largest rear room, far rooms spawn:monster). Connectivity:
every room reachable from the front door.

**Dungeon** is the existing generator promoted to a first-class
layout, unchanged. No new `TerrainType` values anywhere.

`map-flavor.ts`: `MapStructure` extends with `'city' | 'building'`;
new grim-voice archetype pools (Fountain Square, Collapsed Tenement…;
Kitchen, Study, Root Cellar…). Flavor stream unchanged.

## 4. Compatibility

Third accepted grid-stream break: jitter draws precede layout draws,
and Urban seeds re-layout as city streets. All FNV-1a hash pins
re-recorded; README notes the break; monster compositions untouched.
Downstream systems (token placement, spatial forecast, room key,
exports) consume grid+rooms and work with the new layouts without
change; the spatial field cache stays ≤ ~15 MB at 60×45.

Existing dungeon-shaped test fixtures switch from `environment:
'Urban'` to explicit `layout: 'dungeon'` so their assertions keep
meaning.

## Shipping

Milestone **Map Layouts & Scale**, two PRs:
1. Engine plumbing (scale, layout, jitter, caps, export auto-ppg,
   both pages' controls) **plus City Streets** — Urban flips exactly
   once.
2. Building Interior.

TDD throughout; connectivity tests extend to both new layouts.
