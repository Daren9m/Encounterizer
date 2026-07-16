import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALL_MONSTERS } from '../src/data';
import {
  validateMonsterVisualCoverage,
  type MonsterVisualDataset,
  type MonsterVisualRecord,
} from '../src/lib/monster-visuals';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataset = JSON.parse(
  readFileSync(path.join(projectRoot, 'src', 'data', 'monster-visuals.json'), 'utf8'),
) as MonsterVisualDataset;
const errors = validateMonsterVisualCoverage(ALL_MONSTERS, dataset.records);

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function checkWords(
  record: MonsterVisualRecord,
  field: 'appearance' | 'silhouette' | 'pose' | 'environment' | 'altText',
  minimum: number,
  maximum: number,
): void {
  const count = wordCount(record[field]);
  if (count < minimum || count > maximum) {
    errors.push(`${record.monsterId}: ${field} has ${count} words; expected ${minimum}-${maximum}.`);
  }
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const exactTextOwners = new Map<string, string>();
for (const record of dataset.records) {
  checkWords(record, 'appearance', 20, 85);
  checkWords(record, 'silhouette', 7, 40);
  checkWords(record, 'pose', 7, 40);
  checkWords(record, 'environment', 6, 40);
  checkWords(record, 'altText', 7, 35);
  if (record.altText.length > 220) errors.push(`${record.monsterId}: altText exceeds 220 characters.`);
  if (record.sourceFacts.length === 0) errors.push(`${record.monsterId}: sourceFacts is empty.`);

  for (const field of ['materials', 'palette', 'mustInclude', 'mustAvoid'] as const) {
    const values = record[field];
    if (values.length < 2 || values.length > 8) {
      errors.push(`${record.monsterId}: ${field} has ${values.length} items; expected 2-8.`);
    }
    if (new Set(values.map(normalized)).size !== values.length) {
      errors.push(`${record.monsterId}: ${field} contains duplicate items.`);
    }
  }

  for (const field of ['appearance', 'silhouette', 'pose', 'altText'] as const) {
    const value = normalized(record[field]);
    if (!value) continue;
    const key = `${field}:${value}`;
    const owner = exactTextOwners.get(key);
    if (owner) errors.push(`${record.monsterId}: ${field} duplicates ${owner}.`);
    else exactTextOwners.set(key, record.monsterId);
  }

  const combined = `${record.appearance} ${record.silhouette} ${record.pose}`.toLowerCase();
  if (/\bin the style of\b|\bstyle of [a-z]+\b/.test(combined)) {
    errors.push(`${record.monsterId}: description contains a named-style instruction.`);
  }
}

if (errors.length > 0) {
  throw new Error(`Visual description audit failed with ${errors.length} error(s):\n${errors.join('\n')}`);
}

const statuses = dataset.records.reduce<Record<string, number>>((counts, record) => {
  counts[record.reviewStatus] = (counts[record.reviewStatus] ?? 0) + 1;
  return counts;
}, {});
console.log(`Audited ${dataset.records.length} complete, unique visual descriptions.`);
console.log(`Review status: ${Object.entries(statuses).map(([status, count]) => `${status}=${count}`).join(', ')}.`);
