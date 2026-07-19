// ─── Flavor Generation CLI (implementation) ──────────────────────
// Issue #87 Task C. The CLI shell over scripts/flavor/build-requests.ts:
// arg parsing, the injectable Batches live path (runBatch), the no-network
// --dry-run and --local paths, and output-file writing. The tsx entry
// point is scripts/generate-flavor.ts; this module holds everything
// testable so tests never touch the network (constraint 3).
//
// Output goes to scripts/flavor/out/ (git-ignored via scripts/flavor/
// .gitignore-covered root entry): raw-<batchId>.json plus one
// candidates-<kind>.json per pool kind with succeeded results.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POOL_KINDS, PROMPT_VERSION, type PoolKind } from './prompt-spec';
import {
  ALLOWED_MODELS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MODEL,
  buildBatchRequests,
  clampBatchSize,
  estimateAllModels,
  estimateRun,
  type AllowedModel,
  type BatchRequest,
} from './build-requests';

// ─── CLI options ─────────────────────────────────────────────────

/** Thrown for user-facing argument errors; main() turns it into exit 1. */
export class UsageError extends Error {}

export interface CliOptions {
  pools: PoolKind[];
  model: AllowedModel;
  batchSize: number;
  dryRun: boolean;
  localFile: string | null;
  outDir: string;
}

const DEFAULT_OUT_DIR = join('scripts', 'flavor', 'out');

function isPoolKind(value: string): value is PoolKind {
  return (POOL_KINDS as readonly string[]).includes(value);
}

function isAllowedModel(value: string): value is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(value);
}

/** Parse process.argv-style flags; throws UsageError on anything invalid. */
export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    pools: [...POOL_KINDS],
    model: DEFAULT_MODEL,
    batchSize: DEFAULT_BATCH_SIZE,
    dryRun: false,
    localFile: null,
    outDir: DEFAULT_OUT_DIR,
  };

  const takeValue = (flag: string, value: string | undefined): string => {
    if (value === undefined || value.startsWith('--')) {
      throw new UsageError(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--pools': {
        const raw = takeValue(flag, argv[++i]);
        const pools = raw.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
        if (pools.length === 0) {
          throw new UsageError(
            `--pools requires at least one pool — valid pools: ${POOL_KINDS.join(', ')}`,
          );
        }
        for (const pool of pools) {
          if (!isPoolKind(pool)) {
            throw new UsageError(
              `Unknown pool '${pool}' — valid pools: ${POOL_KINDS.join(', ')}`,
            );
          }
        }
        // Dedupe (first occurrence wins) so repeated entries cannot
        // double-print dry-run lines or mislead pool iteration.
        options.pools = [...new Set(pools)] as PoolKind[];
        break;
      }
      case '--model': {
        const model = takeValue(flag, argv[++i]);
        if (!isAllowedModel(model)) {
          throw new UsageError(
            `Unknown model '${model}' — allowed models: ${ALLOWED_MODELS.join(', ')}. ` +
              'Model IDs are exact; never date-suffixed.',
          );
        }
        options.model = model;
        break;
      }
      case '--batch-size': {
        const raw = takeValue(flag, argv[++i]);
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          throw new UsageError(`--batch-size expects a number, got '${raw}'`);
        }
        options.batchSize = clampBatchSize(n);
        break;
      }
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--local':
        options.localFile = takeValue(flag, argv[++i]);
        break;
      case '--out':
        options.outDir = takeValue(flag, argv[++i]);
        break;
      default:
        throw new UsageError(
          `Unknown flag '${flag}'. Usage: generate-flavor [--pools a,b] [--model id] ` +
            '[--batch-size n] [--dry-run] [--local raw.json] [--out dir]',
        );
    }
  }

  return options;
}

// ─── Injectable client surface (structural — no SDK types) ───────

export interface BatchLike {
  id: string;
  processing_status: string;
}

export interface BatchResultLike {
  custom_id: string;
  result?: {
    type?: string;
    message?: unknown;
    error?: unknown;
  };
}

/**
 * The three Batches methods runBatch uses, typed structurally so tests
 * pass a plain fake and the CLI casts a real Anthropic client to it.
 */
export interface BatchClientLike {
  messages: {
    batches: {
      create(body: { requests: BatchRequest[] }): Promise<BatchLike>;
      retrieve(id: string): Promise<BatchLike>;
      results(id: string): Promise<AsyncIterable<BatchResultLike>>;
    };
  };
}

// ─── Result collection (shared by live + --local paths) ──────────

interface CollectedResults {
  succeeded: Map<string, unknown[]>; // custom_id → items
  errored: string[];
  parseFailures: string[];
}

