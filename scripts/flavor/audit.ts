// ─── Flavor Audit CLI ────────────────────────────────────────────
// Issue #88 Task E, Phase 1 of docs/superpowers/specs/2026-07-18-
// llm-generators-design.md (spec §6.2 layers 1–2). Thin shell over the
// pure check library in scripts/flavor/audit-checks.ts — all judgment
// lives there; this file only loads content, formats the report, and
// maps { ok } to exit codes.
//
//   npx tsx scripts/flavor/audit.ts                # candidate audit (scripts/flavor/out/)
//   npx tsx scripts/flavor/audit.ts --out somedir  # candidate audit elsewhere
//   npm run flavor:check                           # CI gate on committed generated data
//
// Candidate mode reads every candidates-<kind>.json written by
// scripts/generate-flavor.ts; a missing dir or zero candidate files is
// a LOUD failure — auditing nothing by accident must never pass.
// --check mode audits ONLY the committed generated data files named in
// spec §6.1; it never reads scripts/flavor/out/ and never touches the
// network. Absent committed files (they are not generated yet) are
// reported and skipped, so the CI step is green from day one.
//
// Licensing note (spec §6.2): these mechanical checks are necessary
// but NOT sufficient — human review remains the final gate.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { POOL_KINDS, type PoolKind } from './prompt-spec';
import { runAuditChecks, type AuditReport } from './audit-checks';

// ─── Shared result shape ─────────────────────────────────────────

export interface AuditRunResult {
  ok: boolean;
  report: AuditReport;
  summaryText: string;
}

/** Thrown for user-facing argument errors; mainAudit turns it into exit 1. */
export class AuditUsageError extends Error {}

// ─── CLI options ─────────────────────────────────────────────────

export const DEFAULT_CANDIDATE_DIR = join('scripts', 'flavor', 'out');

export interface AuditCliOptions {
  check: boolean;
  outDir: string;
}

/** Parse process.argv-style flags; throws AuditUsageError on anything invalid. */
export function parseAuditArgs(argv: string[]): AuditCliOptions {
  const options: AuditCliOptions = { check: false, outDir: DEFAULT_CANDIDATE_DIR };
  let sawOut = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--check':
        options.check = true;
        break;
      case '--out': {
        const value = argv[++i];
        if (value === undefined || value.startsWith('--')) {
          throw new AuditUsageError('--out requires a value');
        }
        options.outDir = value;
        sawOut = true;
        break;
      }
      default:
        throw new AuditUsageError(`Unknown flag '${flag}'. Usage: audit [--check | --out dir]`);
    }
  }
  if (options.check && sawOut) {
    throw new AuditUsageError('--out applies to candidate mode only; --check audits the committed data files');
  }
  return options;
}

// ─── Report formatting ───────────────────────────────────────────

/** Fixed check order for grouped output (mirrors runAuditChecks). */
const CHECK_ORDER = [
  'schema', 'uniqueness', 'length', 'slot-tokens', 'mechanics', 'phrases-cipher', 'banned-noun',
] as const;

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPoolKind(value: string): value is PoolKind {
  return (POOL_KINDS as readonly string[]).includes(value);
}

