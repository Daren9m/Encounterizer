# SRD Completeness — Wave 1 (Structured Content)

**Status:** Implemented 2026-07-20 · **Milestone:** [SRD Completeness — Wave 1](https://github.com/Daren9m/Encounterizer/milestone/9)

## Goal

Add the SRD 5.2.1 structured content categories that Encounterizer did not yet ship: 257 magic items, 17 feats, 4 backgrounds, and 9 species. This wave is a data and build-pipeline change only; searchable reference UI is reserved for a later wave.

## Source and reproducibility

- Upstream: [`oldmanumby/dnd.srd.5.2.1`](https://github.com/oldmanumby/dnd.srd.5.2.1)
- Pinned commit: `af537072cc95f362544c71ad14d56046a9aa065a`
- Input: the per-entry Markdown files under `04_Character_Origins`, `05_Feats`, and `10_Magic_Items`
- Authority for disputed content: the [official SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)

Generated TypeScript is committed. Application builds and CI do not fetch content from the network.

## Data contract

`src/lib/srd-content-types.ts` owns the public types for magic items, feats, backgrounds, species, species traits, and corpus metadata. Every record has a deterministic slug ID, required structured fields, plain-text rules content, and `source: 'SRD 5.2.1'`.

Magic items are partitioned into deterministic rarity bands. Multi-rarity items live in the band of their lowest listed rarity; `Rarity Varies` records have a separate band. `src/data/magic-items.ts` aggregates all bands. `src/data/origins.ts` aggregates backgrounds and species.

## Parsing and source repairs

`scripts/srd-md/parse-entry.ts` is the single parser for the upstream per-entry format: level-one name, optional italic subtitle, bold field lines, headings, prose, lists, and tables. Formatting becomes plain text, and split ability labels such as `S tr 19` are repaired deterministically.

The parser itself does not guess at damaged entries. Five page-boundary defects in the pinned magic-item extract are corrected by narrow filename-specific transforms before parsing: Cubic Gate, Dragon Slayer, Mirror of Life Trapping, Potion of Poison, and Staff of the Python. The correction ledger and official-source verification are in [`docs/srd-content-pipeline.md`](../../srd-content-pipeline.md).

## Audit gate

`npm run srd:check` runs without network access and fails on:

- incorrect corpus or metadata counts;
- duplicate IDs/names or unstable generated slugs;
- missing required structured fields;
- residual Markdown, object coercion, or unrepaired OCR labels;
- loss of the original spell-reference IDs used by saved pins;
- loss of Summon Dragon; or
- regression of any explicit page-boundary correction.

CI runs this gate before the static build.

## Acceptance

- `npm run import:srd` can regenerate from the pinned remote source.
- `npm run import:srd -- --local <checkout>` supports offline/local regeneration.
- Generated counts are exactly 257/17/4/9.
- Parser fixtures cover one real entry from every Wave 1 category.
- Typecheck, lint, tests, SRD audit, and static build pass.
