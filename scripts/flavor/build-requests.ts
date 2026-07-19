// ─── Flavor Batches Request Builder (pure) ───────────────────────
// Issue #87 Task C, Phase 1 of docs/superpowers/specs/2026-07-18-
// llm-generators-design.md. The testable heart of the generation CLI:
// composes one Message Batches request per (pool kind × category) from
// the Task A prompt spec and Task B schemas, plus deterministic dry-run
// token/cost estimation. No side effects — the CLI shell lives in
// scripts/flavor/generate-flavor.ts.
//
// API rules (constraint 4 — violations are 400s in production):
// - model IDs come only from ALLOWED_MODELS below; never constructed.
// - thinking: { type: 'adaptive' } only; NEVER temperature/top_p/top_k.
// - structured outputs ride in output_config.format.{type,schema}.

import {
  POOL_KINDS,
  PROMPT_VERSION,
  buildSystemPrompt,
  type PoolKind,
} from './prompt-spec';
import { POOL_ITEM_SCHEMAS } from './schemas';
import type { Environment } from '../../src/lib/types';

/** Compile-time assertion helper: instantiating with `false` is an error. */
type AssertTrue<T extends true> = T;

// ─── Models & pricing ────────────────────────────────────────────

/** The only model IDs this tooling may send (constraint 4, verbatim). */
export const ALLOWED_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-sonnet-5',
  'claude-haiku-4-5',
] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

export const DEFAULT_MODEL: AllowedModel = 'claude-opus-4-8';

/**
 * USD per MTok, already batch-discounted 50% (Batches API pricing).
 * Both Sonnet models share the Sonnet tier price.
 */
export const PRICES: Record<AllowedModel, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-opus-4-8': { inputPerMTok: 2.5, outputPerMTok: 12.5 },
  'claude-sonnet-4-6': { inputPerMTok: 1.5, outputPerMTok: 7.5 },
  'claude-sonnet-5': { inputPerMTok: 1.5, outputPerMTok: 7.5 },
  'claude-haiku-4-5': { inputPerMTok: 0.5, outputPerMTok: 2.5 },
};

// ─── Batch sizing ────────────────────────────────────────────────

export const DEFAULT_BATCH_SIZE = 40;
export const MIN_BATCH_SIZE = 30;
export const MAX_BATCH_SIZE = 60;

/** Clamp the per-category item count into the supported [30, 60] band. */
export function clampBatchSize(n: number): number {
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.trunc(n)));
}

// ─── Category axes (engine vocab, never invented) ────────────────

/**
 * Every Environment value from src/lib/types.ts. The engine exports the
 * union type but no runtime list, so this tuple is pinned to it twice:
 * `satisfies` rejects entries outside the union, and the Exclude-never
 * assert below fails to compile if a union member is missing — the same
 * pattern schemas.ts uses for creature types and theme ids.
 */
export const ENVIRONMENTS = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland',
  'Hill', 'Mountain', 'Swamp', 'Underdark', 'Underwater',
  'Urban', 'Planar', 'Any',
] as const satisfies readonly Environment[];

type _AllEnvironmentsCovered = AssertTrue<
  [Exclude<Environment, (typeof ENVIRONMENTS)[number]>] extends [never] ? true : false
>;

/**
 * Extract an item-property enum from a Task B response schema, so the
 * category axes can never drift from what the schemas allow. Shape:
 * schema.properties.items.items.properties[prop].enum.
 */
function schemaEnum(kind: PoolKind, property: string): string[] {
  const schema = POOL_ITEM_SCHEMAS[kind] as {
    properties?: {
      items?: { items?: { properties?: Record<string, { enum?: unknown }> } };
    };
  };
  const values = schema.properties?.items?.items?.properties?.[property]?.enum;
  if (!Array.isArray(values) || values.some((v) => typeof v !== 'string')) {
    throw new Error(`POOL_ITEM_SCHEMAS['${kind}'] has no string enum at items.${property}`);
  }
  return values as string[];
}

/** One request per category key; the key becomes the custom_id middle segment. */
function categoryKeysFor(kind: PoolKind): string[] {
  switch (kind) {
    case 'scenario-hook':
      return [...ENVIRONMENTS];
    case 'tactics-type':
      return schemaEnum('tactics-type', 'creatureType');
    case 'treasure':
      return schemaEnum('treasure', 'tier');
    case 'name-prefix':
      return ['all'];
    case 'theme-entry':
      return schemaEnum('theme-entry', 'themeId');
    case 'persona':
      return schemaEnum('persona', 'pool');
    case 'scenario-beat':
      return schemaEnum('scenario-beat', 'pool');
  }
}

