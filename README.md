# Encounterizer

A D&D encounter management tool that generates monsters, maps, and scenarios based on DM input. Built with 5.5e / 2024 rules, designed to be fast, flexible, and free.

## What It Does

- **Encounter Generator** — Set party size, level, and difficulty. Get a balanced encounter with monsters, scenario hook, tactics, and treasure in one click. Or build manually by searching and adding monsters.
- **Monster Bestiary** — Browse 70+ monsters with rich filtering: CR, type, size, environment, movement mode, damage types, resistances, immunities, conditions, legendary/spellcaster/lair toggles. Grid and list views with full stat blocks.
- **Map Generator** — Procedurally generated battle maps using BSP room carving (dungeons), cellular automata (caves), and scattered terrain (outdoor). Export as JSON or ASCII text.
- **Battle Simulator** (planned) — Monte Carlo turn-by-turn combat preview. Party win rate, average rounds, who's likely to drop first.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (D&D-themed palette) |
| Data | Static TypeScript monster database + 5etools JSON importer |
| Deployment | Azure Static Web Apps (planned) |
| Hosting Cost | $0 (free tier) |

## Project Structure

```
src/
  app/                    # Next.js App Router pages and API routes
    page.tsx              # Dashboard / landing page
    encounters/page.tsx   # Encounter Builder (auto-generate + manual add)
    monsters/page.tsx     # Monster Bestiary (search, filter, stat blocks)
    maps/page.tsx         # Map Generator (procedural, exportable)
    api/
      monsters/route.ts   # GET — filter and search monsters
      encounters/route.ts # POST — generate encounters
      maps/route.ts       # POST — generate maps
  components/
    FilterPanel.tsx       # Full-criteria monster filter UI
    MonsterStatBlock.tsx  # 5e-style stat block renderer
    MapGrid.tsx           # Grid-based map display with terrain legend
    DifficultyBadge.tsx   # Easy/Medium/Hard/Deadly pill badge
  lib/
    types.ts              # Core type system (Monster, Encounter, Map, Party)
    monster-filter.ts     # Search/filter engine for Monster[]
    encounter-generator.ts # XP-budget knapsack selection + scenario hooks
    map-generator.ts      # BSP dungeon + cellular automata + outdoor maps
    import-5etools.ts     # 5etools JSON -> Monster converter
  data/
    index.ts              # Barrel export: ALL_MONSTERS + lookup helpers
    monsters-cr0-quarter.ts  # CR 0 – 1/4
    monsters-cr-half-1.ts    # CR 1/2 – 1
    monsters-cr2-4.ts        # CR 2 – 4
    monsters-cr5-8.ts        # CR 5 – 8
    monsters-cr9-13.ts       # CR 9 – 13
    monsters-cr14-20.ts      # CR 14 – 20
    monsters-cr21-30.ts      # CR 21 – 30
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Install and Run

```bash
git clone https://github.com/Daren9m/Encounterizer-.git
cd Encounterizer-
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for Production

```bash
npm run build
npm start
```

## Monster Database

72 monsters spanning CR 0 (Bat, Frog) to CR 30 (Tarrasque), covering:
- All 14 creature types (Aberration through Undead)
- All movement modes (Walk, Fly, Swim, Burrow, Climb, Hover)
- All damage types dealt and resisted
- Legendary creatures with legendary actions (Beholder, Lich, Ancient Dragons, Kraken)
- Spellcasters (Lich, Rakshasa, Death Knight)
- Lair creatures

The database can be expanded via the 5etools JSON importer (`src/lib/import-5etools.ts`).

## Encounter Math

Uses official 5e XP thresholds and encounter multipliers:
- XP budget per player level and difficulty tier (Easy/Medium/Hard/Deadly)
- Monster count multipliers adjusted for party size
- Knapsack-style monster selection that fits the XP budget with variety

The encounter generator also produces:
- Scenario hooks (20 templates with combinatorial variety)
- Tactics per monster type (14 creature types covered)
- Treasure by CR tier

## Map Generation

Three procedural algorithms:
- **BSP (Binary Space Partition)** — dungeon rooms connected by L-shaped corridors, with doors, traps, treasure, pillars
- **Cellular Automata** — organic cave systems (Underdark, mountain caves)
- **Outdoor Scatter** — environment-specific terrain (forest vegetation, swamp water, desert dunes, arctic ice, rivers with bridges)

18 terrain types with distinct symbols and colors.

## Design Principles

1. **No LLM dependency** — All generation is algorithmic. No API calls, no ongoing AI costs.
2. **Client-side first** — Computation happens in the browser. The server serves static files.
3. **Free to run** — Targets Azure Static Web Apps free tier ($0/month).
4. **2024 rules** — Uses 5.5e / 2024 Monster Manual stats where available, falling back to 2014 5e.
5. **DM-centric** — Every feature answers "does this save the DM time during prep or at the table?"

## Roadmap

See [GitHub Issues](https://github.com/Daren9m/Encounterizer-/issues) for the full backlog.

Key upcoming features:
- **Battle Simulator** (#9) — Monte Carlo combat preview with class templates
- **Character Import** (#10) — Parse D&D Beyond, PDFs, or images
- **5etools Bulk Import** (#7) — Expand to 200+ monsters
- **Azure Deployment** (#8) — CI/CD to Azure Static Web Apps

## License

MIT