/**
 * Pull the { items: [...] } payload out of a succeeded result message.
 * Tolerates the structured output arriving as a JSON string in a text
 * block OR as an already-parsed object; returns null when nothing
 * usable is found (recorded as a parse failure, never a crash).
 */
function extractItems(message: unknown): unknown[] | null {
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  const candidates: unknown[] = [];
  if (typeof content === 'string' || (typeof content === 'object' && content !== null && !Array.isArray(content))) {
    candidates.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as { type?: unknown; text?: unknown };
      if (b.type === 'text' && b.text !== undefined) candidates.push(b.text);
    }
  }
  for (let value of candidates) {
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        continue;
      }
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      Array.isArray((value as { items?: unknown }).items)
    ) {
      return (value as { items: unknown[] }).items;
    }
  }
  return null;
}

/** Key every result by custom_id (arrival order is meaningless) and classify it. */
function collectResults(entries: BatchResultLike[]): CollectedResults {
  const succeeded = new Map<string, unknown[]>();
  const errored: string[] = [];
  const parseFailures: string[] = [];
  for (const entry of entries) {
    const customId = entry.custom_id;
    if (entry.result?.type === 'succeeded') {
      const items = extractItems(entry.result.message);
      if (items) succeeded.set(customId, items);
      else parseFailures.push(customId);
    } else {
      // errored, expired, canceled, or malformed envelope — recorded, not thrown.
      errored.push(customId);
    }
  }
  return { succeeded, errored, parseFailures };
}

// ─── Output files ────────────────────────────────────────────────

interface Provenance {
  batchId: string;
  model: string;
}

/** Group succeeded results by kind and write candidates-<kind>.json files. */
function writeCandidateFiles(
  outDir: string,
  collected: CollectedResults,
  provenance: Provenance,
): string[] {
  mkdirSync(outDir, { recursive: true });
  const byKind = new Map<string, { custom_id: string; categoryKey: string; items: unknown[] }[]>();
  for (const [customId, items] of collected.succeeded) {
    // custom_id format: kind__categoryKey__vN (see buildBatchRequests —
    // ':' is outside the Batches custom_id charset).
    const [kind, categoryKey] = customId.split('__');
    const list = byKind.get(kind) ?? [];
    list.push({ custom_id: customId, categoryKey, items });
    byKind.set(kind, list);
  }
  const written: string[] = [];
  for (const [kind, categories] of byKind) {
    const path = join(outDir, `candidates-${kind}.json`);
    writeFileSync(
      path,
      JSON.stringify(
        {
          kind,
          promptVersion: PROMPT_VERSION,
          model: provenance.model,
          batchId: provenance.batchId,
          categories,
        },
        null,
        2,
      ),
      'utf-8',
    );
    written.push(path);
  }
  return written;
}

// ─── Live path (thin, injectable) ────────────────────────────────

export interface RunBatchOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onStatus?: (status: string) => void;
  outDir: string;
}

export interface RunBatchSummary {
  batchId: string;
  succeeded: string[];
  errored: string[];
  parseFailures: string[];
  writtenFiles: string[];
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_WAIT_MS = 2 * 60 * 60 * 1000; // ~2h hard cap

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create the batch, poll retrieve() until processing_status === 'ended'
 * (interval injectable; hard cap ~2h), then iterate the results stream
 * keyed by custom_id in ANY order. Failures are recorded per custom_id,
 * never thrown. Writes raw-<batchId>.json and candidates-<kind>.json.
 */
export async function runBatch(
  client: BatchClientLike,
  requests: BatchRequest[],
  options: RunBatchOptions,
): Promise<RunBatchSummary> {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  const created = await client.messages.batches.create({ requests });
  const batchId = created.id;

  const deadline = Date.now() + maxWaitMs;
  // Poll at least once so onStatus always reflects retrieve()'s view.
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    options.onStatus?.(batch.processing_status);
    if (batch.processing_status === 'ended') break;
    if (Date.now() >= deadline) {
      throw new Error(
        `Batch ${batchId} did not end within the ${maxWaitMs}ms wait cap (timed out; ` +
          're-run later with --local once it completes)',
      );
    }
    await sleep(pollIntervalMs);
  }

  const entries: BatchResultLike[] = [];
  const results = await client.messages.batches.results(batchId);
  for await (const entry of results) entries.push(entry);

  const collected = collectResults(entries);
  const model = requests[0]?.params.model ?? 'unknown';

  mkdirSync(options.outDir, { recursive: true });
  const rawPath = join(options.outDir, `raw-${batchId}.json`);
  writeFileSync(
    rawPath,
    JSON.stringify(
      { batchId, model, promptVersion: PROMPT_VERSION, results: entries },
      null,
      2,
    ),
    'utf-8',
  );

  const candidateFiles = writeCandidateFiles(options.outDir, collected, { batchId, model });

