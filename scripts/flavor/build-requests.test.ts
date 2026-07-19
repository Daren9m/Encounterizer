// Tests for the pure Batches request-building layer (Task C, issue #87).
// Written FIRST per the TDD mandate — these describe the contract of
// scripts/flavor/build-requests.ts before it exists.
import { describe, expect, it } from 'vitest';
import { POOL_KINDS, PROMPT_VERSION, buildSystemPrompt, type PoolKind } from './prompt-spec';
import { POOL_ITEM_SCHEMAS } from './schemas';
import {
  ALLOWED_MODELS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MODEL,
  ENVIRONMENTS,
  buildBatchRequests,
  clampBatchSize,
  estimateAllModels,
  estimateRun,
  type BatchRequest,
} from './build-requests';

/** Category-axis sizes pinned against the engine vocabulary. */
const EXPECTED_CATEGORY_COUNTS: Record<PoolKind, number> = {
  'scenario-hook': 13, // one per Environment value in src/lib/types.ts
  'tactics-type': 14,  // one per TACTICS_BY_TYPE creature type
  treasure: 4,         // low | mid | high | legendary
  'name-prefix': 1,    // single category
  'theme-entry': 8,    // one per ThemeId
  persona: 4,          // PERSONAS | WANTS | SECRETS | LEVERAGE
  'scenario-beat': 3,  // CONTEST_TYPES | SIDE_EVENTS | GAUNTLET_HAZARDS
};

function buildAll(): BatchRequest[] {
  return buildBatchRequests({
    pools: [...POOL_KINDS],
    model: DEFAULT_MODEL,
    batchSize: DEFAULT_BATCH_SIZE,
  });
}

describe('clampBatchSize', () => {
  it('clamps below 30 up to 30', () => {
    expect(clampBatchSize(10)).toBe(30);
    expect(clampBatchSize(29)).toBe(30);
  });

  it('clamps above 60 down to 60', () => {
    expect(clampBatchSize(100)).toBe(60);
    expect(clampBatchSize(61)).toBe(60);
  });

  it('passes in-range values through', () => {
    expect(clampBatchSize(30)).toBe(30);
    expect(clampBatchSize(45)).toBe(45);
    expect(clampBatchSize(60)).toBe(60);
  });

  it('falls back to the default size for NaN instead of propagating it', () => {
    expect(clampBatchSize(Number.NaN)).toBe(DEFAULT_BATCH_SIZE);
  });
});

