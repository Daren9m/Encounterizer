# LLM-Assisted Encounter Generation — Design Specification

**Date:** 2026-07-18 · **Status:** Approved (rev. 2 — incorporates cross-review findings)
**Branch:** `claude/llm-encounter-generators-2290ac` (from post-unification `main`)

## 1. Context

Encounterizer's combat generator (`src/lib/encounter-generator.ts`) and unified
noncombat generator (`src/lib/noncombat/generate.ts`) are fully deterministic:
seeded RNG over hand-written template pools. This work adds LLM-assisted
narrative generation optimized for (a) economy and (b) reliably high-quality,
playable output, without breaking:

- **Static export** (`output: 'export'`), no server code, zero runtime network
  calls; Azure Static Web Apps free tier.
- **Seeded replay** — the `src/lib/random.ts` LCG and noncombat draw order are
  frozen and test-pinned (`?seed=` share links must reproduce results).
- **SRD 5.2.1 licensing boundary** — publicly shipped content is SRD-only.
- **Exact rules math** (2024 XP budgets, DCs) — DMs rely on it at the table.

**Core principle: engine does math, LLM does words.** The LLM never selects
monsters, computes XP, or sets DCs. Anything it writes is grounded in engine
output and gated before it can reach a user.

## 2. Decisions