/**
 * Category-specific user prompt. Deliberately terse: the system prompt
 * is the stable cache-friendly prefix carrying all rules, so this only
 * states the category context, the item count, and (for slotted kinds)
 * the slot tokens. The count phrase "Write N items." is load-bearing —
 * requestedItemCount() parses it back out for estimation.
 */
function buildUserPrompt(kind: PoolKind, categoryKey: string, batchSize: number): string {
  const count = `Write ${batchSize} items.`;
  switch (kind) {
    case 'scenario-hook':
      return `The environment is ${categoryKey}. ${count} Slot tokens: {monsters} and {environment}.`;
    case 'tactics-type':
      return `The creature type is ${categoryKey}. ${count}`;
    case 'treasure':
      return `The tier is ${categoryKey}. ${count}`;
    case 'name-prefix':
      return count;
    case 'theme-entry':
      return `The theme is ${categoryKey}. ${count} Spread them across all of the theme's prose fields.`;
    case 'persona':
      return `The target pool is ${categoryKey}. ${count}`;
    case 'scenario-beat':
      return `The target pool is ${categoryKey}. ${count}`;
  }
}

// ─── Request building ────────────────────────────────────────────

export interface BatchRequest {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    system: string;
    messages: { role: 'user'; content: string }[];
    output_config: { format: { type: 'json_schema'; schema: Record<string, unknown> } };
    thinking: { type: 'adaptive' };
  };
}

export interface BuildOptions {
  pools: PoolKind[];
  model: string;
  batchSize: number;
}

const MAX_TOKENS = 16_000;

/**
 * Build the full Batches request list: one request per category of each
 * selected pool, custom_id `${kind}:${categoryKey}:v${PROMPT_VERSION}`
 * (unique across the run — kinds partition the id space and category
 * keys are unique within a kind).
 */
export function buildBatchRequests({ pools, model, batchSize }: BuildOptions): BatchRequest[] {
  const size = clampBatchSize(batchSize);
  const requests: BatchRequest[] = [];
  for (const kind of POOL_KINDS) {
    if (!pools.includes(kind)) continue;
    const system = buildSystemPrompt(kind);
    for (const categoryKey of categoryKeysFor(kind)) {
      requests.push({
        custom_id: `${kind}:${categoryKey}:v${PROMPT_VERSION}`,
        params: {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: buildUserPrompt(kind, categoryKey, size) }],
          output_config: {
            format: { type: 'json_schema', schema: POOL_ITEM_SCHEMAS[kind] },
          },
          thinking: { type: 'adaptive' },
        },
      });
    }
  }
  return requests;
}

// ─── Dry-run estimation ──────────────────────────────────────────

export interface RunEstimate {
  requestCount: number;
  estInputTokens: number;
  estOutputTokens: number;
  estCostUsd: number;
}

const ITEM_COUNT_RE = /\bWrite (\d+) items\b/;
const EST_OUTPUT_TOKENS_PER_ITEM = 120;

/** Recover the per-request item count from the "Write N items." phrase. */
function requestedItemCount(request: BatchRequest): number {
  const content = request.params.messages[0]?.content ?? '';
  const match = ITEM_COUNT_RE.exec(content);
  return match ? Number(match[1]) : DEFAULT_BATCH_SIZE;
}

function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

/**
 * Deterministic cost estimate for a request list. Input tokens use the
 * chars/4 heuristic (an estimate, not a count); output assumes 120
 * tokens per requested item. Prices are batch-discounted per MTok.
 */
export function estimateRun(requests: BatchRequest[], model: string): RunEstimate {
  if (!isAllowedModel(model)) {
    throw new Error(
      `Unknown model '${model}' — allowed models: ${ALLOWED_MODELS.join(', ')}`,
    );
  }
  let estInputTokens = 0;
  let estOutputTokens = 0;
  for (const request of requests) {
    const chars =
      request.params.system.length +
      request.params.messages.reduce((sum, m) => sum + m.content.length, 0);
    estInputTokens += Math.ceil(chars / 4);
    estOutputTokens += requestedItemCount(request) * EST_OUTPUT_TOKENS_PER_ITEM;
  }
  const price = PRICES[model];
  const estCostUsd =
    (estInputTokens * price.inputPerMTok + estOutputTokens * price.outputPerMTok) / 1_000_000;
  return { requestCount: requests.length, estInputTokens, estOutputTokens, estCostUsd };
}

/** Per-model comparison rows so the tier decision (spec §7) can be made from one dry run. */
export function estimateAllModels(
  requests: BatchRequest[],
): ({ model: AllowedModel } & RunEstimate)[] {
  return ALLOWED_MODELS.map((model) => ({ model, ...estimateRun(requests, model) }));
}
