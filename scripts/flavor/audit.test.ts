// Tests for the flavor audit CLI — issue #88 Task E.
// Written FIRST (TDD): these must fail with a module-resolution error
// until scripts/flavor/audit.ts exists.
//
// The CLI is a thin shell over scripts/flavor/audit-checks.ts
// (runAuditChecks). Two modes:
// - candidate mode: read every candidates-<kind>.json in an out dir
//   (default scripts/flavor/out/) and audit the items; missing dir or
//   no candidate files is a LOUD failure (auditing nothing by accident
//   must never pass).
// - --check mode (the CI gate): audit the committed generated data
//   files named in spec §6.1 (src/data/encounter-flavor.ts,
//   src/data/noncombat-flavor-gen.ts, src/data/monster-tactics.json);
//   absent files report "not present" and pass, present files must be
//   clean. Never reads scripts/flavor/out/, never touches the network.
//
// The logic lives in exported functions returning
// { ok, report, summaryText }; the bin section only maps that to exit
// codes — so the tests exercise the functions, never process.exit.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { POOL_KINDS, type PoolKind } from './prompt-spec';
import { runLocal } from './generate-flavor';
import {
  DEFAULT_CANDIDATE_DIR,
  DEFAULT_COMMITTED_PATHS,
  mainAudit,
  parseAuditArgs,
  runCandidateAudit,
  runCheckAudit,
  type AuditRunResult,
} from './audit';

// ─── Temp-dir helpers ────────────────────────────────────────────

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'flavor-audit-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * Write a candidates-<kind>.json in the EXACT shape writeCandidateFiles
 * in scripts/flavor/generate-flavor.ts produces (kind, promptVersion,
 * model, batchId, categories[{ custom_id, categoryKey, items }]).
 */
function writeCandidateFile(dir: string, kind: string, items: unknown[]): void {
  writeFileSync(
    join(dir, `candidates-${kind}.json`),
    JSON.stringify(
      {
        kind,
        promptVersion: 2,
        model: 'claude-test',
        batchId: 'batch_test',
        categories: [{ custom_id: `${kind}__cat__v2`, categoryKey: 'cat', items }],
      },
      null,
      2,
    ),
    'utf-8',
  );
}

/** One clean, check-passing item per kind. */
const CLEAN_ITEMS: Record<PoolKind, unknown> = {
  'scenario-hook': { text: 'A dying horn call heralds {monsters} closing through the {environment}.' },
  'tactics-type': { creatureType: 'Beast', text: 'The pack circles the wounded first, then closes in together.' },
  treasure: { tier: 'low', text: 'a battered trinket buried in loose coin' },
  'name-prefix': { text: 'Last Stand' },
  'theme-entry': { themeId: 'ancient-tomb', field: 'phrases', text: 'THE THIRD GATE HIDES THE TRUE PATH' },
  persona: { pool: 'WANTS', text: 'safe passage for a wagon that must not be inspected' },
  'scenario-beat': { pool: 'SIDE_EVENTS', text: "The academy's arch shelters a rival sketching every move." },
};

function expectFailure(result: AuditRunResult, kind: PoolKind, check: string): void {
  expect(
    result.report.failures.some((f) => f.kind === kind && f.check === check),
    `expected a ${check} failure for ${kind}; got ${JSON.stringify(result.report.failures)}`,
  ).toBe(true);
}

// ─── parseAuditArgs ──────────────────────────────────────────────

describe('parseAuditArgs', () => {
  it('defaults to candidate mode over the standard out dir', () => {
    expect(parseAuditArgs([])).toEqual({
      check: false,
      outDir: join('scripts', 'flavor', 'out'),
    });
    expect(DEFAULT_CANDIDATE_DIR).toBe(join('scripts', 'flavor', 'out'));
  });

  it('parses --check', () => {
    expect(parseAuditArgs(['--check']).check).toBe(true);
  });

  it('parses --out with a value', () => {
    expect(parseAuditArgs(['--out', 'somewhere']).outDir).toBe('somewhere');
  });

  it('rejects --out without a value', () => {
    expect(() => parseAuditArgs(['--out'])).toThrow(/--out requires a value/);
  });

  it('rejects combining --check with --out (--check never reads an out dir)', () => {
    expect(() => parseAuditArgs(['--check', '--out', 'somewhere'])).toThrow(/--out/);
  });

  it('rejects unknown flags with usage text', () => {
    expect(() => parseAuditArgs(['--bogus'])).toThrow(/Unknown flag '--bogus'/);
  });
});

