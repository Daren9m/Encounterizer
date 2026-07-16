import { describe, expect, it } from 'vitest';

import { ALL_MONSTERS } from '@/data';
import batchManifestJson from '@/data/monster-visual-batches.json';
import physicalDescriptionJson from '@/data/monster-physical-descriptions.json';
import visualDatasetJson from '@/data/monster-visuals.json';
import { getMonsterImage } from '@/data/monster-visual-index';
import {
  PILOT_MONSTER_IDS,
  compileMonsterImagePrompt,
  createBatchManifest,
  createPendingVisualRecord,
  validateMonsterVisualCoverage,
  visualInputHash,
  type MonsterVisualBatchManifest,
  type MonsterVisualDataset,
  type MonsterPhysicalDescriptionDataset,
} from '@/lib/monster-visuals';
import { makeMonster } from './test-helpers';

describe('monster visual pipeline', () => {
  it('assigns all 331 monsters to the fixed pilot and deterministic production batches', () => {
    const manifest = createBatchManifest(ALL_MONSTERS);
    const assignments = manifest.batches.flatMap((batch) => batch.monsterIds);

    expect(manifest.totalMonsters).toBe(331);
    expect(manifest.batches).toHaveLength(12);
    expect(manifest.batches[0].monsterIds).toEqual(PILOT_MONSTER_IDS);
    expect(manifest.batches.map((batch) => batch.count)).toEqual([
      14, 29, 29, 29, 29, 29, 29, 29, 29, 29, 28, 28,
    ]);
    expect(assignments).toHaveLength(331);
    expect(new Set(assignments).size).toBe(331);
    expect(new Set(assignments)).toEqual(new Set(ALL_MONSTERS.map((monster) => monster.id)));
    const pilotTypes = PILOT_MONSTER_IDS.map(
      (id) => ALL_MONSTERS.find((monster) => monster.id === id)?.type,
    );
    expect(new Set(pilotTypes).size).toBe(14);
  });

  it('keeps generated artifacts in sync with the pure batch and coverage rules', () => {
    const dataset = visualDatasetJson as MonsterVisualDataset;
    const manifest = batchManifestJson as MonsterVisualBatchManifest;

    expect(dataset.records).toHaveLength(331);
    expect(validateMonsterVisualCoverage(ALL_MONSTERS, dataset.records)).toEqual([]);
    expect(manifest).toEqual(createBatchManifest(ALL_MONSTERS));
  });

  it('has complete descriptions for every monster with pending images gated', () => {
    const dataset = visualDatasetJson as MonsterVisualDataset;
    expect(dataset.records).toHaveLength(331);

    for (const record of dataset.records) {
      expect(record.appearance, record.monsterId).not.toBe('');
      expect(record.silhouette, record.monsterId).not.toBe('');
      expect(record.materials.length, record.monsterId).toBeGreaterThan(0);
      expect(record.pose, record.monsterId).not.toBe('');
      expect(record.palette.length, record.monsterId).toBeGreaterThan(0);
      expect(record.mustInclude.length, record.monsterId).toBeGreaterThan(0);
      expect(record.mustAvoid.length, record.monsterId).toBeGreaterThan(0);
      expect(record.environment, record.monsterId).not.toBe('');
      expect(record.altText, record.monsterId).not.toBe('');
      if (record.reviewStatus === 'pending') {
        expect(record.imageStatus, record.monsterId).toBe('blocked');
      }
    }
  });

  it('keeps the slim runtime description index aligned with the visual sidecar', () => {
    const dataset = visualDatasetJson as MonsterVisualDataset;
    const runtimeIndex = physicalDescriptionJson as MonsterPhysicalDescriptionDataset;

    expect(Object.keys(runtimeIndex.descriptions)).toHaveLength(331);
    expect(runtimeIndex.sourceCommit).toBe(dataset.source.sourceCommit);
    for (const record of dataset.records) {
      expect(runtimeIndex.descriptions[record.monsterId], record.monsterId).toBe(record.appearance);
    }
  });

  it('publishes stable WebP URLs only for image statuses backed by audited assets', () => {
    const dataset = visualDatasetJson as MonsterVisualDataset;
    const published = dataset.records.filter((record) =>
      ['draft', 'approved', 'needs-revision'].includes(record.imageStatus),
    );

    expect(published.length).toBeGreaterThan(0);
    for (const record of published) {
      expect(getMonsterImage(record.monsterId)).toEqual({
        src: `/images/monsters/${record.monsterId}.webp`,
        alt: record.altText,
      });
    }

    const unavailable = dataset.records.find((record) =>
      ['blocked', 'ready'].includes(record.imageStatus),
    );
    expect(unavailable).toBeDefined();
    expect(getMonsterImage(unavailable!.monsterId)).toBeUndefined();
    expect(getMonsterImage('custom-monster')).toBeUndefined();
  });

  it('hashes visual inputs while ignoring combat-only numeric changes', () => {
    const monster = makeMonster();
    expect(visualInputHash({ ...monster, hitPoints: 999 })).toBe(visualInputHash(monster));
    expect(visualInputHash({ ...monster, size: 'Large' })).not.toBe(visualInputHash(monster));
    expect(
      visualInputHash({ ...monster, actions: [{ ...monster.actions[0], name: 'Claw' }] }),
    ).not.toBe(visualInputHash(monster));
  });

  it('reports missing, duplicate, orphaned, and stale records', () => {
    const first = makeMonster({ id: 'first', name: 'First' });
    const second = makeMonster({ id: 'second', name: 'Second' });
    const firstRecord = createPendingVisualRecord(first);
    const errors = validateMonsterVisualCoverage(
      [first, second],
      [firstRecord, firstRecord, { ...createPendingVisualRecord(second), monsterId: 'orphan' }],
    );

    expect(errors).toContain('Duplicate visual record: first');
    expect(errors).toContain('Orphaned visual record: orphan');
    expect(errors).toContain('Missing visual record: second');

    const staleErrors = validateMonsterVisualCoverage([first], [{ ...firstRecord, inputHash: 'old' }]);
    expect(staleErrors).toContain('Stale visual record: first');
  });

  it('blocks unapproved descriptions and compiles a structured approved prompt', () => {
    const monster = makeMonster();
    const pending = createPendingVisualRecord(monster);
    expect(() => compileMonsterImagePrompt(monster, pending)).toThrow('not approved');

    const approved = {
      ...pending,
      appearance: 'A lean, wolf-like forest predator with long ears and a narrow muzzle.',
      silhouette: 'Low shoulders, arched back, long tail, and oversized upright ears.',
      materials: ['coarse charcoal fur', 'weathered claws'],
      pose: 'Alert and advancing cautiously, head lowered and ears forward.',
      palette: ['charcoal', 'moss green', 'muted amber'],
      mustInclude: ['four legs', 'long upright ears'],
      mustAvoid: ['collar', 'saddle'],
      environment: 'A dim forest floor with soft moss and distant tree trunks',
      altText: 'A lean charcoal-furred fantasy predator stalking across a mossy forest floor.',
      reviewStatus: 'approved' as const,
      imageStatus: 'ready' as const,
    };
    const prompt = compileMonsterImagePrompt(monster, approved);

    expect(prompt).toContain('Subject:');
    expect(prompt).toContain('Silhouette:');
    expect(prompt).toContain('Composition:');
    expect(prompt).toContain('Must include: four legs; long upright ears.');
    expect(prompt).toContain('Avoid:');
  });
});
