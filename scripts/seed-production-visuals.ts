import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { MonsterVisualBatchManifest, MonsterVisualDataset } from '../src/lib/monster-visuals';
import { PRODUCTION_01_04_DESCRIPTIONS } from './visual-descriptions/production-01-04';
import { PRODUCTION_05_07_DESCRIPTIONS } from './visual-descriptions/production-05-07';
import { PRODUCTION_08_11_DESCRIPTIONS } from './visual-descriptions/production-08-11';
import type { AuthoredVisual } from './visual-descriptions/types';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = path.join(projectRoot, 'src', 'data', 'monster-visuals.json');
const manifestPath = path.join(projectRoot, 'src', 'data', 'monster-visual-batches.json');

const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as MonsterVisualDataset;
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as MonsterVisualBatchManifest;

const groups = [
  {
    label: 'production batches 01-04',
    batchIds: ['production-01', 'production-02', 'production-03', 'production-04'],
    descriptions: PRODUCTION_01_04_DESCRIPTIONS,
  },
  {
    label: 'production batches 05-07',
    batchIds: ['production-05', 'production-06', 'production-07'],
    descriptions: PRODUCTION_05_07_DESCRIPTIONS,
  },
  {
    label: 'production batches 08-11',
    batchIds: ['production-08', 'production-09', 'production-10', 'production-11'],
    descriptions: PRODUCTION_08_11_DESCRIPTIONS,
  },
] as const;

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function assertSameIds(label: string, expected: readonly string[], actual: readonly string[]): void {
  const expectedIds = sorted(expected);
  const actualIds = sorted(actual);
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    const expectedSet = new Set(expectedIds);
    const actualSet = new Set(actualIds);
    const missing = expectedIds.filter((id) => !actualSet.has(id));
    const extra = actualIds.filter((id) => !expectedSet.has(id));
    throw new Error(`${label} ID mismatch. Missing: ${missing.join(', ') || 'none'}. Extra: ${extra.join(', ') || 'none'}.`);
  }
}

function validateDescription(monsterId: string, description: AuthoredVisual): void {
  const textFields = ['appearance', 'silhouette', 'pose', 'environment', 'altText'] as const;
  const listFields = ['materials', 'palette', 'mustInclude', 'mustAvoid'] as const;
  for (const field of textFields) {
    if (!description[field].trim()) throw new Error(`${monsterId}: ${field} is empty.`);
  }
  for (const field of listFields) {
    if (description[field].length === 0) throw new Error(`${monsterId}: ${field} is empty.`);
    if (description[field].some((value) => !value.trim())) throw new Error(`${monsterId}: ${field} contains a blank item.`);
    if (new Set(description[field]).size !== description[field].length) {
      throw new Error(`${monsterId}: ${field} contains duplicate items.`);
    }
  }
  if (description.appearance.length < 80) throw new Error(`${monsterId}: appearance is too brief.`);
  if (description.silhouette.length < 40) throw new Error(`${monsterId}: silhouette is too brief.`);
  if (description.altText.length > 220) throw new Error(`${monsterId}: altText exceeds 220 characters.`);
}

const allDescriptions: Record<string, AuthoredVisual> = {};
for (const group of groups) {
  const groupBatchIds = new Set<string>(group.batchIds);
  const expectedIds = manifest.batches
    .filter((batch) => groupBatchIds.has(batch.id))
    .flatMap((batch) => batch.monsterIds);
  assertSameIds(group.label, expectedIds, Object.keys(group.descriptions));
  for (const [monsterId, description] of Object.entries(group.descriptions)) {
    if (monsterId in allDescriptions) throw new Error(`Duplicate authored description: ${monsterId}`);
    validateDescription(monsterId, description);
    allDescriptions[monsterId] = description;
  }
}

const expectedProductionIds = manifest.batches
  .filter((batch) => batch.id !== 'pilot')
  .flatMap((batch) => batch.monsterIds);
assertSameIds('all production descriptions', expectedProductionIds, Object.keys(allDescriptions));

const recordsById = new Map(dataset.records.map((record) => [record.monsterId, record]));
const authoredFields = [
  'appearance',
  'silhouette',
  'materials',
  'pose',
  'palette',
  'mustInclude',
  'mustAvoid',
  'environment',
  'altText',
] as const;
let seeded = 0;
let preserved = 0;
for (const [monsterId, description] of Object.entries(allDescriptions)) {
  const record = recordsById.get(monsterId);
  if (!record) throw new Error(`Missing production visual record: ${monsterId}`);
  const existingDescription = Object.fromEntries(
    authoredFields.map((field) => [field, record[field]]),
  ) as AuthoredVisual;
  const hasAuthoredContent = authoredFields.some((field) =>
    Array.isArray(record[field]) ? record[field].length > 0 : record[field].trim().length > 0,
  );
  if (hasAuthoredContent) {
    if (JSON.stringify(existingDescription) !== JSON.stringify(description)) {
      throw new Error(`Refusing to overwrite an edited description: ${monsterId}`);
    }
    preserved += 1;
    continue;
  }
  Object.assign(record, description, {
    confidence: 'reference-derived',
    reviewStatus: 'pending',
    imageStatus: 'blocked',
  });
  seeded += 1;
}

writeFileSync(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`Production descriptions: seeded=${seeded}, preserved=${preserved}.`);
