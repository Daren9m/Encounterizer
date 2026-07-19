// ─── LLM Flavor Pool Generation (Batches CLI entry) ──────────────
// Issue #87, Phase 1 of docs/superpowers/specs/2026-07-18-llm-generators-
// design.md (sections 5–6). Generates candidate flavor-text pool entries
// via the Anthropic Message Batches API from the prompt spec + schemas
// under scripts/flavor/. Candidates land in scripts/flavor/out/
// (git-ignored) for the audit layer (issue #88) — nothing here touches
// src/ or ships directly.
//
//   npm run generate:flavor -- --dry-run              # plan + cost estimate, no network
//   npm run generate:flavor                           # live run (needs ANTHROPIC_API_KEY)
//   npm run generate:flavor -- --pools treasure,persona --model claude-haiku-4-5
//   npm run generate:flavor -- --local scripts/flavor/out/raw-<batchId>.json
//
// All logic lives in scripts/flavor/generate-flavor.ts (importable and
// tested with a fake client); this file is only the executable shim.

import { main } from './flavor/generate-flavor';

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
