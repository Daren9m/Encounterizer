# Contributing to Encounterizer

## Development Setup

```bash
git clone https://github.com/Daren9m/Encounterizer.git
cd Encounterizer
npm install
npm run dev
```

## Code Standards

- **TypeScript strict mode** — no `any` types, no implicit returns
- **Next.js App Router, static export** — pages in `src/app/`, components in
  `src/components/`. No server code: API routes and middleware are
  unsupported under `output: 'export'`
- **Pure engine layer** — logic in `src/lib/` is side-effect-free (no DOM,
  no storage, no network); browser concerns live in `src/app/` and
  `src/components/`
- **Tailwind CSS** — the palette lives in CSS variables in
  `src/app/globals.css`; the Tailwind color tokens alias them, so
  `text-bronze` and `text-[var(--bronze)]` are equivalent (prefer the tokens)
- **Seeded randomness** — all generators draw from `src/lib/random.ts`.
  Shareable links replay seeds, so never change the LCG formula
- **No external API calls at runtime** — all computation is client-side
- **Accurate D&D stats** — monster data must match the SRD 5.2.1; the
  encounter math must match the 2024 DMG
- **Conventional commits** — `feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `ci:`; reference issues (`closes #N`) where applicable

## The Monster Database Is Generated

Do **not** hand-edit `src/data/monsters-*.ts` — they are produced by the
import pipeline and overwritten on every run:

```bash
npm run import:bestiary                 # fetch pinned source and regenerate
npm run import:bestiary -- --local f.json  # use a local bestiary file
```

The script filters the 5etools 2024 Monster Manual data to entries flagged
`srd52` (the CC-BY-4.0 subset), converts them with
`src/lib/import-5etools.ts`, and fails on any audit violation (unstripped
`{@...}` tags, lost attacks, zero XP above CR 0). To fix a monster, fix the
converter or the source pin — not the generated file.

Monsters that aren't in the SRD belong in users' own JSON imports (Bestiary
page → Custom Monsters), never in the repo.

## Structured SRD Data Is Generated

Do **not** hand-edit `src/data/magic-items-*.ts`, `feats.ts`, `backgrounds.ts`,
or `species.ts`. Regenerate them from the pinned SRD-reForged Markdown source:

```bash
npm run import:srd
npm run import:srd -- --local path/to/dnd.srd.5.2.1
npm run srd:check
```

Known transcription repairs are intentionally narrow and documented in
`docs/srd-content-pipeline.md`. Fix the shared parser, the relevant converter,
or that correction ledger rather than patching generated output.

## Before Submitting

```bash
npm run typecheck    # tsc --noEmit — must pass with 0 errors
npm run lint         # ESLint — no warnings or errors
npm test             # Vitest — all tests green
npm run srd:check    # committed SRD corpora pass the offline audit
npm run build        # Static export must complete
```

CI runs the same four steps on every pull request.

## Issue Labels

- `enhancement` — New feature
- `bug` — Something broken
- `data` — Monster/spell database work
- `ui` — Frontend/visual changes
- `integration` — Wiring and imports
- `infrastructure` — Build, deploy, CI/CD
- `feature` — Major new capability
