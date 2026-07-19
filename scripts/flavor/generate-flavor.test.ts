// Tests for the CLI shell + live batch path (Task C, issue #87).
// Written FIRST per the TDD mandate — they describe the contract of
// scripts/flavor/generate-flavor.ts (imported by the thin tsx entry at
// scripts/generate-flavor.ts) before it exists.
//
// No network, ever (constraint 3): the Anthropic client is injectable and
// every test drives runBatch with a structural fake.
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { POOL_KINDS, PROMPT_VERSION } from './prompt-spec';
import { buildBatchRequests, DEFAULT_MODEL, type BatchRequest } from './build-requests';
import {
  main,
  parseArgs,
  runBatch,
  UsageError,
  type BatchClientLike,
  type CliIo,
} from './generate-flavor';

function tempOutDir(): string {
  return mkdtempSync(join(tmpdir(), 'flavor-out-'));
}

function makeIo(overrides: Partial<CliIo> = {}): CliIo & { logs: string[]; errors: string[] } {
  const logs: string[] = [];
  const errors: string[] = [];
  return {
    logs,
    errors,
    log: (line: string) => logs.push(line),
    error: (line: string) => errors.push(line),
    createClient: async () => {
      throw new Error('createClient must not be called in this test');
    },
    ...overrides,
  };
}

// ─── parseArgs ───────────────────────────────────────────────────

describe('parseArgs', () => {
  it('applies documented defaults', () => {
    const opts = parseArgs([]);
    expect(opts.pools).toEqual([...POOL_KINDS]);
    expect(opts.model).toBe('claude-opus-4-8');
    expect(opts.batchSize).toBe(40);
    expect(opts.dryRun).toBe(false);
    expect(opts.localFile).toBeNull();
    expect(opts.outDir).toBe(join('scripts', 'flavor', 'out'));
  });

  it('accepts every allowed model and rejects everything else', () => {
    expect(parseArgs(['--model', 'claude-haiku-4-5']).model).toBe('claude-haiku-4-5');
    expect(parseArgs(['--model', 'claude-sonnet-4-6']).model).toBe('claude-sonnet-4-6');
    expect(parseArgs(['--model', 'claude-sonnet-5']).model).toBe('claude-sonnet-5');
    expect(() => parseArgs(['--model', 'claude-3-opus-20240229'])).toThrow(UsageError);
    expect(() => parseArgs(['--model', 'claude-opus-4-8-20260101'])).toThrow(/model/i);
  });

  it('parses pool subsets and rejects unknown pools', () => {
    expect(parseArgs(['--pools', 'scenario-hook,treasure']).pools).toEqual([
      'scenario-hook',
      'treasure',
    ]);
    expect(() => parseArgs(['--pools', 'scenario-hook,bogus'])).toThrow(UsageError);
  });

  it('rejects an empty --pools list instead of building zero requests', () => {
    expect(() => parseArgs(['--pools', ''])).toThrow(UsageError);
    expect(() => parseArgs(['--pools', ' , '])).toThrow(UsageError);
  });

  it('dedupes repeated --pools entries', () => {
    expect(parseArgs(['--pools', 'treasure,treasure,persona']).pools).toEqual([
      'treasure',
      'persona',
    ]);
  });

  it('clamps --batch-size into [30, 60] and rejects non-numbers', () => {
    expect(parseArgs(['--batch-size', '100']).batchSize).toBe(60);
    expect(parseArgs(['--batch-size', '3']).batchSize).toBe(30);
    expect(parseArgs(['--batch-size', '50']).batchSize).toBe(50);
    expect(() => parseArgs(['--batch-size', 'lots'])).toThrow(UsageError);
  });

  it('parses --dry-run, --local, and --out', () => {
    const opts = parseArgs(['--dry-run', '--local', 'raw.json', '--out', 'somewhere']);
    expect(opts.dryRun).toBe(true);
    expect(opts.localFile).toBe('raw.json');
    expect(opts.outDir).toBe('somewhere');
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--frobnicate'])).toThrow(UsageError);
  });
});

// ─── runBatch (fake client) ──────────────────────────────────────