| Decision | Choice |
|---|---|
| Delivery | **Phased.** Phase 1: build-time generation (ship first). Phase 2: BYOK runtime enrichment — **gated on a post-Phase-1 evaluation checkpoint** (demand + quality data), not an automatic transition |
| LLM scope | Narrative only, grounded in engine output; runtime phase adds user campaign-context tailoring |
| Provider | Anthropic (Claude) for build-time authoring runs; model tier decided at first `--dry-run` (cost table §7) |
| Rejected | Azure Functions proxy for v1 — on **economy/complexity** grounds (owner-funded tokens for anonymous traffic; real rate limiting requires a state store SWA managed functions don't provide). Documented future option, not a reliability rejection. Also rejected: LLM-led encounter composition (budget-math drift, invalid picks, non-SRD leakage) |

## 3. Verified facts (2026-07-18)

- Claude pricing (per MTok in/out): Haiku 4.5 $1/$5 · Sonnet 4.6/5 $3/$15 ·
  Opus 4.8 $5/$25. **Batches API −50%.** Structured outputs
  (`output_config.format` json_schema) guarantee response *shape* — not
  semantic truth; refusals and `max_tokens` termination can bypass schema
  compliance and must be handled (§6.3).
- `@anthropic-ai/sdk` supports browser use via `dangerouslyAllowBrowser: true`
  (deliberately alarming name; intended for user-supplied-key scenarios).
- Azure SWA free plan includes managed Functions (1M exec/mo, HTTP only, no
  SLA) — future-option context only.

## 4. Codebase seams (from exploration)

- **Combat prose:** ~88 inline template strings in `encounter-generator.ts`
  (`SCENARIO_HOOKS` ×20, `TACTICS_BY_TYPE` 14×3, `TREASURE_BY_CR` 4×4, name
  prefixes ×10). Prose fields: `name`, `description`, `scenarioHook`,
  `tactics`, `treasure`.
- **Noncombat prose:** ~1,000+ lines of pools in `src/data/`
  (`noncombat-themes.ts`, `noncombat-scenarios.ts`, `noncombat-cast.ts`,
  `riddles.ts`) + template literals in engine code. Authoring rule: pools
  contain **no dice/DCs** — engines attach the numbers.
- **Mechanical layer (stays engine-owned, test-locked):** XP knapsack +
  budget caps, `noncombat/levers.ts` DC/dice tables, structure/attitudeTrack/
  clueWeb/chase, handout grids, `estimatedMinutes`, seeded draw order.
- **Precedents reused:** importer audit pattern (`import-bestiary.ts`),
  content governance (`monster-visuals.ts`: promptVersion, inputHash, review
  states, `--check`), settings UI (`CustomSpellPanel.tsx`), async skeleton
  (Battle Forecast `simRunning`), seed-detach on edit (`seed: 0` +
  `clearUrlSeed`).

## 5. Flavor-pool versioning (the seed-contract answer)

Terminology: this preserves the **flavor-pool contract** — the mapping from
seeded draws to prose per pool version. It does not promise eternal
byte-identity of entire encounters against unrelated mechanical changes;
those remain governed by the existing golden-pin discipline ("never update
without versioning URLs").

- Current pools are frozen verbatim as **v1**. Generated pools become **v2**.
- `GenerateOptions.flavorVersion?: 1 | 2` — **library default is 1**
  (backward compatible: existing callers and tests are untouched by
  construction, not by promise). The UI explicitly passes `2` for new
  generations. Same option on the noncombat generator.
- Share URLs gain `fv=2`; hydration without `fv` resolves to v1, so
  pre-existing links reproduce exactly what they did.
- New v2 golden pins are added *after* the first generated content is
  reviewed and merged, then frozen.

## 6. Phase 1 — Build-time flavor generation

**Goal:** richer, reviewed variety for every visitor; $0 runtime cost; no
runtime architecture change.

### 6.1 Components

| File | Purpose |
|---|---|
| `scripts/flavor/prompt-spec.ts` | The "flavor bible": voice/tone rules, groundedness rules (only supplied SRD facts may be referenced), hard bans (no dice/DCs; no non-SRD names; **no named settings, adventures, characters, or deities; no imitation of official-book prose**), `PROMPT_VERSION` |
| `scripts/flavor/schemas.ts` | JSON schemas per pool type, used as `output_config.format` |
| `scripts/generate-flavor.ts` | tsx script; Batches API; flags `--pools`, `--model`, `--dry-run` (prompts + token/cost estimate, no spend), `--local` (re-audit without network). **Generates in small per-category batches (30–60 items)**, not one monolith |
| `scripts/flavor/audit.ts` | Hygiene + licensing gate (§6.2), `--check` mode for CI, exit 1 on failure |
| `scripts/flavor/review.ts` | Quality gate (§6.2): blind old-vs-new sampling and accept/reject promotion of candidate records into committed pools; tracks rejection reasons |
| `src/data/encounter-flavor.ts` | AUTO-GENERATED combat pools (v2) + provenance meta (promptVersion, model, generatedAt, counts) |
| `src/data/monster-tactics.json` | AUTO-GENERATED **per-monster grounded tactics** keyed by monster ID — audited so every named action/spell/movement mode exists in that monster's stat block. Replaces reliance on enlarged generic type-keyed tactics |
| `src/data/noncombat-flavor-gen.ts` | AUTO-GENERATED noncombat pool additions (theme-pack entries, personas, scenario beats) + provenance meta |

`@anthropic-ai/sdk` is a **devDependency only** in Phase 1 (runtime deps stay
at 4; static bundle untouched).

### 6.2 Reliability gates (three layers)

1. **Hygiene audit** (mechanical, CI-able): schema re-validation, uniqueness,
   length bounds, slot-token integrity, no dice/DC notation, count/meta
   consistency.
2. **Licensing gate** (necessary-not-sufficient, layered): prompts contain
   only supplied SRD facts; explicit ban-list (settings, adventures, named
   characters, deities); non-SRD monster-name scan against the generated SRD
   bestiary; **proper-noun extraction for human review**; provenance metadata
   per batch. Human review is the final licensing gate.
3. **Quality gate** (the part hygiene can't measure): per-category candidate
   batches are sampled **blind against current v1 content** and scored for
   actionability, clarity, distinctiveness, and (for tactics) fidelity to the
   monster's actual abilities. Only accepted records are promoted into
   committed pools; rejection reasons are logged to improve prompts. PR diff
   review remains the last gate, kept tractable by small batch sizes.

### 6.3 Modified files

- `src/lib/encounter-generator.ts` — extract inline pools into versioned
  sets (`FLAVOR_V1` frozen / `FLAVOR_V2` generated); add
  `flavorVersion` (default **1**); tactics lookup prefers per-monster entries
  (v2) with type-keyed fallback.
- `src/data/noncombat-*.ts` — existing entries untouched; generated entries
  appended behind the version switch.
- `src/app/encounters/page.tsx`, `src/app/noncombat/page.tsx` — pass
  `flavorVersion: 2`; write/read `fv` URL param.
- `package.json` — `generate:flavor`, `flavor:check` scripts; CI runs
  `flavor:check` (no network) once generated data lands.

## 7. Cost analysis

One full Phase 1 regeneration ≈ 800–1,200 items × ~120 output tokens
(≈150K out + ~300K in), via Batches with a cached prompt spec:

| Model | Est. per full regen |
|---|---|
| Opus 4.8 | ~$3 (range $2–8) — recommended: content is permanent and reviewed |
| Sonnet 4.6/5 | ~$1.50 |
| Haiku 4.5 | ~$0.50 |

Runtime cost: **$0/month**. The dominant Phase 1 cost is human review time,
which the small-batch + blind-sampling workflow (§6.2) exists to bound.

Phase 2 (user pays own key): ~1.5–2K in + ~500 out per enrichment ≈
$0.004 (Haiku) / $0.01 (Sonnet) / $0.02 (Opus) per call. Owner cost: $0.

## 8. Phase 2 — BYOK runtime enrichment (gated)

**Entry gate:** proceed only after a post-Phase-1 evaluation checkpoint
(observed demand, Phase 1 quality data). Alternatives re-evaluated at the
checkpoint: tightly budgeted Functions proxy · BYOK · no live generation.

Design (if/when gated in):

- **Key handling:** key held **in memory by default**; `sessionStorage` at
  most (cleared with the tab); persistent `localStorage` storage only as an
  explicit, strongly-warned opt-in. Copy must be accurate: **"sent directly
  to Anthropic; never sent to or stored by Encounterizer"** (the key and
  campaign notes do leave the browser — to the provider only). Add a
  Content-Security-Policy header (via `staticwebapp.config.json`) restricting
  `connect-src` before shipping browser-held credentials.
- **Client:** `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`
  (default choice; measure bundle impact — plain `fetch` is the documented
  escape hatch if size proves material). Network code lives in
  `src/app/hooks/` (src/lib purity rule); prompt-building/validation/merge
  are pure functions in `src/lib/llm/`.
- **Semantic validation + merge guard** (applies to any runtime phase):
  - every referenced monster/check ID must exist in the request contract;
  - tactics may not name actions, spells, senses, speeds, or conditions
    absent from the supplied monster facts;
  - enrichment merges through an explicit **field allowlist** — mechanical
    fields are unreachable by construction;
  - handle `stop_reason: refusal` and `max_tokens` (schema compliance is not
    guaranteed on those paths);
  - one repair retry with compact validation errors, then deterministic
    fallback (engine output stands);
  - tests prove mechanical fields are byte-identical before/after enrichment.
- **Compact locked contract:** distilled monster facts (names, abilities,
  resistances), never full `Monster` objects — token economy + grounding.
- **UX:** engine result renders instantly; explicit "Enrich" action with
  Battle-Forecast-style skeleton; AI-enriched marker; revert control;
  enrichment marked **stale** (never auto-rerun) when monsters/party change;
  enrichment detaches the seed (existing convention). Campaign-notes textarea
  is size-limited and treated as untrusted data in the prompt.

## 9. Process

- Milestone **"LLM generators: Phase 1 (build-time flavor)"** with issues:
  1. Prompt spec + schemas + generation script scaffolding
  2. Audit gate (hygiene + licensing) + CI `flavor:check`
  3. Combat pool extraction + `flavorVersion`/`fv` versioning (v1 default)
  4. Noncombat pool versioning + generated additions
  5. Per-monster grounded tactics data + ability-grounding audit
  6. Quality review loop (blind sampling, promotion workflow)
  7. First generation run + review PR + v2 golden pins
- Phase 2 tracked as a backlog issue gated on the evaluation checkpoint.
- Feature branches, conventional commits, push after every commit, PRs to
  `main`. Tag after milestone completion (confirm first).

## 10. Verification

**Phase 1:** `typecheck`/`lint`/`test`/`build` green · legacy golden pins
untouched and passing (v1 default guarantees this by construction) · a
pre-change share URL (no `fv`) reproduces byte-identical output · v2 pins
deterministic · `flavor:check` passes in CI without network · manual dev-server
pass on both pages · `fv=2` links round-trip.

**Phase 2 (when gated in):** no-key behavior byte-identical (no network
requests fire) · enrichment calls go directly to `api.anthropic.com` · merge
allowlist unit tests (mechanical byte-identity) · refusal/401/timeout paths
leave engine result intact · static export still builds with no API routes.

## 11. Review provenance

Rev. 2 incorporates findings from a cross-review exchange (Claude review of a
ChatGPT-authored plan, ChatGPT review of rev. 1): flavor-version default
inversion (default v1, explicit v2), BYOK key-handling hardening + honest
copy, semantic-validation/merge-guard layer, small-batch quality loop with
blind sampling, per-monster grounded tactics, strengthened licensing gates,
and the "flavor-pool contract" framing. The Azure Functions proxy remains a
documented future option (its viability requires a state store for rate
limiting; economy — not reliability — keeps it out of v1).