describe('buildBatchRequests', () => {
  it('produces one request per category, summed across all pools', () => {
    const requests = buildAll();
    const expectedTotal = Object.values(EXPECTED_CATEGORY_COUNTS).reduce((a, b) => a + b, 0);
    expect(requests).toHaveLength(expectedTotal);
    for (const kind of POOL_KINDS) {
      const forKind = requests.filter((r) => r.custom_id.startsWith(`${kind}__`));
      expect(forKind).toHaveLength(EXPECTED_CATEGORY_COUNTS[kind]);
    }
  });

  it('gives every request a unique custom_id in kind__categoryKey__vN form', () => {
    const requests = buildAll();
    const ids = requests.map((r) => r.custom_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const parts = id.split('__');
      expect(parts).toHaveLength(3);
      expect(POOL_KINDS).toContain(parts[0]);
      expect(parts[1].length).toBeGreaterThan(0);
      expect(parts[2]).toBe(`v${PROMPT_VERSION}`);
    }
  });

  it('keeps every custom_id inside the Batches API charset and length limit', () => {
    // The API rejects the whole batch when any custom_id falls outside
    // ^[a-zA-Z0-9_-]{1,64}$ (alphanumeric, hyphen, underscore only).
    for (const r of buildAll()) {
      expect(r.custom_id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });

  it('uses the given model on every request', () => {
    const requests = buildBatchRequests({
      pools: ['treasure'],
      model: 'claude-haiku-4-5',
      batchSize: 40,
    });
    for (const r of requests) expect(r.params.model).toBe('claude-haiku-4-5');
  });

  it('sets adaptive thinking and never sends sampling parameters', () => {
    for (const r of buildAll()) {
      expect(r.params.thinking).toEqual({ type: 'adaptive' });
      const serialized = JSON.stringify(r.params);
      expect(serialized).not.toContain('"temperature"');
      expect(serialized).not.toContain('"top_p"');
      expect(serialized).not.toContain('"top_k"');
    }
  });

  it("wires each request's structured output to the matching pool schema", () => {
    for (const r of buildAll()) {
      const kind = r.custom_id.split('__')[0] as PoolKind;
      expect(r.params.output_config.format.type).toBe('json_schema');
      // Identity, not deep equality: the schema must be the exact exported object.
      expect(r.params.output_config.format.schema).toBe(POOL_ITEM_SCHEMAS[kind]);
    }
  });

  it('uses buildSystemPrompt(kind) verbatim as the system prompt', () => {
    for (const r of buildAll()) {
      const kind = r.custom_id.split('__')[0] as PoolKind;
      expect(r.params.system).toBe(buildSystemPrompt(kind));
    }
  });

  it('sends a single user message stating the item count', () => {
    const requests = buildBatchRequests({
      pools: ['persona'],
      model: DEFAULT_MODEL,
      batchSize: 42,
    });
    for (const r of requests) {
      expect(r.params.messages).toHaveLength(1);
      expect(r.params.messages[0].role).toBe('user');
      expect(r.params.messages[0].content).toContain('42 items');
    }
  });

  it('clamps out-of-range batch sizes before writing them into prompts', () => {
    const requests = buildBatchRequests({
      pools: ['name-prefix'],
      model: DEFAULT_MODEL,
      batchSize: 5,
    });
    expect(requests[0].params.messages[0].content).toContain('30 items');
  });

  it('covers every Environment value exactly once for scenario-hook', () => {
    const requests = buildBatchRequests({
      pools: ['scenario-hook'],
      model: DEFAULT_MODEL,
      batchSize: 40,
    });
    const keys = requests.map((r) => r.custom_id.split('__')[1]);
    expect(keys.sort()).toEqual([...ENVIRONMENTS].sort());
  });

  it('names slot tokens in the scenario-hook user prompt', () => {
    const requests = buildBatchRequests({
      pools: ['scenario-hook'],
      model: DEFAULT_MODEL,
      batchSize: 40,
    });
    for (const r of requests) {
      expect(r.params.messages[0].content).toContain('{monsters}');
      expect(r.params.messages[0].content).toContain('{environment}');
    }
  });

  it('restricting pools yields only requests for those pools', () => {
    const requests = buildBatchRequests({
      pools: ['scenario-hook'],
      model: DEFAULT_MODEL,
      batchSize: 40,
    });
    expect(requests).toHaveLength(EXPECTED_CATEGORY_COUNTS['scenario-hook']);
    for (const r of requests) expect(r.custom_id.startsWith('scenario-hook__')).toBe(true);
  });
});

describe('estimateRun', () => {
  it('is deterministic for identical input', () => {
    const requests = buildAll();
    expect(estimateRun(requests, DEFAULT_MODEL)).toEqual(estimateRun(requests, DEFAULT_MODEL));
  });

  it('matches hand-computed math for a known single request', () => {
    const requests = buildBatchRequests({
      pools: ['name-prefix'],
      model: 'claude-haiku-4-5',
      batchSize: 40,
    });
    expect(requests).toHaveLength(1);
    const [r] = requests;
    const chars = r.params.system.length + r.params.messages[0].content.length;
    const expectedInput = Math.ceil(chars / 4);
    const expectedOutput = 40 * 120;
    const estimate = estimateRun(requests, 'claude-haiku-4-5');
    expect(estimate.requestCount).toBe(1);
    expect(estimate.estInputTokens).toBe(expectedInput);
    expect(estimate.estOutputTokens).toBe(expectedOutput);
    // Batch-discounted haiku prices: in 0.5 / out 2.5 per MTok.
    const expectedCost = (expectedInput * 0.5 + expectedOutput * 2.5) / 1_000_000;
    expect(estimate.estCostUsd).toBeCloseTo(expectedCost, 10);
  });

  it('rejects models outside the allowed set', () => {
    const requests = buildAll();
    expect(() => estimateRun(requests, 'claude-3-opus-20240229')).toThrow(/model/i);
  });
});

describe('estimateAllModels', () => {
  it('includes a row for all four allowed models', () => {
    const rows = estimateAllModels(buildAll());
    expect(rows.map((row) => row.model).sort()).toEqual([...ALLOWED_MODELS].sort());
    for (const row of rows) {
      expect(row.estCostUsd).toBeGreaterThan(0);
    }
  });
});