// ─── Candidate mode ──────────────────────────────────────────────

describe('runCandidateAudit', () => {
  it('passes a dir of clean fixtures for every kind, counting items', () => {
    const dir = makeTempDir();
    for (const kind of POOL_KINDS) writeCandidateFile(dir, kind, [CLEAN_ITEMS[kind]]);
    const result = runCandidateAudit(dir);
    expect(result.ok).toBe(true);
    expect(result.report.failures).toEqual([]);
    expect(result.report.itemsChecked).toBe(POOL_KINDS.length);
    expect(result.summaryText).toContain(`${POOL_KINDS.length} items checked`);
    expect(result.summaryText).toContain('0 failures');
  });

  it('accepts the exact file shape generate-flavor writes (pinned via runLocal round-trip)', () => {
    const dir = makeTempDir();
    const rawPath = join(dir, 'raw-batch_test.json');
    const message = (items: unknown[]) => ({
      content: [{ type: 'text', text: JSON.stringify({ items }) }],
    });
    writeFileSync(
      rawPath,
      JSON.stringify({
        batchId: 'batch_test',
        model: 'claude-test',
        results: [
          {
            custom_id: 'treasure__low__v2',
            result: { type: 'succeeded', message: message([CLEAN_ITEMS.treasure]) },
          },
          {
            custom_id: 'name-prefix__base__v2',
            result: { type: 'succeeded', message: message([CLEAN_ITEMS['name-prefix']]) },
          },
        ],
      }),
      'utf-8',
    );
    const outDir = join(dir, 'out');
    runLocal(rawPath, outDir, () => {});
    const result = runCandidateAudit(outDir);
    expect(result.ok).toBe(true);
    expect(result.report.itemsChecked).toBe(2);
  });

  it('surfaces at least one failure from EVERY audit check, with the right check name', () => {
    const dir = makeTempDir();
    // schema: missing required text
    writeCandidateFile(dir, 'treasure', [{ tier: 'low' }]);
    // uniqueness (duplicate) + length (too long for name-prefix)
    writeCandidateFile(dir, 'name-prefix', [
      { text: 'Last Stand' },
      { text: 'Last Stand' },
      { text: 'An Extremely Long Prefix Name Indeed' },
    ]);
    // slot-tokens: {environment} missing
    writeCandidateFile(dir, 'scenario-hook', [
      { text: 'A dying scout warns the party of {monsters} ahead near the old bridge.' },
    ]);
    // mechanics: attack bonus leak
    writeCandidateFile(dir, 'tactics-type', [
      { creatureType: 'Beast', text: 'The pack strikes low, plus 4 to hit against the slowest target.' },
    ]);
    // phrases-cipher: lowercase plaintext
    writeCandidateFile(dir, 'theme-entry', [
      { themeId: 'ancient-tomb', field: 'phrases', text: 'the third gate hides the true path' },
    ]);
    // banned-noun: Product Identity monster
    writeCandidateFile(dir, 'persona', [
      { pool: 'SECRETS', text: 'they once served the beholder cult of a drowned city' },
    ]);

    const result = runCandidateAudit(dir);
    expect(result.ok).toBe(false);
    expectFailure(result, 'treasure', 'schema');
    expectFailure(result, 'name-prefix', 'uniqueness');
    expectFailure(result, 'name-prefix', 'length');
    expectFailure(result, 'scenario-hook', 'slot-tokens');
    expectFailure(result, 'tactics-type', 'mechanics');
    expectFailure(result, 'theme-entry', 'phrases-cipher');
    expectFailure(result, 'persona', 'banned-noun');
    // The grouped report names checks and shows a text excerpt.
    expect(result.summaryText).toContain('banned-noun');
    expect(result.summaryText).toContain('beholder cult');
  });

  it('fails LOUDLY on a missing out dir', () => {
    const result = runCandidateAudit(join(makeTempDir(), 'does-not-exist'));
    expect(result.ok).toBe(false);
    expect(result.report.itemsChecked).toBe(0);
    expect(result.summaryText).toMatch(/no candidates-<kind>\.json files/i);
    expect(result.summaryText).toContain('does-not-exist');
  });

  it('fails LOUDLY on a dir with no candidate files', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'raw-batch_x.json'), '{}', 'utf-8');
    const result = runCandidateAudit(dir);
    expect(result.ok).toBe(false);
    expect(result.summaryText).toMatch(/no candidates-<kind>\.json files/i);
  });

  it('fails on a candidate file that is not valid JSON, naming the file', () => {
    const dir = makeTempDir();
    writeCandidateFile(dir, 'treasure', [CLEAN_ITEMS.treasure]);
    writeFileSync(join(dir, 'candidates-persona.json'), 'not json {', 'utf-8');
    const result = runCandidateAudit(dir);
    expect(result.ok).toBe(false);
    expect(result.summaryText).toContain('candidates-persona.json');
  });

  it('fails on a candidate file for an unknown pool kind', () => {
    const dir = makeTempDir();
    writeCandidateFile(dir, 'mystery-kind', [{ text: 'anything' }]);
    const result = runCandidateAudit(dir);
    expect(result.ok).toBe(false);
    expect(result.summaryText).toContain('mystery-kind');
  });
});

