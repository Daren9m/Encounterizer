# Contributing to Encounterizer

## Development Setup

```bash
git clone https://github.com/Daren9m/Encounterizer-.git
cd Encounterizer-
npm install
npm run dev
```

## Code Standards

- **TypeScript strict mode** — no `any` types, no implicit returns
- **Next.js App Router** — pages in `src/app/`, components in `src/components/`
- **Tailwind CSS** — use the D&D-themed CSS variables defined in `src/app/globals.css` (e.g., `var(--gold)`, `var(--dungeon-dark)`)
- **No external API calls** — all computation is client-side
- **Accurate D&D stats** — monster data should match published 5e/5.5e sources

## Adding Monsters

1. Find the appropriate CR-range file in `src/data/` (e.g., `monsters-cr5-8.ts`)
2. Add a new `Monster` object following the full interface in `src/lib/types.ts`
3. All fields are required — see existing monsters for examples
4. Populate computed fields: `movementModes`, `attackDamageTypes`, `attackDeliveryModes`, `tags`
5. The monster will automatically appear in `ALL_MONSTERS` via the barrel export in `src/data/index.ts`

## Expanding the Database via 5etools

The `src/lib/import-5etools.ts` utility converts 5etools JSON format to our `Monster` type. To bulk-import:

1. Obtain a 5etools bestiary JSON file
2. Use `import5eToolsBestiary(json)` to convert
3. Review and spot-check the output
4. Split into CR-range files and add to `src/data/`

## Before Submitting

```bash
npx tsc --noEmit     # Must pass with 0 errors
npm run build        # Must complete successfully
```

## Issue Labels

- `enhancement` — New feature
- `bug` — Something broken
- `data` — Monster database work
- `ui` — Frontend/visual changes
- `integration` — Wiring/import fixes
- `infrastructure` — Build, deploy, CI/CD
- `feature` — Major new capability
