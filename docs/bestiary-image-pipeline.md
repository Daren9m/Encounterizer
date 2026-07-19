# Bestiary image pipeline

The bestiary image workflow is deliberately split into description, review, and image stages. An image prompt cannot be compiled until its monster visual record is approved.

## Source and attribution

The monster index includes material from the *System Reference Document 5.2.1* by Wizards of the Coast LLC, [available from D&D Beyond](https://www.dndbeyond.com/srd) and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode). The visual sidecar preserves that attribution and the pinned source commit in `src/data/monster-visuals.json`. Generated descriptions and images must remain original expressions; do not copy third-party prose or artwork.

## Files

- `src/data/monster-visuals.json` is the editable sidecar keyed by `monsterId`. It contains source facts, description fields, review/image status, prompt version, and a hash of visual-relevant monster inputs.
- `src/data/monster-visual-batches.json` assigns every monster exactly once to the pilot or one of 11 production batches.
- `src/data/monster-images.json` is the generated, client-safe image index. It includes only draft or later website assets and their accessible alt text, keeping prompt and review metadata out of the browser bundle.
- `src/lib/monster-visuals.ts` defines the schema, art bible, validation, hashing, batching, and prompt compiler.
- `scripts/enrich-bestiary-visuals.ts` synchronizes records after a bestiary import without replacing authored descriptions.

## Workflow

1. Run `npm run import:bestiary` when the pinned SRD source changes.
2. Run `npm run visuals:sync`. New monsters receive pending records populated only with structured source facts.
3. Author the physical description fields for a batch. Record distinguishing anatomy, silhouette, surface materials, palette, pose, environment, required elements, forbidden elements, and accessible alt text. Stage the 14-monster pilot with `npm run visuals:seed-pilot` and the remaining 317 descriptions with `npm run visuals:seed-production`. Both commands preserve matching reviewed records and refuse to replace any description that has subsequently been edited.
4. Review against the licensed source and set `reviewStatus` to `approved`. Set `imageStatus` to `ready` only when the description is ready for generation.
5. Compile the prompt through `compileMonsterImagePrompt`, generate candidate images, and track review through `draft` and `approved`.
6. Run `npm run visuals:audit`, `npm run visuals:check`, `npm test`, and `npm run typecheck` before merging.

`npm run visuals:sync` updates the runtime image index whenever an image status changes. The bestiary automatically displays indexed portraits in cards and the selected-monster panel; blocked and ready records retain the text-only fallback.

Draft and approved website assets use the stable path `public/images/monsters/<monsterId>.webp`. Production files are 1024×1280 WebP portraits; keep model-native PNG files outside the repository as generation sources. Run `npm run visuals:audit-images` to verify that every tracked draft has exactly one optimized asset, that dimensions and filenames follow the contract, and that no source PNGs remain in the public bundle.

Batch comparison grids are stored beside their review packets as `docs/visual-review/<batch-id>-contact-sheet.webp`. The current grids are `pilot-contact-sheet.webp`, `production-01-contact-sheet.webp`, `production-02-contact-sheet.webp`, `production-03-contact-sheet.webp`, `production-04-contact-sheet.webp`, and `production-05-contact-sheet.webp`.

If a monster's visual-relevant inputs or the prompt version changes, synchronization preserves its authored text but marks approved work `needs-revision`. Duplicate or orphaned records stop synchronization rather than being silently discarded.

Run `npm run visuals:export-review` to create a batch-by-batch Markdown review packet under `docs/visual-review`. Those files are generated views; make corrections in the sidecar or authored seed source and export again.

## Batch contract

The pilot contains one representative of each creature type in a fixed order. After removing those 14 monsters, the remaining 317 are sorted by challenge rating, then name, then ID. Production batches 1–9 contain 29 monsters each; batches 10–11 contain 28 each. The manifest contains no timestamps, so repeated generation is byte-stable.
