# Structured SRD content pipeline

Encounterizer's structured reference library is generated from the Markdown in [`oldmanumby/dnd.srd.5.2.1`](https://github.com/oldmanumby/dnd.srd.5.2.1) at commit `af537072cc95f362544c71ad14d56046a9aa065a`. The generated files are committed; neither the site nor CI needs the upstream repository at runtime.

The importer covers the SRD's Playing the Game, Character Creation, Equipment, Spells, Rules Glossary, Gameplay Toolbox, Classes, and Magic Items chapters. The output supplies 1,032 built-in Reference Library entries: 200 rule articles, 24 classes and subclasses, 339 spells, 182 equipment entries, 257 magic items, 17 feats, 4 backgrounds, and 9 species.

## Regeneration

```bash
npm run import:srd
npm run import:srd -- --local path/to/dnd.srd.5.2.1
npm run srd:check
```

Change the source pin only after reviewing the upstream diff, re-deriving exact counts, regenerating all files, and rerunning the full verification suite.

## Source correction ledger

The pinned Markdown transcription has several PDF column/page-boundary defects. `scripts/srd-md/convert.ts` corrects only these named cases before invoking the shared parser:

| Entry | Pinned-extract defect | Verified result |
|---|---|---|
| Cubic Gate | Missing subtitle | `Wondrous Item, Legendary` |
| Dragon Slayer | Previous item's closing paragraph prepended | Stray paragraph removed; `Weapon (Any Simple or Martial), Rare` retained |
| Mirror of Life Trapping | Mithral Armor text/table fragments attached at both boundaries | `Wondrous Item, Very Rare`; foreign fragments removed |
| Potion of Poison | Missing subtitle | `Potion, Uncommon` |
| Staff of the Python | Staff of Power/Woodlands text appended to subtitle | `Staff, Uncommon (Requires Attunement)`; foreign +2 text removed |

Each result was checked against the [official SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf), including pages 216, 230-231, and 247. The audit pins the repaired properties so an upstream or converter change cannot silently reintroduce the corruption.

## Summon Dragon verdict

**Verdict: Summon Dragon is SRD 5.2.1 content and must remain shipped.** It appears in the official SRD spell index and its full level-5 Conjuration entry and Draconic Spirit stat block appear on page 166 of the official PDF. Its absence from the SRD-reForged per-spell extract is an upstream extraction omission, not a licensing exclusion. Encounterizer's existing 5etools-derived spell record is retained, and `npm run srd:check` fails if `summon-dragon` disappears.

## Generated outputs

- `src/data/reference-articles.ts`, `classes.ts`, and `equipment.ts`
- `src/data/reference-content-meta.ts`
- `src/data/magic-items-*.ts` and `magic-items-meta.ts`
- `src/data/feats.ts` and `feats-meta.ts`
- `src/data/backgrounds.ts`, `species.ts`, and `origins-meta.ts`
- `src/data/magic-items.ts` and `origins.ts` stable aggregators

Fix the parser, converter, or explicit source-repair ledger; never hand-edit generated records.