// ─── --check mode (committed generated data) ─────────────────────

describe('runCheckAudit', () => {
  it('pins the default committed paths to the spec §6.1 file names', () => {
    expect(DEFAULT_COMMITTED_PATHS).toEqual({
      encounterFlavor: join('src', 'data', 'encounter-flavor.ts'),
      noncombatFlavorGen: join('src', 'data', 'noncombat-flavor-gen.ts'),
      monsterTactics: join('src', 'data', 'monster-tactics.json'),
    });
  });

  it('passes with an explicit summary when none of the three files exist yet', async () => {
    const dir = makeTempDir();
    const paths = {
      encounterFlavor: join(dir, 'encounter-flavor.ts'),
      noncombatFlavorGen: join(dir, 'noncombat-flavor-gen.ts'),
      monsterTactics: join(dir, 'monster-tactics.json'),
    };
    const result = await runCheckAudit(paths);
    expect(result.ok).toBe(true);
    expect(result.report.itemsChecked).toBe(0);
    expect(result.report.failures).toEqual([]);
    const notPresent = result.summaryText.match(/not present \(not yet generated\)/g) ?? [];
    expect(notPresent).toHaveLength(3);
    for (const path of Object.values(paths)) {
      expect(result.summaryText).toContain(path);
    }
  });

  it('fails when monster-tactics.json contains a violation, labeling the monster id', async () => {
    const dir = makeTempDir();
    const tacticsPath = join(dir, 'monster-tactics.json');
    writeFileSync(
      tacticsPath,
      JSON.stringify({
        'goblin-01': {
          creatureType: 'Humanoid',
          text: 'Goblins scatter into the brush when the dc 15 horn sounds.',
        },
      }),
      'utf-8',
    );
    const result = await runCheckAudit({
      encounterFlavor: join(dir, 'encounter-flavor.ts'),
      noncombatFlavorGen: join(dir, 'noncombat-flavor-gen.ts'),
      monsterTactics: tacticsPath,
    });
    expect(result.ok).toBe(false);
    expectFailure(result, 'tactics-type', 'mechanics');
    expect(result.summaryText).toContain('goblin-01');
  });

  it('audits a present encounter-flavor module and flags a banned noun', async () => {
    const dir = makeTempDir();
    const modulePath = join(dir, 'encounter-flavor.ts');
    writeFileSync(
      modulePath,
      [
        'export const ENCOUNTER_FLAVOR_GEN = {',
        "  meta: { promptVersion: 2, model: 'claude-test', generatedAt: '2026-07-19' },",
        "  pools: { 'name-prefix': [{ text: 'Waterdeep Raid' }] },",
        '};',
        '',
      ].join('\n'),
      'utf-8',
    );
    const result = await runCheckAudit({
      encounterFlavor: modulePath,
      noncombatFlavorGen: join(dir, 'noncombat-flavor-gen.ts'),
      monsterTactics: join(dir, 'monster-tactics.json'),
    });
    expect(result.ok).toBe(false);
    expectFailure(result, 'name-prefix', 'banned-noun');
  });

  it('passes a mix of clean present files and absent files', async () => {
    const dir = makeTempDir();
    const modulePath = join(dir, 'encounter-flavor.ts');
    writeFileSync(
      modulePath,
      [
        'export const ENCOUNTER_FLAVOR_GEN = {',
        "  meta: { promptVersion: 2, model: 'claude-test', generatedAt: '2026-07-19' },",
        "  pools: { 'name-prefix': [{ text: 'Last Stand' }] },",
        '};',
        '',
      ].join('\n'),
      'utf-8',
    );
    const tacticsPath = join(dir, 'monster-tactics.json');
    writeFileSync(
      tacticsPath,
      JSON.stringify({
        'wolf-01': {
          creatureType: 'Beast',
          text: 'The pack circles the wounded first, then closes in together.',
        },
      }),
      'utf-8',
    );
    const result = await runCheckAudit({
      encounterFlavor: modulePath,
      noncombatFlavorGen: join(dir, 'noncombat-flavor-gen.ts'),
      monsterTactics: tacticsPath,
    });
    expect(result.ok).toBe(true);
    expect(result.report.itemsChecked).toBe(2);
    const notPresent = result.summaryText.match(/not present \(not yet generated\)/g) ?? [];
    expect(notPresent).toHaveLength(1);
  });

  it('fails on a monster-tactics file that is not an object of entries', async () => {
    const dir = makeTempDir();
    const tacticsPath = join(dir, 'monster-tactics.json');
    writeFileSync(tacticsPath, JSON.stringify(['not', 'a', 'record']), 'utf-8');
    const result = await runCheckAudit({
      encounterFlavor: join(dir, 'encounter-flavor.ts'),
      noncombatFlavorGen: join(dir, 'noncombat-flavor-gen.ts'),
      monsterTactics: tacticsPath,
    });
    expect(result.ok).toBe(false);
    expect(result.summaryText).toContain('monster-tactics.json');
  });
});

