import visualDatasetJson from './monster-visuals.json';
import type { MonsterVisualDataset, MonsterVisualRecord } from '@/lib/monster-visuals';

export const MONSTER_VISUAL_DATASET = visualDatasetJson as MonsterVisualDataset;

const visualByMonsterId = new Map(
  MONSTER_VISUAL_DATASET.records.map((record) => [record.monsterId, record] as const),
);

export function getMonsterVisual(monsterId: string): MonsterVisualRecord | undefined {
  return visualByMonsterId.get(monsterId);
}