interface FakeResultEntry {
  custom_id: string;
  result:
    | { type: 'succeeded'; message: { content: unknown } }
    | { type: 'errored'; error: { type: string; message?: string } }
    | { type: 'expired' };
}

function textBlock(text: unknown): { content: { type: string; text: unknown }[] } {
  return { content: [{ type: 'text', text }] };
}

function makeFakeClient(entries: FakeResultEntry[], statuses: string[]): {
  client: BatchClientLike;
  retrieveCalls: () => number;
} {
  let retrieveCount = 0;
  const client: BatchClientLike = {
    messages: {
      batches: {
        create: async () => ({ id: 'batch_test_1', processing_status: 'in_progress' }),
        retrieve: async () => {
          const status = statuses[Math.min(retrieveCount, statuses.length - 1)];
          retrieveCount += 1;
          return { id: 'batch_test_1', processing_status: status };
        },
        results: async () =>
          (async function* () {
            for (const entry of entries) yield entry;
          })(),
      },
    },
  };
  return { client, retrieveCalls: () => retrieveCount };
}

function treasureRequests(): BatchRequest[] {
  return buildBatchRequests({ pools: ['treasure'], model: DEFAULT_MODEL, batchSize: 40 });
}

describe('runBatch', () => {
  const outOfOrderEntries: FakeResultEntry[] = [
    // Deliberately NOT in request order — keying must be by custom_id.
    {
      custom_id: `treasure__high__v${PROMPT_VERSION}`,
      result: {
        type: 'succeeded',
        message: textBlock(JSON.stringify({ items: [{ tier: 'high', text: 'a chest of storied relics' }] })),
      },
    },
    {
      custom_id: `treasure__low__v${PROMPT_VERSION}`,
      result: { type: 'errored', error: { type: 'api_error', message: 'boom' } },
    },
    {
      custom_id: `treasure__mid__v${PROMPT_VERSION}`,
      result: {
        type: 'succeeded',
        // Parsed object in the text block, not a JSON string — must be tolerated.
        message: textBlock({ items: [{ tier: 'mid', text: 'a satchel of mixed coin' }] }),
      },
    },
    {
      custom_id: `treasure__legendary__v${PROMPT_VERSION}`,
      result: { type: 'succeeded', message: textBlock('this is not json {') },
    },
  ];

  it('polls until ended, keys results by custom_id, and records failures without throwing', async () => {
    const outDir = tempOutDir();
    const statuses: string[] = [];
    const { client, retrieveCalls } = makeFakeClient(outOfOrderEntries, [
      'in_progress',
      'ended',
    ]);

    const summary = await runBatch(client, treasureRequests(), {
      pollIntervalMs: 0,
      outDir,
      onStatus: (s) => statuses.push(s),
    });

    // Polled across at least two distinct statuses.
    expect(retrieveCalls()).toBeGreaterThanOrEqual(2);
    expect(statuses).toEqual(['in_progress', 'ended']);

    expect(summary.batchId).toBe('batch_test_1');
    expect(summary.succeeded.sort()).toEqual(
      [`treasure__high__v${PROMPT_VERSION}`, `treasure__mid__v${PROMPT_VERSION}`].sort(),
    );
    expect(summary.errored).toEqual([`treasure__low__v${PROMPT_VERSION}`]);
    expect(summary.parseFailures).toEqual([`treasure__legendary__v${PROMPT_VERSION}`]);
  });

  it('writes the raw results file and per-kind candidate files with provenance', async () => {
    const outDir = tempOutDir();
    const { client } = makeFakeClient(outOfOrderEntries, ['ended']);

    const summary = await runBatch(client, treasureRequests(), {
      pollIntervalMs: 0,
      outDir,
    });

    const rawPath = join(outDir, 'raw-batch_test_1.json');
    const candidatesPath = join(outDir, 'candidates-treasure.json');
    expect(summary.writtenFiles).toContain(rawPath);
    expect(summary.writtenFiles).toContain(candidatesPath);
    expect(existsSync(rawPath)).toBe(true);
    expect(existsSync(candidatesPath)).toBe(true);

    const raw = JSON.parse(readFileSync(rawPath, 'utf-8'));
    expect(raw.batchId).toBe('batch_test_1');
    expect(raw.model).toBe(DEFAULT_MODEL);
    expect(raw.promptVersion).toBe(PROMPT_VERSION);
    expect(raw.results).toHaveLength(outOfOrderEntries.length);

    const candidates = JSON.parse(readFileSync(candidatesPath, 'utf-8'));
    expect(candidates.kind).toBe('treasure');
    expect(candidates.promptVersion).toBe(PROMPT_VERSION);
    expect(candidates.model).toBe(DEFAULT_MODEL);
    expect(candidates.batchId).toBe('batch_test_1');
    expect(candidates.categories).toHaveLength(2);
    const byId = new Map(
      candidates.categories.map((c: { custom_id: string }) => [c.custom_id, c]),
    );
    const high = byId.get(`treasure__high__v${PROMPT_VERSION}`) as {
      categoryKey: string;
      items: unknown[];
    };
    expect(high.categoryKey).toBe('high');
    expect(high.items).toEqual([{ tier: 'high', text: 'a chest of storied relics' }]);
  });

  it('throws when the batch never ends within the wait cap', async () => {
    const outDir = tempOutDir();
    const { client } = makeFakeClient([], ['in_progress']);
    await expect(
      runBatch(client, treasureRequests(), { pollIntervalMs: 0, outDir, maxWaitMs: 0 }),
    ).rejects.toThrow(/time/i);
  });
});

