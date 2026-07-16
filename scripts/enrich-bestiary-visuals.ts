import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALL_MONSTERS } from '../src/data';
import { BESTIARY_META } from '../src/data/bestiary-meta';
import {
  MONSTER_ART_BIBLE,
  MONSTER_IMAGE_PROMPT_VERSION,
  MONSTER_VISUAL_SCHEMA_VERSION,
  createBatchManifest,
  createPendingVisualRecord,
  deriveSourceFacts,
  validateMonsterVisualCoverage,
  visualInputHash,
  type MonsterVisualDataset,
  type MonsterPhysicalDescriptionDataset,
  type MonsterVisualRecord,
} from '../src/lib/monster-visuals';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = path.join(projectRoot, 'src', 'data', 'monster-visuals.json');
const manifestPath = path.join(projectRoot, 'src', 'data', 'monster-visual-batches.json');
const descriptionIndexPath = path.join(projectRoot, 'src', 'data', 'monster-physical-descriptions.json');
const checkOnly = process.argv.includes('--check');

function readExistingDataset(): MonsterVisualDataset | undefined {
  try {
    return JSON.parse(readFileSync(datasetPath, 'utf8')) as MonsterVisualDataset;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return undefined;
    throw error;
  }
}

function assertNoDuplicateOrOrphanedRecords(records: readonly MonsterVisualRecord[]): void {
  const validIds = new Set(ALL_MONSTERS.map((monster) => monster.id));
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.monsterId)) throw new Error(`Duplicate visual record: ${record.monsterId}`);
    if (!validIds.has(record.monsterId)) throw new Error(`Orphaned visual record: ${record.monsterId}`);
    seen.add(record.monsterId);
  }
}

function synchronizeRecord(monster: (typeof ALL_MONSTERS)[number], existing?: MonsterVisualRecord): MonsterVisualRecord {
  if (!existing) return createPendingVisualRecord(monster);

  const nextHash = visualInputHash(monster);
  const inputsChanged = existing.inputHash !== nextHash || existing.promptVersion !== MONSTER_IMAGE_PROMPT_VERSION;
  if (!inputsChanged) return existing;

  const wasApproved = existing.reviewStatus === 'approved';
  return {
    ...existing,
    monsterName: monster.name,
    sourceFacts: deriveSourceFacts(monster),
    reviewStatus: wasApproved ? 'needs-revision' : existing.reviewStatus,
    imageStatus: wasApproved || existing.imageStatus !== 'blocked' ? 'needs-revision' : 'blocked',
    promptVersion: MONSTER_IMAGE_PROMPT_VERSION,
    inputHash: nextHash,
  };
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function checkFile(filePath: string, expected: string): void {
  let actual = '';
  try {
    actual = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`${path.relative(projectRoot, filePath)} is missing. Run npm run visuals:sync.`);
  }
  if (actual !== expected) {
    throw new Error(`${path.relative(projectRoot, filePath)} is out of date. Run npm run visuals:sync.`);
  }
}

const existingDataset = readExistingDataset();
const existingRecords = existingDataset?.records ?? [];
assertNoDuplicateOrOrphanedRecords(existingRecords);
const existingById = new Map(existingRecords.map((record) => [record.monsterId, record]));

const records = [...ALL_MONSTERS]
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((monster) => synchronizeRecord(monster, existingById.get(monster.id)));

const dataset: MonsterVisualDataset = {
  schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
  promptVersion: MONSTER_IMAGE_PROMPT_VERSION,
  artBibleId: MONSTER_ART_BIBLE.id,
  source: {
    work: 'System Reference Document 5.2.1',
    creator: 'Wizards of the Coast LLC',
    sourceUrl: 'https://www.dndbeyond.com/srd',
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/legalcode',
    sourceCommit: BESTIARY_META.sourceCommit,
  },
  records,
};

const descriptionIndex: MonsterPhysicalDescriptionDataset = {
  schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
  sourceCommit: BESTIARY_META.sourceCommit,
  descriptions: Object.fromEntries(records.map((record) => [record.monsterId, record.appearance])),
};

const coverageErrors = validateMonsterVisualCoverage(ALL_MONSTERS, records);
if (coverageErrors.length > 0) throw new Error(coverageErrors.join('\n'));

const datasetJson = serialize(dataset);
const manifestJson = serialize(createBatchManifest(ALL_MONSTERS));
const descriptionIndexJson = serialize(descriptionIndex);

if (checkOnly) {
  checkFile(datasetPath, datasetJson);
  checkFile(manifestPath, manifestJson);
  checkFile(descriptionIndexPath, descriptionIndexJson);
  console.log(`Visual and runtime description artifacts are current: ${records.length} monsters across 12 batches.`);
} else {
  writeFileSync(datasetPath, datasetJson, 'utf8');
  writeFileSync(manifestPath, manifestJson, 'utf8');
  writeFileSync(descriptionIndexPath, descriptionIndexJson, 'utf8');
  console.log(`Synchronized ${records.length} monster visual records, runtime descriptions, and 12 deterministic batches.`);
}