/** Short text excerpt for a report line. */
function excerptOf(item: unknown): string {
  const text = isRecord(item) && typeof item.text === 'string' ? item.text : JSON.stringify(item);
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

/**
 * Grouped failure lines: per kind (POOL_KINDS order) → per check
 * (CHECK_ORDER) → item index + detail + excerpt. `labels` optionally
 * names items (e.g. monster ids for monster-tactics.json).
 */
function formatFailures(
  report: AuditReport,
  itemsByKind: Partial<Record<PoolKind, unknown[]>>,
  labels?: Partial<Record<PoolKind, string[]>>,
): string[] {
  const lines: string[] = [];
  for (const kind of POOL_KINDS) {
    const kindFailures = report.failures.filter((f) => f.kind === kind);
    if (kindFailures.length === 0) continue;
    lines.push(`  ${kind}:`);
    const seenChecks = kindFailures.map((f) => f.check);
    const orderedChecks = [
      ...CHECK_ORDER.filter((c) => seenChecks.includes(c)),
      ...[...new Set(seenChecks)].filter((c) => !(CHECK_ORDER as readonly string[]).includes(c)),
    ];
    for (const check of orderedChecks) {
      lines.push(`    ${check}:`);
      for (const failure of kindFailures.filter((f) => f.check === check)) {
        const label = labels?.[kind]?.[failure.index];
        const which = label === undefined ? `${failure.index}` : `${failure.index} (${label})`;
        const item = itemsByKind[kind]?.[failure.index];
        lines.push(`      [item ${which}] ${failure.detail} — "${excerptOf(item)}"`);
      }
    }
  }
  return lines;
}

// ─── Candidate mode ──────────────────────────────────────────────

const CANDIDATE_FILE_RE = /^candidates-(.+)\.json$/;

const EMPTY_REPORT: AuditReport = { failures: [], itemsChecked: 0 };

/**
 * Parse one candidates-<kind>.json — the EXACT shape writeCandidateFiles
 * in scripts/flavor/generate-flavor.ts produces: { kind, promptVersion,
 * model, batchId, categories: [{ custom_id, categoryKey, items }] }.
 * Returns the flattened items or a problem string; never throws.
 */
function readCandidateFile(path: string, kindFromName: string): { items?: unknown[]; problem?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    return { problem: `${path}: not valid JSON (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!isRecord(parsed)) return { problem: `${path}: expected a top-level object` };
  if (parsed.kind !== kindFromName) {
    return { problem: `${path}: kind field ${JSON.stringify(parsed.kind)} does not match the file name` };
  }
  if (!Array.isArray(parsed.categories)) {
    return { problem: `${path}: expected a categories array` };
  }
  const items: unknown[] = [];
  for (const category of parsed.categories) {
    if (!isRecord(category) || !Array.isArray(category.items)) {
      return { problem: `${path}: every category must carry an items array` };
    }
    items.push(...category.items);
  }
  return { items };
}

/**
 * Audit every candidates-<kind>.json in `outDir` (pre-promotion gate).
 * Missing dir or zero candidate files → { ok: false } with a loud
 * message: silently auditing nothing must never look like a pass.
 */
export function runCandidateAudit(outDir: string = DEFAULT_CANDIDATE_DIR): AuditRunResult {
  const dir = resolve(outDir);
  const fileNames = existsSync(dir)
    ? readdirSync(dir).filter((name) => CANDIDATE_FILE_RE.test(name)).sort()
    : [];
  const lines: string[] = [`Flavor candidate audit — ${dir}`];

  if (fileNames.length === 0) {
    lines.push(
      'ERROR: no candidates-<kind>.json files found — refusing to pass an empty audit.',
      'Run `npm run generate:flavor` first, or point --out at the directory that holds them.',
    );
    return { ok: false, report: EMPTY_REPORT, summaryText: lines.join('\n') };
  }

  const problems: string[] = [];
  const candidates: Partial<Record<PoolKind, unknown[]>> = {};
  for (const name of fileNames) {
    const kind = CANDIDATE_FILE_RE.exec(name)![1];
    if (!isPoolKind(kind)) {
      problems.push(`${name}: unknown pool kind '${kind}' (valid: ${POOL_KINDS.join(', ')})`);
      continue;
    }
    const { items, problem } = readCandidateFile(join(dir, name), kind);
    if (problem !== undefined) {
      problems.push(problem);
      continue;
    }
    candidates[kind] = items;
    lines.push(`  ${name}: ${items!.length} item(s)`);
  }

  const report = runAuditChecks(candidates);
  if (problems.length > 0) {
    lines.push(`FILE PROBLEMS (${problems.length}):`, ...problems.map((p) => `  ${p}`));
  }
  if (report.failures.length > 0) {
    lines.push(`FAILURES (${report.failures.length}):`, ...formatFailures(report, candidates));
  }
  lines.push(
    `Summary: ${fileNames.length} candidate file(s), ${report.itemsChecked} items checked, ` +
      `${report.failures.length} failures, ${problems.length} file problems.`,
  );
  return {
    ok: problems.length === 0 && report.failures.length === 0,
    report,
    summaryText: lines.join('\n'),
  };
}

// ─── --check mode: committed generated data (spec §6.1) ──────────
//
// EXPECTED SHAPES — none of these files exist yet. Issues #90 (pool
// promotion) and #91 (monster tactics) MUST implement them against the
// interfaces below; keep additions to these shapes in sync with this
// section. Only what spec §6.1 names is modeled — nothing speculative.

/**
 * src/data/encounter-flavor.ts must export
 * `ENCOUNTER_FLAVOR_GEN: GeneratedFlavorPools` (combat pools, v2), and
 * src/data/noncombat-flavor-gen.ts must export
 * `NONCOMBAT_FLAVOR_GEN: GeneratedFlavorPools` (noncombat pool
 * additions). `pools` maps pool kind → promoted candidate items in the
 * same per-item shape the batch schemas describe; `meta` is the
 * provenance spec §6.1 names.
 */
export interface GeneratedFlavorPools {
  meta: { promptVersion: number; model: string; generatedAt: string };
  pools: Partial<Record<PoolKind, unknown[]>>;
}

/**
 * src/data/monster-tactics.json: per-monster grounded tactics keyed by
 * monster id. Each entry carries the monster's creature type so the
 * entry audits as a 'tactics-type' item (schema validates the type
 * against the engine enum). The deeper §6.1 grounding audit — every
 * named action/spell/movement mode exists in that monster's stat
 * block — is issue #91's, not this file's.
 */
export type MonsterTacticsFile = Record<string, { creatureType: string; text: string }>;

export interface CommittedDataPaths {
  encounterFlavor: string;
  noncombatFlavorGen: string;
  monsterTactics: string;
}

export const DEFAULT_COMMITTED_PATHS: CommittedDataPaths = {
  encounterFlavor: join('src', 'data', 'encounter-flavor.ts'),
  noncombatFlavorGen: join('src', 'data', 'noncombat-flavor-gen.ts'),
  monsterTactics: join('src', 'data', 'monster-tactics.json'),
};

interface CommittedSource {
  itemsByKind: Partial<Record<PoolKind, unknown[]>>;
  labels?: Partial<Record<PoolKind, string[]>>;
}

/** Import a generated-pools module and pull out its expected export. */
async function loadFlavorModule(path: string, exportName: string): Promise<{ source?: CommittedSource; problem?: string }> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(resolve(path)).href)) as Record<string, unknown>;
  } catch (err) {
    return { problem: `${path}: failed to import (${err instanceof Error ? err.message : String(err)})` };
  }
  const data = mod[exportName];
  if (!isRecord(data) || !isRecord(data.pools)) {
    return { problem: `${path}: expected export ${exportName} with a pools object (see GeneratedFlavorPools)` };
  }
  const itemsByKind: Partial<Record<PoolKind, unknown[]>> = {};
  for (const [kind, items] of Object.entries(data.pools)) {
    if (!isPoolKind(kind)) return { problem: `${path}: pools has unknown pool kind '${kind}'` };
    if (!Array.isArray(items)) return { problem: `${path}: pools.${kind} must be an array` };
    itemsByKind[kind] = items;
  }
  return { source: { itemsByKind } };
}

/** Parse monster-tactics.json into auditable 'tactics-type' items. */
function loadMonsterTactics(path: string): { source?: CommittedSource; problem?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    return { problem: `${path}: not valid JSON (${err instanceof Error ? err.message : String(err)})` };
  }
  if (!isRecord(parsed)) {
    return { problem: `${path}: expected an object keyed by monster id (see MonsterTacticsFile)` };
  }
  const monsterIds = Object.keys(parsed);
  return {
    source: {
      itemsByKind: { 'tactics-type': Object.values(parsed) },
      labels: { 'tactics-type': monsterIds },
    },
  };
}

/**
 * The CI gate: audit the committed generated data files. Absent files
 * are reported as "not present (not yet generated)" and skipped —
 * before #90/#91 land, every run is an explicit-summary pass. Present
 * files run through the same runAuditChecks as candidate mode. Reads
 * ONLY the three committed paths; never scripts/flavor/out/, never the
 * network.
 */
export async function runCheckAudit(
  paths: CommittedDataPaths = DEFAULT_COMMITTED_PATHS,
): Promise<AuditRunResult> {
  const files: { path: string; load: () => Promise<{ source?: CommittedSource; problem?: string }> }[] = [
    { path: paths.encounterFlavor, load: () => loadFlavorModule(paths.encounterFlavor, 'ENCOUNTER_FLAVOR_GEN') },
    { path: paths.noncombatFlavorGen, load: () => loadFlavorModule(paths.noncombatFlavorGen, 'NONCOMBAT_FLAVOR_GEN') },
    { path: paths.monsterTactics, load: async () => loadMonsterTactics(paths.monsterTactics) },
  ];

  const lines: string[] = ['Flavor audit --check (committed generated data)'];
  const problems: string[] = [];
  const merged: AuditReport = { failures: [], itemsChecked: 0 };
  let presentCount = 0;

  for (const file of files) {
    if (!existsSync(file.path)) {
      lines.push(`  ${file.path}: not present (not yet generated)`);
      continue;
    }
    presentCount += 1;
    const { source, problem } = await file.load();
    if (problem !== undefined) {
      problems.push(problem);
      lines.push(`  ${file.path}: UNREADABLE`);
      continue;
    }
    const report = runAuditChecks(source!.itemsByKind);
    merged.failures.push(...report.failures);
    merged.itemsChecked += report.itemsChecked;
    lines.push(`  ${file.path}: ${report.itemsChecked} item(s), ${report.failures.length} failure(s)`);
    if (report.failures.length > 0) {
      lines.push(...formatFailures(report, source!.itemsByKind, source!.labels));
    }
  }

  if (problems.length > 0) {
    lines.push(`FILE PROBLEMS (${problems.length}):`, ...problems.map((p) => `  ${p}`));
  }
  lines.push(
    `Summary: ${presentCount} of ${files.length} generated data file(s) present, ` +
      `${merged.itemsChecked} items checked, ${merged.failures.length} failures, ` +
      `${problems.length} file problems.` +
      (presentCount === 0 ? ' Nothing to gate yet.' : ''),
  );
  return {
    ok: problems.length === 0 && merged.failures.length === 0,
    report: merged,
    summaryText: lines.join('\n'),
  };
}

// ─── Entry ───────────────────────────────────────────────────────

export interface AuditIo {
  log: (line: string) => void;
  error: (line: string) => void;
}

const defaultIo: AuditIo = {
  log: (line) => console.log(line),
  error: (line) => console.error(line),
};

/**
 * CLI driver; returns the process exit code instead of exiting (exit
 * discipline mirrors scripts/import-bestiary.ts: failures report to
 * stderr and exit 1, clean passes summarize and exit 0).
 */
export async function mainAudit(argv: string[], io: AuditIo = defaultIo): Promise<number> {
  let options: AuditCliOptions;
  try {
    options = parseAuditArgs(argv);
  } catch (err) {
    if (err instanceof AuditUsageError) {
      io.error(err.message);
      return 1;
    }
    throw err;
  }
  const result = options.check ? await runCheckAudit() : runCandidateAudit(options.outDir);
  if (result.ok) {
    io.log(result.summaryText);
    return 0;
  }
  io.error(result.summaryText);
  return 1;
}

// Run only when invoked directly (tsx scripts/flavor/audit.ts ...),
// never when imported by tests. Lowercased compare tolerates Windows
// drive-letter casing differences.
const invokedHref = process.argv[1] === undefined ? '' : pathToFileURL(resolve(process.argv[1])).href.toLowerCase();
if (invokedHref === import.meta.url.toLowerCase()) {
  mainAudit(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