// ─── mainAudit exit-code mapping ─────────────────────────────────

describe('mainAudit', () => {
  function captureIo(): { io: { log: (l: string) => void; error: (l: string) => void }; logs: string[]; errors: string[] } {
    const logs: string[] = [];
    const errors: string[] = [];
    return {
      io: { log: (l: string) => logs.push(l), error: (l: string) => errors.push(l) },
      logs,
      errors,
    };
  }

  it('returns 1 and reports to stderr for an empty out dir', async () => {
    const { io, errors } = captureIo();
    const code = await mainAudit(['--out', makeTempDir()], io);
    expect(code).toBe(1);
    expect(errors.join('\n')).toMatch(/no candidates-<kind>\.json files/i);
  });

  it('returns 0 and reports to stdout for a clean out dir', async () => {
    const dir = makeTempDir();
    writeCandidateFile(dir, 'treasure', [CLEAN_ITEMS.treasure]);
    const { io, logs } = captureIo();
    const code = await mainAudit(['--out', dir], io);
    expect(code).toBe(0);
    expect(logs.join('\n')).toContain('0 failures');
  });

  it('returns 1 on a usage error', async () => {
    const { io, errors } = captureIo();
    const code = await mainAudit(['--bogus'], io);
    expect(code).toBe(1);
    expect(errors.join('\n')).toContain('--bogus');
  });
});