// ─── main (CLI shell) ────────────────────────────────────────────

describe('main', () => {
  it('--dry-run prints an estimate for all models and never constructs a client', async () => {
    const createClient = vi.fn(async () => {
      throw new Error('network path must not be reached');
    });
    const io = makeIo({ createClient });

    const code = await main(['--dry-run'], io);

    expect(code).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
    const output = io.logs.join('\n');
    expect(output.toLowerCase()).toContain('estimate');
    expect(output).toContain('claude-opus-4-8');
    expect(output).toContain('claude-sonnet-4-6');
    expect(output).toContain('claude-sonnet-5');
    expect(output).toContain('claude-haiku-4-5');
  });

  it('exits non-zero with a message on an invalid --model', async () => {
    const io = makeIo();
    const code = await main(['--model', 'gpt-4o'], io);
    expect(code).not.toBe(0);
    expect(io.errors.join('\n')).toMatch(/model/i);
  });

  it('--local rewrites candidate files from a saved raw file without a client', async () => {
    const outDir = tempOutDir();
    const rawFile = join(outDir, 'raw-batch_prior.json');
    writeFileSync(
      rawFile,
      JSON.stringify({
        batchId: 'batch_prior',
        model: 'claude-haiku-4-5',
        promptVersion: PROMPT_VERSION,
        results: [
          {
            custom_id: `name-prefix__all__v${PROMPT_VERSION}`,
            result: {
              type: 'succeeded',
              message: {
                content: [
                  { type: 'text', text: JSON.stringify({ items: [{ text: 'Vigil' }] }) },
                ],
              },
            },
          },
        ],
      }),
      'utf-8',
    );

    const createClient = vi.fn(async () => {
      throw new Error('network path must not be reached');
    });
    const io = makeIo({ createClient });

    const code = await main(['--local', rawFile, '--out', outDir], io);

    expect(code).toBe(0);
    expect(createClient).not.toHaveBeenCalled();
    const candidatesPath = join(outDir, 'candidates-name-prefix.json');
    expect(existsSync(candidatesPath)).toBe(true);
    const candidates = JSON.parse(readFileSync(candidatesPath, 'utf-8'));
    expect(candidates.kind).toBe('name-prefix');
    expect(candidates.model).toBe('claude-haiku-4-5');
    expect(candidates.batchId).toBe('batch_prior');
    expect(candidates.categories).toEqual([
      {
        custom_id: `name-prefix__all__v${PROMPT_VERSION}`,
        categoryKey: 'all',
        items: [{ text: 'Vigil' }],
      },
    ]);
  });
});
