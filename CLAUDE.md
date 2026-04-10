# Encounterizer — Project Context

## What This Is
A D&D 5.5e (2024 rules) encounter management tool. Generates monsters, maps, and scenarios for Dungeon Masters. Built with Next.js 14, TypeScript, and Tailwind CSS.

## Architecture
- **Next.js App Router** — pages in `src/app/`, API routes in `src/app/api/`
- **Client-side rendering** — all three main pages (`encounters`, `monsters`, `maps`) are `'use client'` components
- **Static monster data** — TypeScript files in `src/data/`, split by CR range, combined via `src/data/index.ts`
- **Engine layer** — pure functions in `src/lib/` (no side effects, no DB, no API calls)

## Key Files
- `src/lib/types.ts` — All types, XP tables, encounter multiplier math. This is the source of truth for the type system.
- `src/data/index.ts` — Exports `ALL_MONSTERS` array and lookup helpers. All pages import from here.
- `src/lib/encounter-generator.ts` — XP budget calculation, knapsack monster selection, scenario hook generation
- `src/lib/monster-filter.ts` — `filterMonsters()` with full MonsterFilter criteria support
- `src/lib/map-generator.ts` — BSP dungeon, cellular automata caves, outdoor terrain scatter

## Rules
- Use 5.5e / 2024 rules where they differ from 2014. Fall back to 2014 5e for content not yet updated.
- Monster data should be accurate — DMs rely on these stats at the table.
- Keep everything client-side. No database, no server state, no external API calls.
- The `Monster` type has many fields — all are required. See `src/lib/types.ts` for the full interface.
- When adding monsters, split data files by CR range to keep file sizes manageable.

## Build & Test
```bash
npm run dev    # Development server on :3000
npm run build  # Production build (must pass with 0 errors)
npx tsc --noEmit  # Type check only
```

## Branch
Development happens on feature branches. The primary development branch is `claude/dnd-encounter-tool-dVBiA`.
