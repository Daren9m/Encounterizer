import physicalDescriptionData from './monster-physical-descriptions.json';
import type { MonsterPhysicalDescriptionDataset } from '@/lib/monster-visuals';

const dataset = physicalDescriptionData as MonsterPhysicalDescriptionDataset;

export function getMonsterPhysicalDescription(monsterId: string): string | undefined {
  const description = dataset.descriptions[monsterId];
  return description?.trim() ? description : undefined;
}