  return {
    batchId,
    succeeded: [...collected.succeeded.keys()],
    errored: collected.errored,
    parseFailures: collected.parseFailures,
    writtenFiles: [rawPath, ...candidateFiles],
  };
}

// ─── No-network paths ────────────────────────────────────────────

export interface CliIo {
  log: (line: string) => void;
  error: (line: string) => void;
  /** Constructed ONLY on the live path — dry-run and --local never call it. */
  createClient: () => Promise<BatchClientLike>;
}

/**
 * Print the request plan and token/cost estimate. Pure output — takes
 * no client and performs no writes (the module seam the tests assert).
 */
export function runDryRun(options: CliOptions, log: (line: string) => void): void {
  const requests = buildBatchRequests(options);
  log(`Dry run — ${requests.length} batch requests, ${options.batchSize} items each.`);
  for (const kind of options.pools) {
    const forKind = requests.filter((r) => r.custom_id.startsWith(`${kind}__`));
    const keys = forKind.map((r) => r.custom_id.split('__')[1]);
    log(`  ${kind}: ${forKind.length} categories (${keys.join(', ')})`);
  }
  const chosen = estimateRun(requests, options.model);
  log(
    `Estimate for ${options.model} (chars/4 input heuristic — an estimate, not a count): ` +
      `~${chosen.estInputTokens} input tokens, ~${chosen.estOutputTokens} output tokens, ` +
      `~$${chosen.estCostUsd.toFixed(2)} at batch-discounted prices.`,
  );
  log('Per-model comparison (same requests):');
  for (const row of estimateAllModels(requests)) {
    log(
      `  ${row.model.padEnd(18)} ~$${row.estCostUsd.toFixed(2)} ` +
        `(in ~${row.estInputTokens} tok, out ~${row.estOutputTokens} tok)`,
    );
  }
  log('No network calls made, nothing written.');
}

/**
 * Re-parse a previously saved raw results file (from a prior live run)
 * and rewrite the candidate files. No network.
 */
export function runLocal(localFile: string, outDir: string, log: (line: string) => void): void {
  const raw = JSON.parse(readFileSync(localFile, 'utf-8')) as {
    batchId?: unknown;
    model?: unknown;
    results?: unknown;
  };
  if (!Array.isArray(raw.results)) {
    throw new UsageError(
      `--local file ${localFile} is not a raw results file (missing 'results' array)`,
    );
  }
  const batchId = typeof raw.batchId === 'string' ? raw.batchId : 'local';
  const model = typeof raw.model === 'string' ? raw.model : 'unknown';
  const collected = collectResults(raw.results as BatchResultLike[]);
  const written = writeCandidateFiles(outDir, collected, { batchId, model });
  log(
    `Parsed ${localFile}: ${collected.succeeded.size} succeeded, ` +
      `${collected.errored.length} errored, ${collected.parseFailures.length} parse failures.`,
  );
  for (const path of written) log(`  wrote ${path}`);
}

// ─── Entry ───────────────────────────────────────────────────────

const defaultIo: CliIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  createClient: async () => {
    // Lazy dynamic import: the SDK is only loaded on the live path, and
    // reads ANTHROPIC_API_KEY from the environment via its default chain.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic() as unknown as BatchClientLike;
  },
};

/** CLI driver; returns the process exit code instead of exiting. */
export async function main(argv: string[], io: CliIo = defaultIo): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      io.error(err.message);
      return 1;
    }
    throw err;
  }

  if (options.dryRun) {
    runDryRun(options, io.log);
    return 0;
  }

  if (options.localFile !== null) {
    try {
      runLocal(options.localFile, options.outDir, io.log);
    } catch (err) {
      io.error(err instanceof Error ? err.message : String(err));
      return 1;
    }
    return 0;
  }

  // Live path — the only branch that constructs a client.
  const requests = buildBatchRequests(options);
  const estimate = estimateRun(requests, options.model);
  io.log(
    `Submitting ${requests.length} requests (${options.model}, ${options.batchSize} items ` +
      `each, ~$${estimate.estCostUsd.toFixed(2)} estimated at batch prices)...`,
  );
  const client = await io.createClient();
  const summary = await runBatch(client, requests, {
    outDir: options.outDir,
    onStatus: (status) => io.log(`  batch status: ${status}`),
  });
  io.log(
    `Batch ${summary.batchId} done: ${summary.succeeded.length} succeeded, ` +
      `${summary.errored.length} errored, ${summary.parseFailures.length} parse failures.`,
  );
  for (const customId of summary.errored) io.log(`  errored: ${customId}`);
  for (const customId of summary.parseFailures) io.log(`  parse failure: ${customId}`);
  for (const path of summary.writtenFiles) io.log(`  wrote ${path}`);
  return summary.succeeded.length > 0 ? 0 : 1;
}
